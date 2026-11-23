'use strict';

const config = require('../config');
const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const i18n = require('../lib/i18n');
const { berlinDay, berlinParts, formatBytes } = require('../lib/format');
const files = require('./fileService');
const mail = require('./mailService');
const reactions = require('./reactionService');
const settings = require('./settingsService');
const users = require('./userService');

const log = logger.scope('notices');
const { translate } = i18n;

const MAX_LINES = 5;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const QUOTA_WARN = 0.9;
const QUOTA_RESET = 0.8;
const EXPIRY_WINDOW_MS = DAY;
const EXPIRY_MIN_LIFETIME_MS = 3 * DAY;
const MAX_USERS = 5000;

const quoted = (language, name) => (language === 'en' ? `“${name}”` : `„${name}“`);

function fileName(row) {
  return row.title || row.original_name || row.filename;
}

async function targetsOf(rows) {
  const fileIds = rows.filter((row) => row.kind === 'f').map((row) => Number(row.ref_id));
  const albumIds = rows.filter((row) => row.kind === 'a').map((row) => Number(row.ref_id));
  const result = new Map();
  if (fileIds.length) {
    const list = await db.all(`SELECT * FROM file_data WHERE id IN (${fileIds.map(() => '?').join(', ')}) AND deleted_at IS NULL`, fileIds);
    for (const row of list) result.set(`f${row.id}`, { name: fileName(row), url: files.urlsFor(row).view });
  }
  if (albumIds.length) {
    const list = await db.all(`SELECT id, code, title FROM albums WHERE id IN (${albumIds.map(() => '?').join(', ')})`, albumIds);
    for (const row of list) {
      result.set(`a${row.id}`, { name: row.title, url: `${settings.get('site.baseUrl')}/a/${encodeURIComponent(row.code)}` });
    }
  }
  return result;
}

function reactionMessage(language, entries) {
  const t = (text, values) => i18n.translate(language, text, values);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const first = entries[0];
  const subject =
    entries.length === 1
      ? total === 1
        ? t('Neue Reaktion auf {name}', { name: quoted(language, first.name) })
        : t('{count} neue Reaktionen auf {name}', { count: total, name: quoted(language, first.name) })
      : t('{count} neue Reaktionen auf {items} Uploads', { count: total, items: entries.length });
  const lines = entries
    .slice(0, MAX_LINES)
    .map((entry) =>
      entry.count === 1
        ? t('{name}: eine Reaktion', { name: quoted(language, entry.name) })
        : t('{name}: {count} Reaktionen', { name: quoted(language, entry.name), count: entry.count })
    );
  if (entries.length > MAX_LINES) lines.push(t('und {count} weitere', { count: entries.length - MAX_LINES }));
  const url = entries.length === 1 ? first.url : `${settings.get('site.baseUrl')}/dashboard#statistik`;
  return {
    subject,
    title: subject,
    paragraphs: [t('Besucher haben auf deine Uploads reagiert.'), ...lines],
    button: { label: entries.length === 1 ? t('Ansehen') : t('Statistik öffnen'), url },
    footer: t('Diese Hinweise schaltest du unter Konto › Einstellungen ab.'),
    push: { title: subject, body: lines.join(' · '), url, tag: 'reactions' },
  };
}

async function deliverReactions(now = Date.now()) {
  const rows = await reactions.due(now);
  if (!rows.length) return 0;
  await reactions.clear(rows);
  const targets = await targetsOf(rows);
  const byUser = new Map();
  for (const row of rows) {
    const target = targets.get(`${row.kind}${row.ref_id}`);
    if (!target) continue;
    const list = byUser.get(Number(row.user_id)) || [];
    list.push({ ...target, count: Number(row.reactions) || 0 });
    byUser.set(Number(row.user_id), list);
  }
  let sent = 0;
  for (const [userId, entries] of byUser) {
    const merged = entries.filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count);
    if (!merged.length) continue;
    await mail
      .notifyUser(userId, 'reactions', (language) => reactionMessage(language, merged))
      .then(() => {
        sent += 1;
      })
      .catch((error) => log.warn('Hinweis auf Reaktionen ließ sich nicht senden', { error }));
  }
  return sent;
}

