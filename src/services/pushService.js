'use strict';

const db = require('../lib/db');
const config = require('../config');
const logger = require('../lib/logger');
const secrets = require('../lib/secrets');
const webpush = require('../lib/webpush');
const { client: safeHttp } = require('../lib/safeFetch');
const { translate } = require('../lib/i18n');
const { badRequest, forbidden, notFound } = require('../lib/errors');
const settings = require('./settingsService');
const { NOTIFY_KEYS, cleanNotify } = require('./preferenceService');

const log = logger.scope('push');

const KEYS_META = 'pushKeys';
const ADMIN_EVENTS = new Set(['reports', 'users', 'system']);
const MAX_PER_USER = 20;
const MAX_FAILURES = 10;
const TTL_SECONDS = 24 * 60 * 60;
const TOKEN_REUSE_MS = 6 * 60 * 60 * 1000;
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

let keys = null;
let loading = null;
const tokens = new Map();

const enabled = () => Boolean(settings.get('push.enabled'));

async function readKeys() {
  let stored = await settings.readMeta(KEYS_META);
  if (!stored || !stored.publicKey || !stored.privateKey) {
    const fresh = webpush.generateKeys();
    await db.insertIgnore('settings', {
      name: `_meta.${KEYS_META}`,
      value: JSON.stringify({ publicKey: fresh.publicKey, privateKey: secrets.encrypt(fresh.privateKey), createdAt: Date.now() }),
      updated_at: Date.now(),
    });
    stored = await settings.readMeta(KEYS_META);
  }
  try {
    return { publicKey: stored.publicKey, privateKey: secrets.decrypt(stored.privateKey) };
  } catch (error) {
    log.warn(
      'Der Schlüssel für Push-Benachrichtigungen ließ sich nicht entschlüsseln. Es gibt einen neuen, Geräte müssen Push neu einschalten',
      {
        error,
      }
    );
    await db.run('DELETE FROM settings WHERE name = ?', [`_meta.${KEYS_META}`]);
    await db.run('DELETE FROM push_subscriptions');
    const fresh = webpush.generateKeys();
    await db.insertIgnore('settings', {
      name: `_meta.${KEYS_META}`,
      value: JSON.stringify({ publicKey: fresh.publicKey, privateKey: secrets.encrypt(fresh.privateKey), createdAt: Date.now() }),
      updated_at: Date.now(),
    });
    const again = await settings.readMeta(KEYS_META);
    return { publicKey: again.publicKey, privateKey: secrets.decrypt(again.privateKey) };
  }
}

