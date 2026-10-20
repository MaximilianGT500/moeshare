'use strict';

const crypto = require('crypto');
const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, HttpError } = require('../lib/errors');
const { readLegacyEnv } = require('../lib/legacyEnv');
const { DEFAULT_TEMPLATE, normalizeTemplate } = require('../lib/embedTemplate');

const log = logger.scope('settings');

const META_IMPORTED = '_meta.importedAt';
const META_REVISION = '_meta.revision';

const WEBHOOK_EVENTS = ['upload', 'delete', 'user', 'security', 'processing', 'system'];
const HOME_STATS = ['files', 'storage', 'views', 'users', 'images', 'videos', 'audio', 'today'];

const extension = (item) => {
  const ext = `.${String(item).trim().toLowerCase().replace(/^\.+/, '')}`;
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : null;
};
const snowflake = (item) => (/^\d{5,25}$/.test(String(item).trim()) ? String(item).trim() : null);

const clientId = (max = 200) => ({
  type: 'string',
  default: '',
  allowEmpty: true,
  max,
  pattern: /^\S+$/,
  patternMessage: 'Die Client-ID enthält keine Leerzeichen.',
});

const OAUTH_PROVIDERS = ['discord', 'github', 'google', 'microsoft', 'gitlab', 'oidc'];