function memoryMessage(language, groups) {
  const t = (text, values) => i18n.translate(language, text, values);
  const count = groups.reduce((sum, group) => sum + group.files.length, 0);
  const subject = count === 1 ? t('An diesem Tag: eine Erinnerung') : t('An diesem Tag: {count} Erinnerungen', { count });
  const lines = groups.map((group) => {
    const ago = group.years === 1 ? t('Vor 1 Jahr') : t('Vor {count} Jahren', { count: group.years });
    return group.files.length === 1
      ? t('{ago}: {name}', { ago, name: quoted(language, group.files[0].title || group.files[0].originalName || group.files[0].filename) })
      : t('{ago}: {count} Dateien', { ago, count: group.files.length });
  });
  const url = `${settings.get('site.baseUrl')}/dashboard`;
  return {
    subject,
    title: subject,
    paragraphs: [t('Das hast du am heutigen Tag in früheren Jahren hochgeladen.'), ...lines],
    button: { label: t('Im Dashboard ansehen'), url },
    footer: t('Diese Hinweise schaltest du unter Konto › Einstellungen ab.'),
    push: { title: subject, body: lines.join(' · '), url, tag: 'memories' },
  };
}

async function memoryCandidates() {
  const rows = await db.all(
    `SELECT u.id, u.username, u.preferences FROM users u WHERE u.status = 'active' AND (u.preferences LIKE ? OR EXISTS (
       SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id AND p.events LIKE ?))`,
    ['%"memories":true%', '%"memories":true%']
  );
  return rows;
}

async function deliverMemories(now = new Date()) {
  if (Number(berlinParts(now).hour) < config.memoryHour) return 0;
  const token = await ephemeral.acquire(`memories:${berlinDay(now)}`, 30 * 60 * 60 * 1000).catch(() => null);
  if (!token) return 0;
  let sent = 0;
  for (const row of await memoryCandidates()) {
    const groups = await files.memoriesFor(row.username, { now, limit: 12 }).catch(() => []);
    if (!groups.length) continue;
    await mail
      .notifyUser(row.id, 'memories', (language) => memoryMessage(language, groups))
      .then(() => {
        sent += 1;
      })
      .catch((error) => log.warn('Hinweis auf Erinnerungen ließ sich nicht senden', { error }));
  }
  return sent;
}

const numberIn = (language, value) => new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE').format(value);
const bytesIn = (language, value) => (language === 'en' ? formatBytes(value).replace(/(\d),(\d)/, '$1.$2') : formatBytes(value));

function digestMessage(language, data) {
  const t = (text, values) => translate(language, text, values);
  const subject = t('Deine Woche bei {site}', { site: settings.get('site.title') });
  const lines = [];
  if (data.uploads) {
    lines.push(
      data.uploads === 1
        ? t('Diese Woche: ein neuer Upload mit {size}.', { size: bytesIn(language, data.bytes) })
        : t('Diese Woche: {count} neue Uploads mit zusammen {size}.', {
            count: numberIn(language, data.uploads),
            size: bytesIn(language, data.bytes),
          })
    );
  } else {
    lines.push(t('Diese Woche hast du nichts hochgeladen.'));
  }
  if (data.views !== null) {
    lines.push(
      data.views === 1
        ? t('Deine Dateien wurden einmal aufgerufen.')
        : t('Deine Dateien wurden {count}-mal aufgerufen.', { count: numberIn(language, data.views) })
    );
  }
  if (data.top)
    lines.push(
      t('Am beliebtesten: {name} mit {count} Aufrufen.', {
        name: quoted(language, data.top.name),
        count: numberIn(language, data.top.views),
      })
    );
  if (data.quotaBytes) {
    lines.push(
      t('Speicher: {used} von {total} belegt ({percent} %).', {
        used: bytesIn(language, data.usedBytes),
        total: bytesIn(language, data.quotaBytes),
        percent: Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100)),
      })
    );
  } else {
    lines.push(t('Speicher: {used} belegt.', { used: bytesIn(language, data.usedBytes) }));
  }
  const url = `${settings.get('site.baseUrl')}/dashboard`;
  return {
    subject,
    title: subject,
    paragraphs: lines,
    button: { label: t('Dashboard öffnen'), url },
    footer: t('Diese Hinweise schaltest du unter Konto › Einstellungen ab.'),
    push: { title: subject, body: lines.slice(0, 2).join(' '), url, tag: 'digest' },
  };
}

