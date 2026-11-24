'use strict';

const config = require('../config');
const logger = require('../lib/logger');
const db = require('../lib/db');
const { translate } = require('../lib/i18n');
const settings = require('./settingsService');
const { createPulse, describe, handleSupport } = require('../lib/moepulse.mjs');

const log = logger.scope('pulse');

const APP = 'moeshare';
const NAME = 'MoeShare';
const NOTICE_TTL_MS = 5 * 60 * 1000;
const HOST_TTL_MS = 10 * 60 * 1000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const COUNTED = { upload: 'upload', text: 'paste', link: 'link' };

let pulse = null;
let started = false;
let applying = false;
let hosts = [];
let hostsAt = 0;
let noticeCache = { at: 0, list: [] };
const seen = new WeakSet();

const endpointValue = () => String(process.env.MOEPULSE_ENDPOINT || '').trim();

function secure(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function lockedBy() {
  if (process.env.MOEPULSE_DISABLED === '1') return 'disabled';
  const endpoint = endpointValue();
  if (endpoint === 'off') return 'disabled';
  if (endpoint && !secure(endpoint)) return 'insecure';
  return null;
}

function installKind() {
  if (config.install === 'docker') return 'docker';
  if (process.env.pm_id !== undefined) return 'pm2';
  if (config.install === 'script') return 'script';
  return 'node';
}

const hostOf = (origin) => {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
};

async function refreshHosts() {
  if (Date.now() - hostsAt < HOST_TTL_MS) return hosts;
  hostsAt = Date.now();
  const own = [settings.get('site.baseUrl'), ...settings.get('site.domains')].map(hostOf);
  const rows = await db.all('SELECT domain FROM user_domains').catch(() => []);
  hosts = [...new Set([...own, ...rows.map((row) => String(row.domain || '').toLowerCase())])]
    .filter((host) => host.length >= 4 && !LOCAL_HOSTS.has(host))
    .slice(0, 200);
  return hosts;
}

async function features() {
  await refreshHosts().catch(() => hosts);
  const storage = require('./storageService');
  const oauth = require('./oauthService');
  const media = require('../lib/media');
  return {
    database: db.client,
    storage: storage.activeDriver(),
    sso: oauth.enabled().length > 0,
    language: settings.get('site.language'),
    ffmpeg: Boolean(media.ffmpegAvailable),
    clamav: Boolean(settings.get('clamav.enabled')),
  };
}

async function metrics() {
  const stored = await db.get('SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM file_data WHERE deleted_at IS NULL');
  return {
    users: await db.count('SELECT COUNT(*) FROM users'),
    files: Number(stored && stored.count) || 0,
    bytes: Number(stored && stored.bytes) || 0,
    links: await db.count('SELECT COUNT(*) FROM links'),
    albums: await db.count('SELECT COUNT(*) FROM albums'),
  };
}

const consent = () => ({ stats: settings.get('pulse.stats') === true, errors: settings.get('pulse.errors') === true });

function instance() {
  if (pulse) return pulse;
  pulse = createPulse({
    app: APP,
    version: config.version,
    dataDir: config.paths.data,
    root: config.paths.root,
    install: installKind(),
    paths: { uploads: config.paths.uploads },
    redact: () => hosts,
    consent,
    features,
    metrics,
    log: (level, text) => (level === 'warn' ? log.warn(text) : log.debug(text)),
  });
  return pulse;
}

function capture(error, context = {}, level = 'error') {
  if (!error || (typeof error === 'object' && seen.has(error))) return;
  if (typeof error === 'object') seen.add(error);
  instance().capture(error, context, level);
}

function routeOf(req) {
  const pattern = req.route && typeof req.route.path === 'string' ? `${req.baseUrl || ''}${req.route.path}`.replace(/^\/+/, '') : '?';
  return `${req.method} ${pattern || '/'}`.slice(0, 120);
}

const captureRequest = (error, req) => capture(error, { route: routeOf(req) });

function count(kind) {
  const name = COUNTED[kind];
  if (name && pulse) pulse.count(name);
}

async function start() {
  if (started) return;
  started = true;
  process.on('uncaughtExceptionMonitor', (error) => {
    if (error && typeof error === 'object') seen.add(error);
  });
  logger.onError(({ scope, message, error }) => {
    if (!(error instanceof Error) || seen.has(error)) return;
    seen.add(error);
    instance().capture(error, { scope: scope || 'server', step: String(message).slice(0, 120) });
  });
  settings.onChange((keys) => {
    if (applying || !(keys.includes('pulse.stats') || keys.includes('pulse.errors'))) return;
    instance()
      .refresh()
      .catch(() => {});
  });
  await refreshHosts().catch(() => hosts);
  await instance().start();
}

const flush = (ms = 2000) => (pulse ? pulse.flush(ms) : Promise.resolve());

const stop = () => (pulse ? pulse.stop() : Promise.resolve());

function endpointHost() {
  const value = endpointValue();
  if (!value || value === 'off') return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function state(language = 'de') {
  const current = instance().status();
  return {
    texts: describe(language === 'en' ? 'en' : 'de', NAME),
    value: consent(),
    status: {
      installId: current.installId,
      lastHeartbeat: current.lastHeartbeat,
      lastError: current.lastError,
      running: current.running,
      queued: current.queued,
      blocked: current.blocked,
    },
    locked: lockedBy(),
    endpoint: endpointHost(),
    unread: instance().support.unread(),
  };
}

async function quietly(patch, actorId) {
  applying = true;
  try {
    await settings.update(patch, actorId);
  } finally {
    applying = false;
  }
}

async function setConsent(value, actorId = null) {
  await quietly({ 'pulse.stats': value.stats === true, 'pulse.errors': value.errors === true }, actorId);
  await instance().refresh();
}

async function preview() {
  await refreshHosts().catch(() => hosts);
  return instance().preview();
}

async function forget(actorId = null) {
  const done = await instance().forget();
  if (done) await quietly({ 'pulse.stats': false, 'pulse.errors': false }, actorId);
  return done;
}

async function notices({ force = false } = {}) {
  if (lockedBy()) return [];
  const client = instance();
  if (client.status().running && !force) return client.notices();
  if (!force && Date.now() - noticeCache.at < NOTICE_TTL_MS) return noticeCache.list;
  const list = await client.fetchNotices();
  noticeCache = { at: Date.now(), list };
  return list;
}

async function checkUpdate({ force = false } = {}) {
  if (lockedBy()) return null;
  return instance().checkUpdate({ force });
}

async function support(body, language = 'de') {
  const result = await handleSupport(instance(), body);
  if (result.body && typeof result.body.message === 'string') result.body.message = translate(language, result.body.message);
  return result;
}

module.exports = {
  APP,
  NAME,
  start,
  stop,
  flush,
  capture,
  captureRequest,
  count,
  state,
  setConsent,
  preview,
  forget,
  notices,
  checkUpdate,
  support,
  lockedBy,
};
