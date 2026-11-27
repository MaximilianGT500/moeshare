'use strict';

const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { client: safeHttp } = require('../lib/safeFetch');
const { badRequest, conflict, notFound } = require('../lib/errors');
const slugs = require('../lib/slugs');
const { resolveExpiry } = require('../lib/expiry');
const settings = require('./settingsService');
const files = require('./fileService');
const domains = require('./domainService');
const protection = require('./protectionService');
const uploads = require('./uploadService');
const webhook = require('./webhookService');
const addresses = require('./addressService');
const pulse = require('./pulseService');

const log = logger.scope('links');

const MAX_URL = 2048;
const MAX_CLICKS = 100000;
const HOUR = 60 * 60 * 1000;
const RECHECK_GOOD_MS = 7 * 24 * HOUR;
const RECHECK_BROKEN_MS = 12 * HOUR;
const CHECK_BATCH = 24;
const CHECK_PARALLEL = 4;
const CHECK_TIMEOUT_MS = 10000;
const UNCHECKABLE = -1;
const UNREACHABLE = 0;
const TOLERATED = new Set([401, 403, 407, 429]);

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

const codeTaken = async (code) =>
  Boolean(
    (await db.get('SELECT id FROM links WHERE code = ?', [code])) ||
    (await db.get('SELECT path FROM redirects WHERE path = ?', [`/s/${code}`]))
  );

function urlsFor(row, domain = null, username = null) {
  const base = settings.get('site.baseUrl');
  const host = domain && files.originsFor(username).includes(domain) ? domain : base;
  return { short: `${host}/s/${slugs.displayPath(row.code)}`, manage: `${base}/dashboard#links` };
}

const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/;
const MAX_LANGUAGES = 10;

function targetsOf(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('{')) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const languages = value.languages && typeof value.languages === 'object' ? value.languages : {};
    const result = {
      ios: typeof value.ios === 'string' ? value.ios : null,
      android: typeof value.android === 'string' ? value.android : null,
      languages: Object.fromEntries(Object.entries(languages).filter(([key, url]) => LANGUAGE.test(key) && typeof url === 'string')),
    };
    return result.ios || result.android || Object.keys(result.languages).length ? result : null;
  } catch {
    return null;
  }
}

function targetUrl(value) {
  try {
    return validateUrl(value);
  } catch (error) {
    throw badRequest(error.message, { field: 'targets' });
  }
}

function cleanTargets(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('Ungültige Ziele.', { field: 'targets' });
  const result = { ios: null, android: null, languages: {} };
  for (const key of ['ios', 'android']) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') result[key] = targetUrl(input[key]);
  }
  const languages = input.languages && typeof input.languages === 'object' && !Array.isArray(input.languages) ? input.languages : {};
  const entries = Object.entries(languages).filter(([, url]) => url !== null && url !== undefined && url !== '');
  if (entries.length > MAX_LANGUAGES) throw badRequest(`Höchstens ${MAX_LANGUAGES} Sprachen pro Kurzlink.`, { field: 'targets' });
  for (const [raw, url] of entries) {
    const key = String(raw).trim().toLowerCase();
    if (!LANGUAGE.test(key)) throw badRequest(`„${raw}“ ist kein Sprachcode wie de oder en-us.`, { field: 'targets' });
    result.languages[key] = targetUrl(url);
  }
  return result.ios || result.android || Object.keys(result.languages).length ? JSON.stringify(result) : null;
}

function platformOf(userAgent) {
  const agent = String(userAgent || '');
  if (/\b(iPhone|iPad|iPod)\b/.test(agent)) return 'ios';
  if (/\bAndroid\b/.test(agent)) return 'android';
  return null;
}

function languagesOf(header) {
  return String(header || '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((param) => /^q=([\d.]+)$/.exec(param.trim())).find(Boolean);
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q[1]) : 1 };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

function destinationFor(row, req) {
  const targets = targetsOf(row.targets);
  if (!targets) return { url: row.url, via: null };
  const platform = platformOf(req.get('user-agent'));
  if (platform && targets[platform]) return { url: targets[platform], via: platform };
  const keys = Object.keys(targets.languages);
  if (keys.length) {
    for (const tag of languagesOf(req.get('accept-language'))) {
      if (targets.languages[tag]) return { url: targets.languages[tag], via: tag };
      const base = tag.split('-')[0];
      const match = keys.find((key) => key === base) || keys.find((key) => key.split('-')[0] === base);
      if (match) return { url: targets.languages[match], via: match };
    }
  }
  return { url: row.url, via: null };
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
  interstitial: Boolean(Number(row.interstitial)),
  targets: targetsOf(row.targets),
  check: row.checked_at
    ? {
        status: row.check_status === null || row.check_status === undefined ? null : Number(row.check_status),
        checkedAt: Number(row.checked_at),
        brokenSince: row.broken_since ? Number(row.broken_since) : null,
      }
    : null,
});

const flag = (value) => value === true || value === 1 || value === '1' || value === 'true';

