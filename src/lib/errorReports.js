'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

const target = config.glitchtip;

const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const HOURLY_LIMIT = 30;
const SAFE_FIELDS = new Set(['status', 'code', 'key', 'keys', 'version', 'event', 'action', 'variable', 'method', 'ms', 'id']);
const DYNAMIC_PATHS = /^\/(view|download|delete|oembed|uploads|register|setup)\/.*/;
const EXTENSIONS = /^(chrome|moz|safari|safari-web|ms-browser)-extension:/;

const log = logger.scope('reports');
const http = axios.create({ timeout: 5000 });
const inDocker = fs.existsSync('/.dockerenv');
const pending = new Set();
const recent = new Map();
let sentAt = [];
let isEnabled = () => false;

function allow(fingerprint) {
  const now = Date.now();
  sentAt = sentAt.filter((at) => now - at < 60 * 60 * 1000);
  if (sentAt.length >= HOURLY_LIMIT) return false;
  if (now - (recent.get(fingerprint) || 0) < REPEAT_WINDOW_MS) return false;
  recent.set(fingerprint, now);
  if (recent.size > 500) recent.delete(recent.keys().next().value);
  sentAt.push(now);
  return true;
}

const HOME = os.homedir().length > 3 ? os.homedir() : null;

function scrub(value) {
  let text = String(value).split(config.paths.root).join('<moeshare>');
  if (HOME) text = text.split(HOME).join('~');
  return text
    .replace(/(?:[A-Za-z]:)?[^\s'"`()]*[\\/]node_modules[\\/]/g, 'node_modules/')
    .replace(/(uploads[\\/])[^\\/\s'"`]+/gi, '$1<benutzer>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>')
    .replace(/\bms_[\w-]{16,}/g, 'ms_<token>')
    .replace(/([?&](?:token|invite|mfa|code|state|oauth|ticket|nonce)=)[^&\s'"]+/gi, '$1<entfernt>');
}

function frames(stack) {
  return String(stack || '')
    .split('\n')
    .map((line) => /^\s*at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/.exec(line))
    .filter(Boolean)
    .map(([, fn, file, line, column]) => ({
      function: fn || '?',
      filename: scrub(file),
      lineno: Number(line),
      colno: Number(column),
      in_app: !/node_modules|^node:/.test(file),
    }))
    .reverse();
}

function event({ scope, message, fields, error }) {
  const extra = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => SAFE_FIELDS.has(key))
      .map(([key, value]) => [key, typeof value === 'string' ? scrub(value) : value])
  );
  return {
    event_id: crypto.randomBytes(16).toString('hex'),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    logger: scope ? `moeshare.${scope}` : 'moeshare',
    release: `moeshare@${config.version}`,
    environment: 'production',
    message: { formatted: scrub(message) },
    exception: error
      ? { values: [{ type: error.name || 'Error', value: scrub(error.message || ''), stacktrace: { frames: frames(error.stack) } }] }
      : undefined,
    tags: { scope: scope || 'server', node: process.versions.node, os: process.platform, docker: String(inDocker) },
    extra,
    contexts: { runtime: { name: 'node', version: process.versions.node }, os: { name: process.platform } },
  };
}

function send(url, body, headers) {
  const request = http
    .post(url, body, { headers })
    .catch((error) => log.debug('Bericht an GlitchTip nicht zugestellt', { status: error.response && error.response.status }))
    .finally(() => pending.delete(request));
  pending.add(request);
}

const active = () => Boolean(target) && isEnabled();

function report(entry) {
  if (!active()) return;
  if (!allow(`${entry.scope}|${entry.message}|${entry.error ? entry.error.message : ''}`)) return;
  send(target.store, event(entry), {
    'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=moeshare/${config.version}, sentry_key=${target.key}`,
    'Content-Type': 'application/json',
  });
}

function cleanUrl(value, documentOrigin) {
  const text = String(value || '');
  if (!text || /^[a-z-]+$/i.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.origin !== documentOrigin) return url.origin;
    return `https://instanz${url.pathname.replace(DYNAMIC_PATHS, '/$1/…')}`;
  } catch {
    return text.slice(0, 40);
  }
}

function securityReport(body) {
  if (!active() || !body || typeof body !== 'object') return false;
  const raw = body['csp-report'] || (Array.isArray(body) && body[0] && body[0].body) || body.body;
  if (!raw || typeof raw !== 'object') return false;
  const blocked = String(raw['blocked-uri'] || raw.blockedURL || '');
  const source = String(raw['source-file'] || raw.sourceFile || '');
  if (EXTENSIONS.test(blocked) || EXTENSIONS.test(source)) return false;

  let origin = null;
  try {
    origin = new URL(raw['document-uri'] || raw.documentURL).origin;
  } catch {
    return false;
  }
  const directive = String(raw['effective-directive'] || raw.effectiveDirective || raw['violated-directive'] || '').slice(0, 60);
  const cleaned = {
    'document-uri': cleanUrl(raw['document-uri'] || raw.documentURL, origin),
    'blocked-uri': cleanUrl(blocked, origin),
    'violated-directive': directive,
    'effective-directive': directive,
    'source-file': cleanUrl(source, origin),
    'line-number': Number(raw['line-number'] || raw.lineNumber) || undefined,
    'column-number': Number(raw['column-number'] || raw.columnNumber) || undefined,
    disposition: raw.disposition === 'report' ? 'report' : 'enforce',
  };
  if (!allow(`csp|${directive}|${cleaned['blocked-uri']}`)) return false;
  send(target.security, { 'csp-report': cleaned }, { 'Content-Type': 'application/csp-report' });
  return true;
}

function start(enabled) {
  isEnabled = enabled;
  logger.onError(report);
}

const flush = (timeoutMs) =>
  Promise.race([Promise.allSettled([...pending]), new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())]);

const destination = () => (target ? target.source : 'off');

module.exports = { start, flush, active, destination, securityReport };