function quotaMessage(language, data) {
  const t = (text, values) => translate(language, text, values);
  const percent = Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100));
  const subject = t('Dein Speicher ist zu {percent} % voll', { percent });
  const url = `${settings.get('site.baseUrl')}/dashboard#aufraeumen`;
  const lines = [
    t('Du nutzt {used} von {total}.', { used: bytesIn(language, data.usedBytes), total: bytesIn(language, data.quotaBytes) }),
    t('Wenn er voll ist, gehen keine Uploads mehr. Räum alte oder große Dateien auf oder frag einen Admin nach mehr Platz.'),
  ];
  return {
    subject,
    title: subject,
    paragraphs: lines,
    button: { label: t('Aufräumen'), url },
    footer: t('Diese Hinweise schaltest du unter Konto › Einstellungen ab.'),
    push: { title: subject, body: lines[0], url, tag: 'quota' },
  };
}

function expiringMessage(language, rows) {
  const t = (text, values) => translate(language, text, values);
  const subject = rows.length === 1 ? t('Eine Datei läuft bald ab') : t('{count} Dateien laufen bald ab', { count: rows.length });
  const format = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const lines = rows
    .slice(0, MAX_LINES)
    .map((row) => t('{name}: {when}', { name: quoted(language, fileName(row)), when: format.format(new Date(Number(row.expires_at))) }));
  if (rows.length > MAX_LINES) lines.push(t('und {count} weitere', { count: rows.length - MAX_LINES }));
  const url = rows.length === 1 ? files.urlsFor(rows[0]).view : `${settings.get('site.baseUrl')}/dashboard`;
  return {
    subject,
    title: subject,
    paragraphs: [
      t('Diese Uploads werden in den nächsten 24 Stunden gelöscht:'),
      ...lines,
      t('Willst du etwas behalten, nimm im Dashboard das Ablaufdatum heraus.'),
    ],
    button: { label: t('Im Dashboard ansehen'), url: `${settings.get('site.baseUrl')}/dashboard` },
    footer: t('Diese Hinweise schaltest du unter Konto › Einstellungen ab.'),
    push: { title: subject, body: lines.join(' · '), url, tag: 'expiring' },
  };
}

const wanting = (key) =>
  db.all(
    `SELECT u.id, u.username, u.preferences, u.quota_bytes, u.max_file_bytes FROM users u WHERE u.status = 'active' AND (u.preferences LIKE ? OR EXISTS (
       SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id AND p.events LIKE ?)) LIMIT ${MAX_USERS}`,
    [`%"${key}":true%`, `%"${key}":true%`]
  );

function digestDay(now) {
  const day = berlinDay(now);
  return new Date(`${day}T12:00:00Z`).getUTCDay() === config.digestDay ? day : null;
}

async function digestFor(row, now) {
  const since = now.getTime() - 7 * DAY;
  const uploaded = await db.get(
    'SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM file_data WHERE username = ? AND deleted_at IS NULL AND created_at >= ?',
    [row.username, since]
  );
  let views = null;
  let top = null;
  if (settings.get('stats.enabled')) {
    const first = berlinDay(new Date(since));
    const own = "s.kind = 'f' AND s.ref_id IN (SELECT id FROM file_data WHERE username = ? AND deleted_at IS NULL)";
    views = await db.count(`SELECT COALESCE(SUM(s.views + s.downloads + s.direct), 0) FROM stats_daily s WHERE ${own} AND s.day >= ?`, [
      row.username,
      first,
    ]);
    const best = await db.get(
      `SELECT s.ref_id, SUM(s.views + s.downloads + s.direct) AS total FROM stats_daily s WHERE ${own} AND s.day >= ?
       GROUP BY s.ref_id ORDER BY SUM(s.views + s.downloads + s.direct) DESC LIMIT 1`,
      [row.username, first]
    );
    if (best && Number(best.total) > 0) {
      const record = await files.findById(Number(best.ref_id));
      if (record) top = { name: fileName(record), views: Number(best.total) };
    }
  }
  const { quotaBytes } = users.effectiveLimits(row);
  return {
    uploads: Number(uploaded.files) || 0,
    bytes: Number(uploaded.bytes) || 0,
    views,
    top,
    usedBytes: await users.usageBytes(row.username),
    quotaBytes,
  };
}

