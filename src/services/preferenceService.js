'use strict';

const db = require('../lib/db');
const { badRequest } = require('../lib/errors');
const { STYLES } = require('../lib/slugs');
const { EXPIRY_CHOICES } = require('../lib/expiry');
const settings = require('./settingsService');
const domains = require('./domainService');

const LANGUAGES = ['de', 'en'];
const NOTIFY_KEYS = ['security', 'reports', 'users'];
const DEFAULTS = { language: null, urlStyle: null, domain: null, expiry: null };
const NOTIFY_DEFAULTS = { security: true, reports: true, users: false };

function parse(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function languageOf(raw) {
  const value = parse(raw).language;
  return LANGUAGES.includes(value) ? value : null;
}

const domainAllowed = (value, username) =>
  value === 'random' ||
  value === 'base' ||
  settings.get('site.domains').includes(value) ||
  Boolean(username && domains.originsFor(username).includes(value));

function cleanNotify(stored) {
  const input = stored && typeof stored === 'object' ? stored : {};
  return Object.fromEntries(NOTIFY_KEYS.map((key) => [key, typeof input[key] === 'boolean' ? input[key] : NOTIFY_DEFAULTS[key]]));
}

function clean(stored, username) {
  const preferences = { ...DEFAULTS };
  if (LANGUAGES.includes(stored.language)) preferences.language = stored.language;
  if (STYLES.includes(stored.urlStyle)) preferences.urlStyle = stored.urlStyle;
  if (typeof stored.domain === 'string' && domainAllowed(stored.domain, username)) preferences.domain = stored.domain;
  if (EXPIRY_CHOICES.includes(stored.expiry)) preferences.expiry = stored.expiry;
  preferences.notify = cleanNotify(stored.notify);
  return preferences;
}

const notifyOf = (raw) => cleanNotify(parse(raw).notify);

async function readRow(userId) {
  return db.get('SELECT username, preferences FROM users WHERE id = ?', [userId]);
}

async function get(userId) {
  const row = await readRow(userId);
  return clean(parse(row && row.preferences), row && row.username);
}

function validate(patch, username) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw badRequest('Ungültige Anfrage.');
  const next = {};
  const check = (key, valid, message) => {
    if (!(key in patch)) return;
    const value = patch[key] === '' ? null : patch[key];
    if (value !== null && !valid(value)) throw badRequest(message, { field: key });
    next[key] = value;
  };
  check('language', (value) => LANGUAGES.includes(value), 'Diese Sprache gibt es nicht.');
  check('urlStyle', (value) => STYLES.includes(value), 'Diesen Adressstil gibt es nicht.');
  check(
    'domain',
    (value) => typeof value === 'string' && domainAllowed(value, username),
    'Diese Domain ist auf dem Server nicht eingetragen.'
  );
  check('expiry', (value) => EXPIRY_CHOICES.includes(value), 'Ungültige Ablaufzeit.');
  if ('notify' in patch) {
    const notify = patch.notify;
    if (!notify || typeof notify !== 'object' || Array.isArray(notify)) throw badRequest('Ungültige Anfrage.', { field: 'notify' });
    const cleaned = {};
    for (const [key, value] of Object.entries(notify)) {
      if (!NOTIFY_KEYS.includes(key) || typeof value !== 'boolean') throw badRequest('Ungültige Anfrage.', { field: 'notify' });
      cleaned[key] = value;
    }
    next.notify = cleaned;
  }
  return next;
}

async function update(userId, patch) {
  const row = await readRow(userId);
  const username = row && row.username;
  const changes = validate(patch, username);
  const current = clean(parse(row && row.preferences), username);
  const next = { ...current, ...changes, notify: { ...current.notify, ...(changes.notify || {}) } };
  await db.run('UPDATE users SET preferences = ? WHERE id = ?', [JSON.stringify(next), userId]);
  return next;
}

module.exports = { LANGUAGES, NOTIFY_KEYS, get, update, languageOf, notifyOf };
