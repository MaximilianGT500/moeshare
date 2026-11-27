'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const i18n = require('../lib/i18n');
const { berlinDay, formatBytes } = require('../lib/format');
const settings = require('./settingsService');
const mail = require('./mailService');

const log = logger.scope('retention');

const DAY = 24 * 60 * 60 * 1000;
const BATCH = 500;
const MAX_PER_RUN = 5000;
const RUN_EVERY_MS = 20 * 60 * 60 * 1000;
const ACTIVITY = "SELECT 1 FROM stats_daily s WHERE s.kind = 'f' AND s.ref_id = f.id AND (s.views > 0 OR s.downloads > 0 OR s.direct > 0)";

const daysOf = (choice) => (choice && choice !== 'off' ? Number(String(choice).replace(/d$/, '')) || 0 : 0);

function rules() {
  const unused = daysOf(settings.get('retention.unused'));
  const grace = daysOf(settings.get('retention.grace')) || 7;
  const stats = settings.get('stats.retentionDays');
  const counting = settings.get('stats.enabled') !== false;
  return {
    enabled: unused > 0,
    unused,
    grace,
    admins: Boolean(settings.get('retention.admins')),
    blocked: unused > 0 ? (!counting ? 'statsOff' : unused > stats ? 'stats' : null) : null,
    statsDays: stats,
  };
}

async function history(rule, now) {
  const row = await db.get('SELECT MIN(day) AS first FROM stats_daily', []);
  const since = row && row.first ? String(row.first) : null;
  return { since, enough: Boolean(since) && since <= berlinDay(new Date(now - rule.unused * DAY)) };
}

async function guarded(now) {
  const rule = rules();
  if (!rule.enabled || rule.blocked) return { ...rule, since: null };
  const known = await history(rule, now);
  return { ...rule, since: known.since, blocked: known.enough ? null : 'history' };
}

function where(rule, now) {
  const conditions = [
    'f.deleted_at IS NULL',
    'f.starred_at IS NULL',
    'f.expires_at IS NULL',
    'f.blocked_at IS NULL',
    'f.publish_at IS NULL',
    "u.status = 'active'",
    'f.created_at < ?',
    `NOT EXISTS (${ACTIVITY} AND s.day >= ?)`,
  ];
  const params = [now - rule.unused * DAY, berlinDay(new Date(now - rule.unused * DAY))];
  if (!rule.admins) conditions.push("u.role <> 'admin'");
  return { sql: conditions.join(' AND '), params };
}

const FROM = 'file_data f JOIN users u ON u.username = f.username';

async function preview({ now = Date.now() } = {}) {
  const rule = await guarded(now);
  const pending = await db.get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(f.size_bytes), 0) AS bytes FROM ${FROM} WHERE f.retention_at IS NOT NULL AND f.deleted_at IS NULL AND f.expires_at > ?`,
    [now]
  );
  const base = { ...rule, pending: { count: Number(pending.count) || 0, bytes: Number(pending.bytes) || 0 }, lastRun: await lastRun() };
  if (!rule.enabled || rule.blocked) return { ...base, count: 0, bytes: 0, users: [] };
  const filter = where(rule, now);
  const total = await db.get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(f.size_bytes), 0) AS bytes FROM ${FROM} WHERE ${filter.sql}`,
    filter.params
  );
  const users = await db.all(
    `SELECT f.username, COUNT(*) AS count, COALESCE(SUM(f.size_bytes), 0) AS bytes FROM ${FROM} WHERE ${filter.sql}
     GROUP BY f.username ORDER BY COALESCE(SUM(f.size_bytes), 0) DESC LIMIT 5`,
    filter.params
  );
  return {
    ...base,
    count: Number(total.count) || 0,
    bytes: Number(total.bytes) || 0,
    users: users.map((row) => ({ username: row.username, count: Number(row.count) || 0, bytes: Number(row.bytes) || 0 })),
  };
}

async function lastRun() {
  const meta = await settings.readMeta('retention').catch(() => null);
  return meta && meta.at ? meta : null;
}