async function deliverDigests(now = new Date()) {
  const day = digestDay(now);
  if (!day || Number(berlinParts(now).hour) < config.memoryHour) return 0;
  const token = await ephemeral.acquire(`digest:${day}`, 8 * DAY).catch(() => null);
  if (!token) return 0;
  let sent = 0;
  for (const row of await wanting('digest')) {
    const data = await digestFor(row, now).catch(() => null);
    if (!data) continue;
    await mail
      .notifyUser(row.id, 'digest', (language) => digestMessage(language, data))
      .then(() => {
        sent += 1;
      })
      .catch((error) => log.warn('Wochenbericht ließ sich nicht senden', { error }));
  }
  return sent;
}

async function checkQuotas(now = Date.now()) {
  const token = await ephemeral.acquire(`quota:${Math.floor(now / HOUR)}`, HOUR).catch(() => null);
  if (!token) return 0;
  const fallback = settings.get('uploads.defaultQuotaBytes');
  const rows = await db.all(
    `SELECT id, username, preferences, quota_bytes, max_file_bytes FROM users WHERE status = 'active' AND (quota_bytes > 0${fallback ? ' OR quota_bytes IS NULL OR quota_bytes = 0' : ''}) LIMIT ${MAX_USERS}`
  );
  let warned = 0;
  for (const row of rows) {
    const { quotaBytes } = users.effectiveLimits(row);
    if (!quotaBytes) continue;
    const usedBytes = await users.usageBytes(row.username);
    const share = usedBytes / quotaBytes;
    const key = String(row.id);
    if (share < QUOTA_RESET) {
      await ephemeral.remove('quota-notice', key);
      continue;
    }
    if (share < QUOTA_WARN || (await ephemeral.get('quota-notice', key))) continue;
    await ephemeral.put('quota-notice', key, { at: now }, 60 * DAY);
    await mail
      .notifyUser(row.id, 'quota', (language) => quotaMessage(language, { usedBytes, quotaBytes }))
      .then(() => {
        warned += 1;
      })
      .catch((error) => log.warn('Hinweis auf vollen Speicher ließ sich nicht senden', { error }));
  }
  return warned;
}

async function warnExpiring(now = Date.now()) {
  const token = await ephemeral.acquire(`expiring:${Math.floor(now / (10 * 60 * 1000))}`, 10 * 60 * 1000).catch(() => null);
  if (!token) return 0;
  const wanted = await wanting('expiring');
  if (!wanted.length) return 0;
  let sent = 0;
  for (const row of wanted) {
    const due = await db.all(
      `SELECT * FROM file_data WHERE username = ? AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at > ? AND expires_at <= ?
       AND expires_at - created_at >= ? ORDER BY expires_at LIMIT 50`,
      [row.username, now, now + EXPIRY_WINDOW_MS, EXPIRY_MIN_LIFETIME_MS]
    );
    const fresh = [];
    for (const record of due) {
      const stored = await ephemeral.putIfAbsent('expiry-notice', String(record.id), { at: now }, 3 * DAY);
      if (stored && stored.at === now) fresh.push(record);
    }
    if (!fresh.length) continue;
    await mail
      .notifyUser(row.id, 'expiring', (language) => expiringMessage(language, fresh))
      .then(() => {
        sent += 1;
      })
      .catch((error) => log.warn('Hinweis auf ablaufende Dateien ließ sich nicht senden', { error }));
  }
  return sent;
}

async function tick(now = Date.now()) {
  const reacted = await deliverReactions(now);
  const remembered = await deliverMemories(new Date(now));
  const digests = await deliverDigests(new Date(now));
  const quotas = await checkQuotas(now);
  const expiring = await warnExpiring(now);
  return { reacted, remembered, digests, quotas, expiring };
}

module.exports = {
  tick,
  deliverReactions,
  deliverMemories,
  deliverDigests,
  checkQuotas,
  warnExpiring,
  reactionMessage,
  memoryMessage,
  digestMessage,
  quotaMessage,
  expiringMessage,
};