async function loadKeys() {
  if (keys) return keys;
  if (!loading) {
    loading = readKeys()
      .then((loaded) => {
        keys = loaded;
        return loaded;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

const publicKey = async () => (await loadKeys()).publicKey;

function allowedEndpoint(url) {
  if (config.allowPrivateFetch) return url.protocol === 'https:' || url.protocol === 'http:';
  return webpush.isPushService(url);
}

function cleanSubscription(input) {
  const source = input && typeof input === 'object' ? input : {};
  const endpoint = typeof source.endpoint === 'string' ? source.endpoint.trim() : '';
  const invalid = () => badRequest('Das Push-Abo des Browsers ist ungültig. Versuch es noch einmal.', { code: 'push_invalid' });
  if (!endpoint || endpoint.length > 1024) throw invalid();
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw invalid();
  }
  if (!allowedEndpoint(url)) {
    throw badRequest('Der Push-Dienst dieses Browsers wird nicht unterstützt.', { code: 'push_service' });
  }
  const keyset = source.keys && typeof source.keys === 'object' ? source.keys : {};
  const p256dh = typeof keyset.p256dh === 'string' ? keyset.p256dh.trim() : '';
  const auth = typeof keyset.auth === 'string' ? keyset.auth.trim() : '';
  if (!B64URL.test(p256dh) || !B64URL.test(auth) || !webpush.validPublicKey(p256dh) || Buffer.from(auth, 'base64url').length !== 16) {
    throw invalid();
  }
  return { endpoint: url.href, p256dh: p256dh.replace(/=+$/, ''), auth: auth.replace(/=+$/, '') };
}

function parseEvents(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

const eventsOf = (raw) => cleanNotify(parseEvents(raw));

function cleanEvents(input, previous = {}) {
  const base = { ...cleanNotify(previous) };
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const key of NOTIFY_KEYS) if (typeof input[key] === 'boolean') base[key] = input[key];
  }
  return base;
}

const visibleEvents = (events, isAdmin) => Object.fromEntries(Object.entries(events).filter(([key]) => isAdmin || !ADMIN_EVENTS.has(key)));

const present = (row, isAdmin, language) => ({
  id: Number(row.id),
  label: translate(language, row.label || 'Unbekanntes Gerät'),
  endpointHash: row.endpoint_hash,
  events: visibleEvents(eventsOf(row.events), isAdmin),
  createdAt: Number(row.created_at),
  lastSuccessAt: row.last_success_at ? Number(row.last_success_at) : null,
  lastError: row.last_error || null,
});

const COLUMNS = 'id, user_id, endpoint_hash, label, events, created_at, last_success_at, last_error';

async function list(user, language) {
  const rows = await db.all(`SELECT ${COLUMNS} FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC, id DESC`, [user.id]);
  return rows.map((row) => present(row, user.isAdmin, language));
}

async function state(user, language) {
  if (!enabled()) return { enabled: false, publicKey: null, devices: [] };
  return { enabled: true, publicKey: await publicKey(), devices: await list(user, language) };
}

async function makeRoom(userId) {
  const rows = await db.all(
    'SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY COALESCE(last_success_at, created_at) DESC, id DESC',
    [userId]
  );
  for (const row of rows.slice(MAX_PER_USER - 1)) await db.run('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
}

async function subscribe(user, input, { label, language }) {
  if (!enabled()) throw forbidden('Push-Benachrichtigungen sind auf diesem Server abgeschaltet.', { code: 'push_disabled' });
  const source = input && typeof input === 'object' ? input : {};
  const subscription = cleanSubscription(source.subscription);
  const hash = secrets.sha256(subscription.endpoint);
  if (typeof source.replaces === 'string' && source.replaces && source.replaces !== subscription.endpoint) {
    await db.run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [
      user.id,
      secrets.sha256(source.replaces.trim()),
    ]);
  }
  const existing = await db.get('SELECT id, user_id, events FROM push_subscriptions WHERE endpoint_hash = ?', [hash]);
  const own = existing && Number(existing.user_id) === Number(user.id);
  const events = cleanEvents(source.events, own ? parseEvents(existing.events) : {});
  const deviceLabel = String(label || 'Unbekanntes Gerät').slice(0, 120);
  if (own) {
    await db.run(
      'UPDATE push_subscriptions SET p256dh = ?, auth = ?, label = ?, events = ?, failures = 0, last_error = NULL WHERE id = ?',
      [subscription.p256dh, subscription.auth, deviceLabel, JSON.stringify(events), existing.id]
    );
  } else {
    if (existing) await db.run('DELETE FROM push_subscriptions WHERE id = ?', [existing.id]);
    await makeRoom(user.id);
    await db.insertRow('push_subscriptions', {
      user_id: user.id,
      endpoint_hash: hash,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      label: deviceLabel,
      events: JSON.stringify(events),
      created_at: Date.now(),
      failures: 0,
    });
  }
  const row = await db.get(`SELECT ${COLUMNS} FROM push_subscriptions WHERE endpoint_hash = ?`, [hash]);
  log.debug('Push für ein Gerät eingeschaltet', { user: user.username });
  return present(row, user.isAdmin, language);
}

async function ownRow(user, id) {
  const row = await db.get('SELECT * FROM push_subscriptions WHERE id = ? AND user_id = ?', [Number(id) || 0, user.id]);
  if (!row) throw notFound('Dieses Gerät bekommt keine Push-Benachrichtigungen mehr.');
  return row;
}

async function update(user, id, input, language) {
  const row = await ownRow(user, id);
  const events = cleanEvents(input && input.events, parseEvents(row.events));
  await db.run('UPDATE push_subscriptions SET events = ? WHERE id = ?', [JSON.stringify(events), row.id]);
  return present({ ...row, events: JSON.stringify(events) }, user.isAdmin, language);
}

async function remove(user, id) {
  const row = await ownRow(user, id);
  await db.run('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
}

function subjectClaim() {
  const base = String(settings.get('site.baseUrl') || '');
  if (base.startsWith('https://')) return base;
  const from = settings.get('mail.from');
  return from ? `mailto:${from}` : null;
}

async function authorization(origin) {
  const { publicKey: key, privateKey } = await loadKeys();
  const subject = subjectClaim();
  const cacheKey = `${origin}|${subject}|${key}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.value;
  const value = `vapid t=${webpush.vapidToken({ audience: origin, subject, publicKey: key, privateKey })}, k=${key}`;
  if (tokens.size > 50) tokens.clear();
  tokens.set(cacheKey, { value, until: Date.now() + TOKEN_REUSE_MS });
  return value;
}

async function failed(row, reason, status) {
  const failures = (Number(row.failures) || 0) + 1;
  if (failures >= MAX_FAILURES) {
    await db.run('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
    log.info('Push-Abo nach wiederholten Fehlern entfernt', { id: row.id, reason });
    return { ok: false, status, error: reason, removed: true };
  }
  await db.run('UPDATE push_subscriptions SET failures = ?, last_error = ? WHERE id = ?', [failures, String(reason).slice(0, 200), row.id]);
  return { ok: false, status, error: reason, removed: false };
}

async function send(row, payload, { ttl = TTL_SECONDS, urgency = 'normal' } = {}) {
  let url;
  try {
    url = new URL(row.endpoint);
  } catch {
    url = null;
  }
  if (!url || !allowedEndpoint(url)) {
    await db.run('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
    return { ok: false, status: 0, error: 'endpoint', removed: true };
  }
  let body;
  try {
    body = webpush.encrypt(JSON.stringify(payload), { p256dh: row.p256dh, auth: row.auth });
  } catch (error) {
    return failed(row, error.message, 0);
  }
  try {
    const response = await safeHttp({
      method: 'post',
      url: url.href,
      data: body,
      timeout: 10000,
      maxRedirects: 0,
      maxContentLength: 64 * 1024,
      responseType: 'text',
      validateStatus: () => true,
      headers: {
        Authorization: await authorization(url.origin),
        TTL: String(ttl),
        Urgency: urgency,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
      },
    });
    const { status } = response;
    if (status >= 200 && status < 300) {
      await db.run('UPDATE push_subscriptions SET last_success_at = ?, failures = 0, last_error = NULL WHERE id = ?', [Date.now(), row.id]);
      return { ok: true, status };
    }
    if (status === 404 || status === 410) {
      await db.run('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
      log.debug('Push-Abo ist abgelaufen und wurde entfernt', { id: row.id, status });
      return { ok: false, status, error: 'gone', removed: true };
    }
    log.debug('Push-Dienst hat die Nachricht abgelehnt', { id: row.id, status, body: String(response.data || '').slice(0, 200) });
    return failed(row, `HTTP ${status}`, status);
  } catch (error) {
    log.debug('Push-Dienst nicht erreichbar', { id: row.id, error });
    return failed(row, error.code || error.message, 0);
  }
}

const clip = (value, max) => {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

function payloadOf(message, tag) {
  const extra = (message && message.push) || {};
  const title = clip(extra.title || message.title || message.subject, 120) || settings.get('site.title');
  const body = clip(extra.body || (Array.isArray(message.paragraphs) ? message.paragraphs[0] : ''), 300);
  const url = extra.url || (message.button && message.button.url) || `${settings.get('site.baseUrl')}/dashboard`;
  return { title, body, url: String(url).slice(0, 1000), tag: extra.tag || tag || undefined, at: Date.now() };
}

async function notify(userId, category, compose) {
  if (!enabled()) return 0;
  const rows = await db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  const targets = rows.filter((row) => eventsOf(row.events)[category]);
  if (!targets.length) return 0;
  const message = compose();
  if (!message) return 0;
  const payload = payloadOf(message);
  let sent = 0;
  for (const row of targets) {
    const result = await send(row, payload, { urgency: category === 'security' ? 'high' : 'normal' });
    if (result.ok) sent += 1;
  }
  return sent;
}

async function test(user, id, language) {
  if (!enabled()) throw forbidden('Push-Benachrichtigungen sind auf diesem Server abgeschaltet.', { code: 'push_disabled' });
  const row = await ownRow(user, id);
  const t = (text, params) => translate(language, text, params);
  const result = await send(
    row,
    payloadOf(
      {
        title: t('Push-Benachrichtigungen funktionieren'),
        paragraphs: [
          t('Diese Nachricht hast du von {site} an {device} geschickt.', { site: settings.get('site.title'), device: t(row.label) }),
        ],
        button: { url: `${settings.get('site.baseUrl')}/account#einstellungen` },
      },
      'test'
    ),
    { ttl: 600, urgency: 'high' }
  );
  if (result.ok) return { ok: true };
  if (result.removed) {
    return {
      ok: false,
      removed: true,
      error: t('Der Push-Dienst kennt dieses Gerät nicht mehr. Schalte Push dort noch einmal ein.'),
    };
  }
  return {
    ok: false,
    removed: false,
    error: t('Der Push-Dienst hat die Nachricht nicht angenommen ({reason}).', { reason: result.error }),
  };
}

function onSettings(changed) {
  if (changed.some((key) => key === 'site.baseUrl' || key === 'mail.from')) tokens.clear();
}

settings.onChange(onSettings);

module.exports = { enabled, publicKey, state, list, subscribe, update, remove, notify, test, payloadOf, allowedEndpoint };
