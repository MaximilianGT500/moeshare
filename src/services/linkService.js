'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, notFound } = require('../lib/errors');
const slugs = require('../lib/slugs');
const { resolveExpiry } = require('../lib/expiry');
const settings = require('./settingsService');
const files = require('./fileService');
const domains = require('./domainService');
const protection = require('./protectionService');
const uploads = require('./uploadService');
const webhook = require('./webhookService');

const log = logger.scope('links');

const MAX_URL = 2048;
const MAX_CLICKS = 100000;

function validateUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest('Es fehlt die Adresse, die gekürzt werden soll.', { field: 'url' });
  if (text.length > MAX_URL) throw badRequest('Die Adresse ist zu lang.', { field: 'url' });
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw badRequest('Das ist keine gültige Adresse.', { field: 'url' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw badRequest('Nur http- und https-Adressen lassen sich kürzen.', { field: 'url' });
  const own = files.origins().includes(parsed.origin) || Boolean(domains.ownerOfHost(parsed.hostname));
  if (own && parsed.pathname.startsWith('/s/')) {
    throw badRequest('Kurzlinks lassen sich nicht noch einmal kürzen.', { field: 'url' });
  }
  return parsed.href;
}

const codeTaken = async (code) => Boolean(await db.get('SELECT id FROM links WHERE code = ?', [code]));

function urlsFor(row, domain = null, username = null) {
  const base = settings.get('site.baseUrl');
  const host = domain && files.originsFor(username).includes(domain) ? domain : base;
  return { short: `${host}/s/${slugs.displayPath(row.code)}`, manage: `${base}/dashboard#links` };
}

const toLink = (row) => ({
  id: row.id,
  code: row.code,
  url: row.url,
  title: row.title || null,
  createdAt: Number(row.created_at),
  expiresAt: row.expires_at ? Number(row.expires_at) : null,
  password: Boolean(row.password_hash),
  maxClicks: row.max_clicks || null,
  clicks: row.clicks || 0,
  lastClickedAt: row.last_clicked_at ? Number(row.last_clicked_at) : null,
  blocked: row.blocked_at ? { at: Number(row.blocked_at), reason: row.blocked_reason || '' } : null,
  short: urlsFor(row).short,
});

async function create(user, target, raw = {}) {
  const url = validateUrl(target);
  const options = await uploads.resolveOptions(user, raw, { kind: 'link' });
  const language = settings.get('site.language');
  let id = null;
  for (let attempt = 0; attempt < 6 && !id; attempt++) {
    const code = await slugs.unique(options.style, { language }, codeTaken);
    try {
      id = await db.insertRow('links', {
        code,
        url,
        user_id: user.id,
        title: options.title,
        created_at: Date.now(),
        expires_at: options.expiresAt,
        password_hash: options.passwordHash,
        max_clicks: options.maxViews,
        clicks: 0,
      });
    } catch (error) {
      if (!db.isUniqueViolation(error) || attempt === 5) throw error;
    }
  }
  const row = await db.get('SELECT * FROM links WHERE id = ?', [id]);
  const urls = urlsFor(row, options.domain, user.username);
  log.info('Kurzlink erstellt', { user: user.username, code: row.code });
  webhook.notify('upload', 'Neuer Kurzlink', `Kurzlink: **${urls.short}**\nZiel: ${url}\nBenutzername: **${user.username}**`);
  return { success: true, url: urls.short, short: urls.short, target: url, code: row.code, id: row.id, delete: urls.manage };
}

async function list(userId, { page = 1, limit = 25, search = '' } = {}) {
  const conditions = ['user_id = ?'];
  const params = [userId];
  if (search) {
    const term = `%${db.escapeLike(String(search).toLowerCase())}%`;
    conditions.push("(lower(url) LIKE ? ESCAPE '!' OR lower(code) LIKE ? ESCAPE '!' OR lower(title) LIKE ? ESCAPE '!')");
    params.push(term, term, term);
  }
  const where = conditions.join(' AND ');
  const size = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const total = await db.count(`SELECT COUNT(*) FROM links WHERE ${where}`, params);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
  const rows = await db.all(`SELECT * FROM links WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [
    ...params,
    size,
    (current - 1) * size,
  ]);
  return { links: rows.map(toLink), total, page: current, pages, limit: size, hasNext: current < pages };
}

async function owned(userId, id) {
  const row = Number.isSafeInteger(Number(id))
    ? await db.get('SELECT * FROM links WHERE id = ? AND user_id = ?', [Number(id), userId])
    : null;
  if (!row) throw notFound('Diesen Kurzlink gibt es nicht (mehr).');
  return row;
}

async function update(userId, id, patch) {
  const row = await owned(userId, id);
  const fields = {};
  if (patch.url !== undefined) fields.url = validateUrl(patch.url);
  if (patch.title !== undefined) fields.title = patch.title ? String(patch.title).replace(/\s+/g, ' ').trim().slice(0, 255) || null : null;
  if (patch.expires !== undefined) {
    const expiry = resolveExpiry(patch.expires, { max: settings.get('uploads.maxExpiry') });
    if (expiry.error) throw badRequest('Ungültige Ablaufzeit.', { field: 'expires' });
    fields.expires_at = expiry.ms ? Date.now() + expiry.ms : null;
  }
  if (patch.password !== undefined) {
    const hashed = patch.password ? await protection.hashPassword(patch.password) : null;
    if (hashed && hashed.error) throw badRequest('Das Passwort ist zu lang.', { field: 'password' });
    fields.password_hash = hashed;
  }
  if (patch.maxClicks !== undefined) {
    const count = patch.maxClicks === null || patch.maxClicks === '' ? 0 : Number(patch.maxClicks);
    if (!Number.isInteger(count) || count < 0 || count > MAX_CLICKS)
      throw badRequest('Ungültige Anzahl an Klicks.', { field: 'maxClicks' });
    fields.max_clicks = count || null;
  }
  const columns = Object.keys(fields);
  if (columns.length) {
    await db.run(`UPDATE links SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((column) => fields[column]),
      row.id,
    ]);
  }
  return toLink(await db.get('SELECT * FROM links WHERE id = ?', [row.id]));
}