const DEFINITIONS = {
  'site.title': { type: 'string', default: 'MoeShare', max: 60 },
  'site.favicon': { type: 'url', default: '', allowEmpty: true, allowPath: true },
  'site.baseUrl': { type: 'url', default: () => `http://localhost:${config.port}`, origin: true },
  'site.redirectUrl': { type: 'url', default: '', allowEmpty: true },
  'site.copyright': { type: 'string', default: '', allowEmpty: true, max: 200 },
  'site.uiColor': { type: 'color', default: '#8b5cf6' },
  'site.links': { type: 'links', default: [], max: 8 },

  'legal.imprintUrl': { type: 'url', default: '', allowEmpty: true, allowPath: true },
  'legal.imprintText': { type: 'string', default: '', allowEmpty: true, multiline: true, max: 20000 },
  'legal.privacyUrl': { type: 'url', default: '', allowEmpty: true, allowPath: true },
  'legal.privacyText': { type: 'string', default: '', allowEmpty: true, multiline: true, max: 100000 },

  'home.enabled': { type: 'bool', default: () => !get('site.redirectUrl') },
  'home.headline': { type: 'string', default: '', allowEmpty: true, max: 80 },
  'home.text': {
    type: 'string',
    default: 'Bilder, Videos und Dateien teilen: schnell hochgeladen, schön verlinkt und mit einer Vorschau, die überall gut aussieht.',
    allowEmpty: true,
    multiline: true,
    max: 600,
  },
  'home.stats': { type: 'list', values: HOME_STATS, default: ['files', 'storage', 'views', 'users'] },
  'home.activity': { type: 'bool', default: true },
  'home.signIn': { type: 'bool', default: true },

  'uploads.maxFileBytes': { type: 'bytes', default: null },
  'uploads.defaultQuotaBytes': { type: 'bytes', default: null },
  'uploads.preview': { type: 'bool', default: true },
  'uploads.removeMetadata': { type: 'bool', default: true },
  'uploads.hls': { type: 'bool', default: false },
  'uploads.dominantColor': { type: 'bool', default: true },
  'uploads.urlFetch': { type: 'bool', default: true },
  'uploads.formats.image': {
    type: 'list',
    item: extension,
    max: 40,
    default: ['.jpg', '.jpeg', '.png', '.bmp', '.svg', '.webp', '.tiff', '.avif'],
  },
  'uploads.formats.video': { type: 'list', item: extension, max: 40, default: ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.wmv'] },
  'uploads.formats.audio': { type: 'list', item: extension, max: 40, default: ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a', '.opus'] },

  'auth.registration': { type: 'enum', values: ['closed', 'invite', 'open'], default: 'invite' },
  'auth.sessionDays': { type: 'int', min: 1, max: 365, default: 30 },
  'auth.passwordMinLength': { type: 'int', min: 8, max: 64, default: 10 },
  'auth.enforceMfa': { type: 'enum', values: ['off', 'admins', 'all'], default: 'off' },
  'auth.passkeys': { type: 'bool', default: true },
  'auth.tokenLogin': { type: 'bool', default: false },
  'auth.discord.enabled': { type: 'bool', default: false },
  'auth.discord.clientId': {
    type: 'string',
    default: '',
    allowEmpty: true,
    max: 25,
    pattern: /^\d{5,25}$/,
    patternMessage: 'Die Client-ID besteht nur aus Ziffern.',
  },
  'auth.discord.clientSecret': { type: 'secret', default: '', max: 128 },
  'auth.discord.allowRegistration': { type: 'bool', default: false },
  'auth.discord.guildId': {
    type: 'string',
    default: '',
    allowEmpty: true,
    max: 25,
    pattern: /^\d{5,25}$/,
    patternMessage: 'Die Server-ID besteht nur aus Ziffern.',
  },
  'auth.discord.roleIds': { type: 'list', item: snowflake, max: 20, default: [] },
  'auth.discord.guildSkipsInvite': { type: 'bool', default: true },

  'auth.github.enabled': { type: 'bool', default: false },
  'auth.github.clientId': clientId(100),
  'auth.github.clientSecret': { type: 'secret', default: '', max: 200 },
  'auth.github.allowRegistration': { type: 'bool', default: false },
  'auth.github.baseUrl': { type: 'url', default: 'https://github.com', origin: true },

  'auth.google.enabled': { type: 'bool', default: false },
  'auth.google.clientId': clientId(),
  'auth.google.clientSecret': { type: 'secret', default: '', max: 200 },
  'auth.google.allowRegistration': { type: 'bool', default: false },

  'auth.microsoft.enabled': { type: 'bool', default: false },
  'auth.microsoft.clientId': clientId(100),
  'auth.microsoft.clientSecret': { type: 'secret', default: '', max: 200 },
  'auth.microsoft.allowRegistration': { type: 'bool', default: false },
  'auth.microsoft.tenant': {
    type: 'string',
    default: 'common',
    max: 100,
    pattern: /^[\w.-]+$/,
    patternMessage: 'Erlaubt sind common, organizations, consumers oder die Mandanten-ID.',
  },

  'auth.gitlab.enabled': { type: 'bool', default: false },
  'auth.gitlab.clientId': clientId(),
  'auth.gitlab.clientSecret': { type: 'secret', default: '', max: 200 },
  'auth.gitlab.allowRegistration': { type: 'bool', default: false },
  'auth.gitlab.baseUrl': { type: 'url', default: 'https://gitlab.com', origin: true },

  'auth.oidc.enabled': { type: 'bool', default: false },
  'auth.oidc.name': { type: 'string', default: 'SSO', max: 40 },
  'auth.oidc.issuer': { type: 'url', default: '', allowEmpty: true },
  'auth.oidc.clientId': clientId(),
  'auth.oidc.clientSecret': { type: 'secret', default: '', max: 300 },
  'auth.oidc.scopes': {
    type: 'string',
    default: 'openid profile email',
    max: 200,
    pattern: /^openid( [\w:./-]+)*$/,
    patternMessage: 'Die Scopes beginnen mit openid und sind durch Leerzeichen getrennt.',
  },
  'auth.oidc.allowRegistration': { type: 'bool', default: false },

  'embed.default': { type: 'embed', default: DEFAULT_TEMPLATE },
  'embed.allowUserTemplates': { type: 'bool', default: true },

  'webhook.enabled': { type: 'bool', default: false },
  'webhook.url': {
    type: 'secret',
    default: '',
    max: 300,
    pattern: /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/,
    patternMessage: 'Das ist keine Discord-Webhook-Adresse (https://discord.com/api/webhooks/…).',
  },
  'webhook.name': { type: 'string', default: 'MoeShare', max: 80 },
  'webhook.successColor': { type: 'color', default: '#03fc28' },
  'webhook.errorColor': { type: 'color', default: '#fc0303' },
  'webhook.events': { type: 'list', values: WEBHOOK_EVENTS, default: WEBHOOK_EVENTS },

  'system.trustProxy': { type: 'bool', default: false },
  'system.errorReports': { type: 'bool', default: false },
  'system.logIps': { type: 'bool', default: true },
  'system.auditRetentionDays': { type: 'int', min: 7, max: 730, default: 90 },
};

const fail = (key, message) => {
  throw badRequest(message, { field: key });
};

function parseUrl(key, text, { allowPath = false } = {}) {
  if (allowPath && text.startsWith('/') && !text.startsWith('//')) {
    if (text.length > 300) fail(key, 'Maximal 300 Zeichen.');
    return { text };
  }
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail(key, 'Bitte eine vollständige Adresse wie https://example.com eingeben.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail(key, 'Nur http- und https-Adressen sind erlaubt.');
  if (text.length > 500) fail(key, 'Maximal 500 Zeichen.');
  return { text, parsed };
}

const VALIDATORS = {
  bool(key, def, value) {
    if (typeof value !== 'boolean') fail(key, 'Erwartet wird an oder aus.');
    return value;
  },

  int(key, def, value) {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;
    if (!Number.isInteger(number)) fail(key, 'Bitte eine ganze Zahl eingeben.');
    if (number < def.min) fail(key, `Der Wert muss mindestens ${def.min} sein.`);
    if (number > def.max) fail(key, `Der Wert darf höchstens ${def.max} sein.`);
    return number;
  },

  bytes(key, def, value) {
    if (value === null || value === undefined || value === '' || value === 0) return null;
    if (!Number.isFinite(value) || value < 0) fail(key, 'Bitte eine gültige Größe eingeben.');
    if (value < 1024) fail(key, 'Die Größe muss mindestens 1 KB sein.');
    return Math.round(value);
  },

  color(key, def, value) {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.trim()))
      fail(key, 'Bitte eine Farbe als Hex-Wert wie #8b5cf6 eingeben.');
    return value.trim().toLowerCase();
  },

  enum(key, def, value) {
    if (!def.values.includes(value)) fail(key, 'Ungültige Auswahl.');
    return value;
  },

  list(key, def, value) {
    if (!Array.isArray(value)) fail(key, 'Erwartet wird eine Liste.');
    const items = [];
    for (const raw of value) {
      const item = def.values ? (def.values.includes(raw) ? raw : null) : def.item(raw);
      if (item === null) fail(key, `„${String(raw).slice(0, 30)}“ ist kein gültiger Eintrag.`);
      if (!items.includes(item)) items.push(item);
    }
    if (def.max && items.length > def.max) fail(key, `Höchstens ${def.max} Einträge.`);
    return items;
  },

  string(key, def, value) {
    if (typeof value !== 'string') fail(key, 'Ungültiger Text.');
    const text = def.multiline
      ? value
          .replace(/\r\n?/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      : value.replace(/\s+/g, ' ').trim();
    if (!text && !def.allowEmpty) fail(key, 'Dieses Feld darf nicht leer sein.');
    if (text.length > def.max) fail(key, `Maximal ${def.max} Zeichen.`);
    if (text && def.pattern && !def.pattern.test(text)) fail(key, def.patternMessage);
    return text;
  },

  secret(key, def, value) {
    if (typeof value !== 'string') fail(key, 'Ungültiger Text.');
    const text = value.trim();
    if (text.length > def.max) fail(key, `Maximal ${def.max} Zeichen.`);
    if (text && def.pattern && !def.pattern.test(text)) fail(key, def.patternMessage);
    return text;
  },

  url(key, def, value) {
    if (typeof value !== 'string') fail(key, 'Ungültige Adresse.');
    const text = value.trim();
    if (!text) return def.allowEmpty ? '' : fail(key, 'Dieses Feld darf nicht leer sein.');
    const { parsed } = parseUrl(key, text, def);
    if (!def.origin) return text;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username) {
      fail(key, 'Bitte nur Protokoll und Domain angeben, ohne Pfad (z. B. https://share.example.com).');
    }
    return parsed.origin;
  },

  links(key, def, value) {
    if (!Array.isArray(value)) fail(key, 'Erwartet wird eine Liste.');
    if (value.length > def.max) fail(key, `Höchstens ${def.max} Links.`);
    return value.map((link) => {
      const label = typeof link?.label === 'string' ? link.label.replace(/\s+/g, ' ').trim() : '';
      const url = typeof link?.url === 'string' ? link.url.trim() : '';
      if (!label || label.length > 40) fail(key, 'Jeder Link braucht eine Beschriftung mit höchstens 40 Zeichen.');
      if (!url) fail(key, `Für „${label}“ fehlt die Adresse.`);
      return { label, url: parseUrl(key, url, { allowPath: true }).text };
    });
  },

  embed(key, def, value) {
    try {
      return normalizeTemplate(value);
    } catch (error) {
      if (error instanceof HttpError) error.field = `${key}.${error.field}`;
      throw error;
    }
  },
};

function validate(key, value) {
  const def = DEFINITIONS[key];
  if (!def) fail(key, 'Unbekannte Einstellung.');
  return VALIDATORS[def.type](key, def, value);
}

let values = {};
let revision = null;
let loaded = false;
const listeners = new Set();

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function defaultFor(key) {
  const fallback = DEFINITIONS[key].default;
  return typeof fallback === 'function' ? fallback() : fallback;
}

function get(key) {
  if (!(key in DEFINITIONS)) throw new Error(`Unbekannte Einstellung: ${key}`);
  return key in values ? values[key] : defaultFor(key);
}

function all() {
  return Object.fromEntries(Object.keys(DEFINITIONS).map((key) => [key, get(key)]));
}

function forAdmin() {
  const current = all();
  const secrets = {};
  for (const [key, def] of Object.entries(DEFINITIONS)) {
    if (def.type !== 'secret') continue;
    secrets[key] = Boolean(current[key]);
    current[key] = '';
  }
  return { values: current, secrets };
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw badRequest('Ungültige Anfrage.');
  const next = {};
  for (const [key, raw] of Object.entries(patch)) {
    if (raw !== undefined) next[key] = validate(key, raw);
  }
  const merged = { ...all(), ...next };
  const touches = (...keys) => keys.some((key) => key in next);
  for (const provider of OAUTH_PROVIDERS) {
    const key = (name) => `auth.${provider}.${name}`;
    if (!touches(key('enabled'), key('clientId'), key('clientSecret'), key('issuer')) || !merged[key('enabled')]) continue;
    if (!merged[key('clientId')] || !merged[key('clientSecret')]) fail(key('enabled'), 'Dafür braucht es Client-ID und Client-Secret.');
    if (provider === 'oidc' && !merged[key('issuer')]) fail(key('enabled'), 'Trage zuerst die Adresse des Anbieters (Issuer) ein.');
  }
  if (touches('webhook.enabled', 'webhook.url') && merged['webhook.enabled'] && !merged['webhook.url']) {
    fail('webhook.enabled', 'Trage zuerst eine Webhook-Adresse ein.');
  }
  return next;
}

function notify(changed) {
  if (!changed.length) return;
  for (const listener of listeners) {
    try {
      listener(changed);
    } catch (error) {
      log.error('Die Einstellungen konnten nicht angewendet werden', { keys: changed, error });
    }
  }
}

async function persist(key, value, actorId = null) {
  await db.run(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [key, JSON.stringify(value), Date.now(), actorId]
  );
}

async function readStored() {
  const rows = await db.all('SELECT key, value FROM settings');
  const stored = {};
  const meta = {};
  for (const row of rows) {
    if (row.key.startsWith('_meta.')) {
      meta[row.key] = row.value;
    } else if (row.key in DEFINITIONS) {
      try {
        stored[row.key] = validate(row.key, JSON.parse(row.value));
      } catch (error) {
        log.warn('Gespeicherte Einstellung ist ungültig und wird ignoriert', { key: row.key, error });
      }
    }
  }
  return { stored, meta };
}

async function importLegacyEnv(stored, legacy) {
  const imported = [];
  for (const [key, { value, source }] of Object.entries(legacy.values)) {
    if (key in stored) continue;
    try {
      stored[key] = validate(key, value);
      await persist(key, stored[key]);
      imported.push(key);
    } catch (error) {
      log.warn('Wert aus der Umgebung übersprungen', { variable: source, error });
    }
  }
  if (imported.includes('webhook.enabled') && stored['webhook.enabled'] && !stored['webhook.url']) {
    stored['webhook.enabled'] = false;
    await persist('webhook.enabled', false);
    log.warn('LOGS war an, aber ohne gültige DISCORD_WEBHOOK_URL. Der Webhook bleibt aus, bis du eine Adresse einträgst');
  }
  const count = imported.length;
  await persist(META_IMPORTED, new Date().toISOString());
  if (count) log.info(`${count} Einstellungen aus der Umgebung übernommen, ab jetzt änderst du sie in der Weboberfläche`);
}

async function load(env = process.env) {
  const { stored, meta } = await readStored();
  const legacy = readLegacyEnv(env);
  if (!meta[META_IMPORTED]) await importLegacyEnv(stored, legacy);
  else if (legacy.present.length) {
    log.warn('Diese Umgebungsvariablen liest MoeShare nicht mehr, du kannst sie entfernen', { variables: legacy.present });
  }
  values = stored;
  revision = meta[META_REVISION] || null;
  loaded = true;
}

const hasDynamicDefault = (key) => typeof DEFINITIONS[key].default === 'function';

async function update(patch, actorId = null) {
  const next = validatePatch(patch);
  const changed = [];
  let written = false;
  for (const [key, value] of Object.entries(next)) {
    const differs = !same(value, get(key));
    if (!differs && (key in values || !hasDynamicDefault(key))) continue;
    await persist(key, value, actorId);
    values[key] = value;
    written = true;
    if (differs) changed.push(key);
  }
  if (written) {
    const token = crypto.randomBytes(9).toString('base64url');
    await persist(META_REVISION, token, actorId);
    revision = JSON.stringify(token);
  }
  notify(changed);
  return { changed };
}

function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh() {
  if (!loaded) return;
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [META_REVISION]);
  if ((row ? row.value : null) === revision) return;
  const before = all();
  const { stored, meta } = await readStored();
  values = stored;
  revision = meta[META_REVISION] || null;
  notify(Object.keys(DEFINITIONS).filter((key) => !same(before[key], get(key))));
}

function startSync(intervalMs = 2000) {
  setInterval(() => refresh().catch((error) => log.debug('Einstellungen nicht abgeglichen', { error })), intervalMs).unref();
}

module.exports = { load, get, all, forAdmin, validatePatch, update, onChange, startSync };
