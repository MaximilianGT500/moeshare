'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const { displayPath } = require('../lib/slugs');
const protection = require('./protectionService');

const log = logger.scope('weiterleitungen');

const RESERVED = new Set([
  'a',
  'account',
  'admin',
  'api',
  'app',
  'auth',
  'dashboard',
  'datenschutz',
  'delete',
  'design',
  'download',
  'embed',
  'favicon.svg',
  'file',
  'files',
  'healthz',
  'i18n',
  'icons',
  'impressum',
  'login',
  'logout',
  'manifest.webmanifest',
  'oembed',
  'register',
  'report',
  'reset',
  's',
  'setup',
  'share-target',
  'sw.js',
  'u',
  'upload',
  'uploads',
  'view',
]);
const KINDS = ['file', 'link', 'album'];
const VARIANTS = ['view', 'direct', 'download'];
const REFRESH_MS = 10 * 1000;

let table = new Map();
let checkedAt = 0;
let signature = null;

function normalize(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value.startsWith('/') || value.length > 191 || value.includes('//') || /[\s?#\\]/.test(value)) return null;
  return value.replace(/\/+$/, '') || null;
}

function allowed(pathname, { allowReserved = [] } = {}) {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) return false;
  const first = segments[0].toLowerCase();
  return !RESERVED.has(first) || allowReserved.includes(first);
}

async function currentSignature() {
  const row = await db.get('SELECT COUNT(*) AS total, MAX(created_at) AS latest FROM redirects');
  return `${Number(row.total) || 0}:${Number(row.latest) || 0}`;
}

async function load() {
  const next = await currentSignature();
  const rows = await db.all('SELECT path, kind, target_id, variant FROM redirects');
  table = new Map(rows.map((row) => [row.path, { kind: row.kind, id: Number(row.target_id), variant: row.variant || 'view' }]));
  signature = next;
  checkedAt = Date.now();
  return table.size;
}

async function sync() {
  if ((await currentSignature()) !== signature) await load();
}

function refreshSoon() {
  if (Date.now() - checkedAt < REFRESH_MS) return;
  checkedAt = Date.now();
  sync().catch((error) => log.debug('Weiterleitungen ließen sich nicht laden', { error }));
}

async function add(pathname, kind, id, { variant = 'view', source = null, allowReserved = [] } = {}) {
  const value = normalize(pathname);
  if (!value || !KINDS.includes(kind) || !allowed(value, { allowReserved })) return false;
  const { changes } = await db.insertIgnore('redirects', {
    path: value,
    kind,
    target_id: id,
    variant: VARIANTS.includes(variant) ? variant : 'view',
    source,
    created_at: Date.now(),
  });
  if (changes) table.set(value, { kind, id, variant });
  return Boolean(changes);
}

async function targetOf(entry) {
  if (entry.kind === 'file') {
    const row = await db.get('SELECT * FROM file_data WHERE id = ? AND deleted_at IS NULL', [entry.id]);
    if (!row) return null;
    const slug = displayPath(row.slug || row.filename);
    const guarded = protection.isProtected(row) || (row.warning !== null && row.warning !== undefined);
    if (entry.variant === 'download') return `/download/${slug}`;
    if (entry.variant === 'direct' && !guarded) return `/uploads/${encodeURIComponent(row.username)}/${encodeURIComponent(row.filename)}`;
    return `/view/${slug}`;
  }
  if (entry.kind === 'link') {
    const row = await db.get('SELECT code FROM links WHERE id = ?', [entry.id]);
    return row ? `/s/${displayPath(row.code)}` : null;
  }
  const row = await db.get('SELECT code FROM albums WHERE id = ?', [entry.id]);
  return row ? `/a/${encodeURIComponent(row.code)}` : null;
}

async function middleware(req, res, next) {
  refreshSoon();
  if ((req.method !== 'GET' && req.method !== 'HEAD') || req.customDomain || !table.size) return next();
  const key = normalize(req.path);
  const entry = key ? table.get(key) : null;
  if (!entry) return next();
  try {
    const target = await targetOf(entry);
    if (!target || target === req.path) return next();
    res.set('Cache-Control', 'public, max-age=3600');
    return res.redirect(301, target);
  } catch (error) {
    return next(error);
  }
}

const has = (pathname) => table.has(normalize(pathname) || '');

const count = () => table.size;

module.exports = { load, add, middleware, has, count, normalize };