async function create(user, target, raw = {}) {
  const url = validateUrl(target);
  const options = await uploads.resolveOptions(user, raw, { kind: 'link' });
  const language = settings.get('site.language');
  let id = null;
  for (let attempt = 0; attempt < 6 && !id; attempt++) {
    const code = options.code || (await slugs.unique(options.style, { language }, codeTaken));
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
        interstitial: flag(raw.interstitial) ? 1 : 0,
        targets: cleanTargets(raw.targets),
      });
    } catch (error) {
      if (db.isUniqueViolation(error) && options.code) throw conflict('Diese Adresse ist schon vergeben.', { field: 'code' });
      if (!db.isUniqueViolation(error) || attempt === 5) throw error;
    }
  }
  const row = await db.get('SELECT * FROM links WHERE id = ?', [id]);
  const urls = urlsFor(row, options.domain, user.username);
  log.info('Kurzlink erstellt', { user: user.username, code: row.code });
  webhook.notify('upload', 'Neuer Kurzlink', `Kurzlink: **${urls.short}**\nZiel: ${url}\nBenutzername: **${user.username}**`);
  pulse.count('link');
  return { success: true, url: urls.short, short: urls.short, target: url, code: row.code, id: row.id, delete: urls.manage };
}

async function list(userId, { page = 1, limit = 25, search = '', broken = false } = {}) {
  const conditions = ['user_id = ?'];
  const params = [userId];
  if (broken) conditions.push('broken_since IS NOT NULL');
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
  const brokenCount = await db.count('SELECT COUNT(*) FROM links WHERE user_id = ? AND broken_since IS NOT NULL', [userId]);
  return { links: rows.map(toLink), total, page: current, pages, limit: size, hasNext: current < pages, broken: brokenCount };
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
  if (patch.url !== undefined) {
    fields.url = validateUrl(patch.url);
    if (fields.url !== row.url) Object.assign(fields, { check_status: null, checked_at: null, broken_since: null });
  }
  if (patch.interstitial !== undefined) fields.interstitial = flag(patch.interstitial) ? 1 : 0;
  if (patch.targets !== undefined) fields.targets = cleanTargets(patch.targets);
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
  if (patch.code !== undefined && patch.code !== row.code) await addresses.rename('link', row, patch.code);
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

const checkEnabled = () => settings.get('links.check');

const interstitialFor = (row) => settings.get('links.interstitial') === 'always' || Boolean(Number(row.interstitial));

function release(response) {
  if (response && response.data && typeof response.data.destroy === 'function') response.data.destroy();
  return response;
}

async function probe(url) {
  const options = {
    timeout: CHECK_TIMEOUT_MS,
    maxRedirects: 5,
    validateStatus: () => true,
    responseType: 'stream',
    headers: {
      'User-Agent': `Mozilla/5.0 (compatible; MoeShare/${config.version}; +${settings.get('site.baseUrl')})`,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    },
  };
  const head = release(await safeHttp.head(url, options));
  if (head.status < 400) return head.status;
  return release(await safeHttp.get(url, { ...options, headers: { ...options.headers, Range: 'bytes=0-0' } })).status;
}

async function statusOf(url) {
  try {
    return await probe(url);
  } catch (error) {
    if (error && error.code === 'EPRIVATE') return UNCHECKABLE;
    if (error && error.response && error.response.status) return error.response.status;
    return UNREACHABLE;
  }
}

const isBroken = (status) =>
  status !== UNCHECKABLE && (status === UNREACHABLE || (status >= 400 && status !== 416 && !TOLERATED.has(status)));

async function store(row, status, now = Date.now()) {
  const broken = isBroken(status);
  await db.run('UPDATE links SET check_status = ?, checked_at = ?, broken_since = ? WHERE id = ?', [
    status,
    now,
    broken ? Number(row.broken_since) || now : null,
    row.id,
  ]);
  return broken;
}

async function checkDue({ now = Date.now(), limit = CHECK_BATCH } = {}) {
  if (!checkEnabled()) return { checked: 0, broken: 0 };
  const rows = await db.all(
    `SELECT id, url, broken_since FROM links WHERE blocked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       AND (checked_at IS NULL OR (broken_since IS NULL AND checked_at < ?) OR (broken_since IS NOT NULL AND checked_at < ?))
     ORDER BY CASE WHEN checked_at IS NULL THEN 0 ELSE 1 END, checked_at, id LIMIT ?`,
    [now, now - RECHECK_GOOD_MS, now - RECHECK_BROKEN_MS, limit]
  );
  let broken = 0;
  for (let index = 0; index < rows.length; index += CHECK_PARALLEL) {
    const group = rows.slice(index, index + CHECK_PARALLEL);
    const results = await Promise.all(group.map(async (row) => store(row, await statusOf(row.url))));
    broken += results.filter(Boolean).length;
  }
  return { checked: rows.length, broken };
}

async function checkNow(userId, id) {
  if (!checkEnabled()) throw notFound('Die Prüfung von Kurzlinks ist auf diesem Server abgeschaltet.');
  const row = await owned(userId, id);
  await store(row, await statusOf(row.url));
  return toLink(await db.get('SELECT * FROM links WHERE id = ?', [row.id]));
}

module.exports = {
  checkEnabled,
  interstitialFor,
  checkDue,
  checkNow,
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
  destinationFor,
  targetsOf,
  platformOf,
  languagesOf,
};
