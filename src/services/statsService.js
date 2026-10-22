'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const { berlinDay } = require('../lib/format');
const { isCrawler, platformOf } = require('../lib/crawlers');
const settings = require('./settingsService');
const domains = require('./domainService');

const log = logger.scope('stats');

const KINDS = ['f', 'l', 'a', 'p'];
const COUNTERS = ['views', 'downloads', 'direct', 'previews'];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 365;

const enabled = () => settings.get('stats.enabled');

function ownHosts() {
  return [settings.get('site.baseUrl'), ...settings.get('site.domains')].map((origin) => new URL(origin).hostname.toLowerCase());
}

function refererSource(req) {
  const referer = req.get('referer') || req.get('referrer');
  if (!referer) return null;
  let host;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || ownHosts().includes(host) || domains.ownerOfHost(host)) return null;
  return host.replace(/^www\./, '').slice(0, 100);
}

const isInternal = (req) => {
  const referer = req.get('referer');
  if (!referer) return false;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    return ownHosts().includes(host) || Boolean(domains.ownerOfHost(host));
  } catch {
    return false;
  }
};

async function record(kind, refId, counter, { source = null, now = Date.now() } = {}) {
  if (!enabled() || !KINDS.includes(kind) || !COUNTERS.includes(counter) || !refId) return;
  try {
    const id = Number(refId);
    await db.increment(
      'stats_daily',
      { kind, ref_id: id, day: berlinDay(new Date(now)) },
      Object.fromEntries(COUNTERS.map((name) => [name, name === counter ? 1 : 0]))
    );
    if (source)
      await db.increment('stats_sources', { kind, ref_id: id, source: String(source).slice(0, 100) }, { hits: 1 }, { last_at: now });
  } catch (error) {
    log.debug('Statistik nicht gespeichert', { kind, id: refId, error });
  }
}

function track(req, kind, refId, counter) {
  const agent = req.get('user-agent');
  const crawler = isCrawler(agent);
  const field = crawler && counter === 'views' ? 'previews' : counter;
  const source = crawler ? platformOf(agent) : refererSource(req);
  return record(kind, refId, field, { source });
}

function lastDays(count, today = berlinDay()) {
  const end = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end.getTime() - (count - 1 - index) * DAY_MS);
    return day.toISOString().slice(0, 10);
  });
}

const empty = () => Object.fromEntries(COUNTERS.map((name) => [name, 0]));

function toCounts(row) {
  return Object.fromEntries(COUNTERS.map((name) => [name, Number(row && row[name]) || 0]));
}

async function series(kind, refId, { days = 30 } = {}) {
  const span = Math.min(MAX_DAYS, Math.max(7, Number.parseInt(days, 10) || 30));
  const list = lastDays(span);
  const rows = await db.all(`SELECT day, ${COUNTERS.join(', ')} FROM stats_daily WHERE kind = ? AND ref_id = ? AND day >= ? ORDER BY day`, [
    kind,
    Number(refId),
    list[0],
  ]);
  const byDay = new Map(rows.map((row) => [row.day, toCounts(row)]));
  const totals = await db.get(
    `SELECT ${COUNTERS.map((name) => `COALESCE(SUM(${name}), 0) AS ${name}`).join(', ')} FROM stats_daily WHERE kind = ? AND ref_id = ?`,
    [kind, Number(refId)]
  );
  const sources = await db.all(
    'SELECT source, hits, last_at FROM stats_sources WHERE kind = ? AND ref_id = ? ORDER BY hits DESC, last_at DESC LIMIT 12',
    [kind, Number(refId)]
  );
  return {
    enabled: enabled(),
    retentionDays: settings.get('stats.retentionDays'),
    days: list.map((day) => ({ day, ...(byDay.get(day) || empty()) })),
    totals: toCounts(totals),
    sources: sources.map((row) => ({ source: row.source, hits: Number(row.hits) || 0, lastAt: Number(row.last_at) || null })),
  };
}

async function overview(username, { days = 30 } = {}) {
  const span = Math.min(MAX_DAYS, Math.max(7, Number.parseInt(days, 10) || 30));
  const list = lastDays(span);
  const own = "s.kind = 'f' AND s.ref_id IN (SELECT id FROM file_data WHERE username = ? AND deleted_at IS NULL)";
  const rows = await db.all(
    `SELECT s.day, ${COUNTERS.map((name) => `SUM(s.${name}) AS ${name}`).join(', ')} FROM stats_daily s
     WHERE ${own} AND s.day >= ? GROUP BY s.day ORDER BY s.day`,
    [username, list[0]]
  );
  const byDay = new Map(rows.map((row) => [row.day, toCounts(row)]));
  const top = await db.all(
    `SELECT s.ref_id, SUM(s.views + s.downloads + s.direct) AS total, ${COUNTERS.map((name) => `SUM(s.${name}) AS ${name}`).join(', ')}
     FROM stats_daily s WHERE ${own} AND s.day >= ? GROUP BY s.ref_id ORDER BY SUM(s.views + s.downloads + s.direct) DESC LIMIT 5`,
    [username, list[0]]
  );
  const sources = await db.all(
    `SELECT s.source, SUM(s.hits) AS hits FROM stats_sources s WHERE ${own} GROUP BY s.source ORDER BY SUM(s.hits) DESC LIMIT 8`,
    [username]
  );
  return {
    enabled: enabled(),
    days: list.map((day) => ({ day, ...(byDay.get(day) || empty()) })),
    top: top.map((row) => ({ id: Number(row.ref_id), total: Number(row.total) || 0, ...toCounts(row) })),
    sources: sources.map((row) => ({ source: row.source, hits: Number(row.hits) || 0 })),
  };
}

async function forget(kind, refId) {
  await db.run('DELETE FROM stats_daily WHERE kind = ? AND ref_id = ?', [kind, Number(refId)]);
  await db.run('DELETE FROM stats_sources WHERE kind = ? AND ref_id = ?', [kind, Number(refId)]);
}

async function prune(now = Date.now()) {
  const days = settings.get('stats.retentionDays');
  const cutoff = lastDays(days + 1, berlinDay(new Date(now)))[0];
  const daily = await db.run('DELETE FROM stats_daily WHERE day < ?', [cutoff]);
  const sources = await db.run('DELETE FROM stats_sources WHERE last_at < ?', [now - days * DAY_MS]);
  return daily.changes + sources.changes;
}

module.exports = {
  COUNTERS,
  enabled,
  isCrawler,
  platformOf,
  refererSource,
  isInternal,
  record,
  track,
  series,
  overview,
  forget,
  prune,
  lastDays,
};