async function release(now) {
  const revived = await db.all(
    `SELECT f.id FROM file_data f WHERE f.retention_at IS NOT NULL AND f.deleted_at IS NULL AND f.expires_at > ?
     AND EXISTS (SELECT 1 FROM stats_daily s WHERE s.kind = 'f' AND s.ref_id = f.id AND (s.views > 0 OR s.downloads > 0 OR s.direct > 0) AND s.day >= ?)`,
    [now, berlinDay(new Date(now - 2 * DAY))]
  );
  const ids = revived.map((row) => Number(row.id));
  for (let index = 0; index < ids.length; index += BATCH) {
    const part = ids.slice(index, index + BATCH);
    await db.run(`UPDATE file_data SET expires_at = NULL, retention_at = NULL WHERE id IN (${part.map(() => '?').join(', ')})`, part);
  }
  return ids.length;
}

async function cancelAll() {
  const { changes } = await db.run(
    'UPDATE file_data SET expires_at = NULL, retention_at = NULL WHERE retention_at IS NOT NULL AND deleted_at IS NULL',
    []
  );
  return changes || 0;
}

function message(language, entry, grace) {
  const t = (text, values) => i18n.translate(language, text, values);
  const subject =
    entry.count === 1
      ? t('Eine Datei läuft in {days} Tagen ab', { days: grace })
      : t('{count} Dateien laufen in {days} Tagen ab', { count: entry.count, days: grace });
  const url = `${settings.get('site.baseUrl')}/dashboard#aufraeumen`;
  return {
    subject,
    title: subject,
    paragraphs: [
      t('Auf {site} wurden diese Dateien lange nicht aufgerufen: {count} Dateien mit {size}.', {
        site: settings.get('site.title'),
        count: entry.count,
        size: formatBytes(entry.bytes),
      }),
      t(
        'Ohne neue Aufrufe landen sie in {days} Tagen im Papierkorb. Willst du sie behalten, markier sie mit einem Stern oder nimm die Ablaufzeit heraus.',
        {
          days: grace,
        }
      ),
    ],
    button: { label: t('Im Dashboard ansehen'), url },
    footer: t('Diese Hinweise schaltest du unter Konto › Einstellungen ab.'),
    push: { title: subject, body: t('Markier sie mit einem Stern, um sie zu behalten.'), url, tag: 'retention' },
  };
}

async function run({ now = Date.now(), force = false } = {}) {
  const rule = await guarded(now);
  if (!rule.enabled) {
    const cancelled = await cancelAll();
    if (cancelled) {
      cache.clear();
      log.info('Aufbewahrungsregel aus, Ablaufzeiten zurückgenommen', { files: cancelled });
    }
    return { marked: 0, released: 0, cancelled };
  }
  if (rule.blocked) return { marked: 0, released: 0, cancelled: 0, blocked: rule.blocked };
  const previous = await lastRun();
  if (!force && previous && now - Number(previous.at) < RUN_EVERY_MS) return { marked: 0, released: 0, cancelled: 0, skipped: true };
  const released = await release(now);
  const filter = where(rule, now);
  const expiresAt = now + rule.grace * DAY;
  const owners = new Map();
  let marked = 0;
  while (marked < MAX_PER_RUN) {
    const rows = await db.all(`SELECT f.id, f.size_bytes, u.id AS user_id FROM ${FROM} WHERE ${filter.sql} ORDER BY f.id LIMIT ?`, [
      ...filter.params,
      BATCH,
    ]);
    if (!rows.length) break;
    const ids = rows.map((row) => Number(row.id));
    await db.run(
      `UPDATE file_data SET expires_at = ?, retention_at = ? WHERE id IN (${ids.map(() => '?').join(', ')}) AND expires_at IS NULL`,
      [expiresAt, now, ...ids]
    );
    for (const row of rows) {
      const entry = owners.get(Number(row.user_id)) || { count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += Number(row.size_bytes) || 0;
      owners.set(Number(row.user_id), entry);
    }
    marked += rows.length;
    if (rows.length < BATCH) break;
  }
  if (marked || released) cache.clear();
  for (const [userId, entry] of owners) {
    await mail
      .notifyUser(userId, 'retention', (language) => message(language, entry, rule.grace))
      .catch((error) => log.warn('Hinweis zur Aufbewahrung ließ sich nicht senden', { error }));
  }
  await settings.writeMeta('retention', { at: now, marked, released, users: owners.size });
  if (marked) log.info('Unbenutzte Dateien laufen bald ab', { files: marked, users: owners.size, days: rule.grace });
  return { marked, released, cancelled: 0, users: owners.size };
}

async function tick() {
  return run().catch((error) => {
    log.warn('Die Aufbewahrungsregel ließ sich nicht anwenden', { error });
    return null;
  });
}

module.exports = { rules, preview, run, tick, cancelAll };