async function purge(row) {
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM stats_daily WHERE kind = 'l' AND ref_id = ?", [row.id]);
    await tx.run("DELETE FROM stats_sources WHERE kind = 'l' AND ref_id = ?", [row.id]);
    await tx.run('DELETE FROM links WHERE id = ?', [row.id]);
  });
}

async function remove(userId, id) {
  const row = await owned(userId, id);
  await purge(row);
  return toLink(row);
}

const find = (code) => (slugs.isSlug(code) ? db.get('SELECT * FROM links WHERE code = ?', [code]) : null);

async function ownerName(row) {
  const user = await db.get('SELECT username FROM users WHERE id = ?', [row.user_id]);
  return user ? user.username : null;
}

async function access(req, row, now = Date.now()) {
  if (row.expires_at && Number(row.expires_at) <= now) return { state: 'expired' };
  if (req.user && (req.user.id === row.user_id || req.user.isAdmin)) return { state: 'open', owner: true };
  if (row.blocked_at) return { state: 'blocked' };
  if (row.password_hash && !protection.granted(req, 'l', row.id)) return { state: 'locked' };
  if (row.max_clicks && Number(row.clicks) >= Number(row.max_clicks)) return { state: 'used' };
  return { state: 'open' };
}

async function click(row) {
  const { changes } = await db.run(
    'UPDATE links SET clicks = clicks + 1, last_clicked_at = ? WHERE id = ? AND (max_clicks IS NULL OR clicks < max_clicks)',
    [Date.now(), row.id]
  );
  return changes === 1;
}

async function removeExpired(now = Date.now()) {
  const expired = 'SELECT id FROM links WHERE expires_at IS NOT NULL AND expires_at <= ?';
  await db.run(`DELETE FROM stats_daily WHERE kind = 'l' AND ref_id IN (${expired})`, [now]);
  await db.run(`DELETE FROM stats_sources WHERE kind = 'l' AND ref_id IN (${expired})`, [now]);
  const { changes } = await db.run('DELETE FROM links WHERE expires_at IS NOT NULL AND expires_at <= ?', [now]);
  return changes;
}

module.exports = {
  create,
  list,
  update,
  remove,
  purge,
  owned,
  find,
  access,
  click,
  removeExpired,
  toLink,
  ownerName,
  validateUrl,
  urlsFor,
};
