'use strict';

const config = require('../config');
const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const i18n = require('../lib/i18n');
const { berlinDay, berlinParts } = require('../lib/format');
const files = require('./fileService');
const mail = require('./mailService');
const reactions = require('./reactionService');
const settings = require('./settingsService');

const log = logger.scope('notices');

const MAX_LINES = 5;

const quoted = (language, name) => (language === 'en' ? `“${name}”` : `„${name}“`);

function fileName(row) {
  return row.title || row.original_name || row.filename;
}

async function targetsOf(rows) {
  const fileIds = rows.filter((row) => row.kind === 'f').map((row) => Number(row.ref_id));
  const albumIds = rows.filter((row) => row.kind === 'a').map((row) => Number(row.ref_id));
  const result = new Map();
  if (fileIds.length) {
    const list = await db.all(
      `SELECT * FROM file_data WHERE id IN (${fileIds.map(() => '?').join(', ')}) AND deleted_at IS NULL`,
      fileIds
    );
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

async function tick(now = Date.now()) {
  const reacted = await deliverReactions(now);
  const remembered = await deliverMemories(new Date(now));
  return { reacted, remembered };
}

module.exports = { tick, deliverReactions, deliverMemories, reactionMessage, memoryMessage };
