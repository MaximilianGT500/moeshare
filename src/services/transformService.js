'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const logger = require('../lib/logger');
const { badRequest, tooManyRequests } = require('../lib/errors');
const { extensionOf } = require('../lib/storage');
const settings = require('./settingsService');
const storage = require('./storageService');

const fsp = fs.promises;
const log = logger.scope('transforms');

const PARAMS = ['w', 'h', 'fit', 'format', 'q'];
const MAX_SIDE = 4096;
const MAX_PIXELS = 16_777_216;
const MAX_SOURCE_PIXELS = 100_000_000;
const MAX_REMOTE_BYTES = 60 * 1024 * 1024;
const FITS = ['inside', 'cover', 'contain', 'fill'];
const FORMATS = { webp: 'webp', avif: 'avif', jpeg: 'jpeg', jpg: 'jpeg', png: 'png' };
const SOURCES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff', '.gif']);
const TYPES = { webp: 'image/webp', avif: 'image/avif', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', tiff: 'image/tiff' };
const EXTENSIONS = { webp: '.webp', avif: '.avif', jpeg: '.jpg', png: '.png', gif: '.gif', tiff: '.tif' };
const INPUT_FORMATS = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
  '.avif': 'avif',
  '.tif': 'tiff',
  '.tiff': 'tiff',
  '.gif': 'gif',
};
const MAX_RUNNING = 2;
const MAX_WAITING = 20;
const MISSES_PER_MINUTE = 60;
const TOUCH_AFTER_MS = 60 * 60 * 1000;

const root = () => path.join(config.paths.uploads, '.cache', 'transforms');
const enabled = () => Boolean(settings.get('images.transforms'));
const limitBytes = () => settings.get('images.transformCache') || 512 * 1024 * 1024;

let running = 0;
const waiting = [];
const misses = new Map();
let sized = null;
let total = 0;
let pruning = null;

function wanted(query) {
  return Boolean(query) && PARAMS.some((key) => query[key] !== undefined && query[key] !== '');
}

function integer(value, field, min, max) {
  if (value === undefined || value === '') return null;
  const text = String(Array.isArray(value) ? value[0] : value).trim();
  if (!/^\d{1,5}$/.test(text)) throw badRequest(`Ungültiger Wert für ${field}.`, { field });
  const number = Number(text);
  if (number < min || number > max) throw badRequest(`${field} muss zwischen ${min} und ${max} liegen.`, { field });
  return number;
}

function parse(query) {
  const width = integer(query.w, 'w', 1, MAX_SIDE);
  const height = integer(query.h, 'h', 1, MAX_SIDE);
  const fitText = query.fit === undefined || query.fit === '' ? 'inside' : String(query.fit).toLowerCase();
  if (!FITS.includes(fitText)) throw badRequest(`fit kennt nur ${FITS.join(', ')}.`, { field: 'fit' });
  const formatText = query.format === undefined || query.format === '' ? null : String(query.format).toLowerCase();
  if (formatText && !FORMATS[formatText]) throw badRequest('format kennt nur webp, avif, jpeg und png.', { field: 'format' });
  const quality = integer(query.q, 'q', 30, 100);
  if (width && height && width * height > MAX_PIXELS) throw badRequest('So groß geht es nicht.', { field: 'w' });
  if (!width && !height && !formatText && !quality) throw badRequest('Gib eine Breite, Höhe oder ein Format an.', { field: 'w' });
  return { width, height, fit: fitText, format: formatText ? FORMATS[formatText] : null, quality: quality || 82 };
}

function supports(record) {
  return SOURCES.has(extensionOf(record.filename).toLowerCase());
}

function visitor(req) {
  return crypto
    .createHash('sha256')
    .update(String(req.ip || ''))
    .digest('base64url')
    .slice(0, 16);
}

function assertBudget(req) {
  const now = Date.now();
  const key = visitor(req);
  const times = (misses.get(key) || []).filter((at) => now - at < 60000);
  if (times.length >= MISSES_PER_MINUTE) throw tooManyRequests('Zu viele neue Bildgrößen in kurzer Zeit. Warte einen Moment.');
  times.push(now);
  if (!misses.has(key) && misses.size > 5000) misses.delete(misses.keys().next().value);
  misses.set(key, times);
}

function slot() {
  if (running < MAX_RUNNING) {
    running += 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_WAITING)
    return Promise.reject(tooManyRequests('Der Server rechnet gerade viele Bilder. Versuch es gleich noch einmal.'));
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

async function measure() {
  if (sized) return sized;
  sized = (async () => {
    total = 0;
    const dir = root();
    for (const name of await fsp.readdir(dir).catch(() => [])) {
      const stat = await fsp.stat(path.join(dir, name)).catch(() => null);
      if (stat && stat.isFile()) total += stat.size;
    }
  })();
  return sized;
}

async function prune() {
  if (pruning) return pruning;
  pruning = (async () => {
    const dir = root();
    const entries = [];
    for (const name of await fsp.readdir(dir).catch(() => [])) {
      const full = path.join(dir, name);
      const stat = await fsp.stat(full).catch(() => null);
      if (stat && stat.isFile()) entries.push({ full, size: stat.size, at: stat.mtimeMs });
    }
    entries.sort((a, b) => a.at - b.at);
    total = entries.reduce((sum, entry) => sum + entry.size, 0);
    const target = limitBytes() * 0.8;
    let removed = 0;
    for (const entry of entries) {
      if (total <= target) break;
      await fsp.rm(entry.full, { force: true }).catch(() => {});
      total -= entry.size;
      removed += 1;
    }
    if (removed) log.debug('Zwischenspeicher für Bildgrößen verkleinert', { removed });
  })().finally(() => {
    pruning = null;
  });
  return pruning;
}

function keyOf(record, plan, output) {
  return crypto
    .createHash('sha256')
    .update(
      [
        record.id,
        record.filename,
        record.sha256 || '',
        record.version || 1,
        plan.width || 0,
        plan.height || 0,
        plan.fit,
        output,
        plan.quality,
      ].join('|')
    )
    .digest('hex');
}

async function source(record, relative, file) {
  if (fs.existsSync(file)) return file;
  if (record.storage === 's3') {
    if (Number(record.size_bytes) > MAX_REMOTE_BYTES) throw badRequest('Diese Datei ist zu groß für andere Bildgrößen.', { field: 'w' });
    return storage.readRemote(relative);
  }
  return null;
}

function encode(pipeline, format, quality) {
  if (format === 'jpeg') return pipeline.jpeg({ quality, mozjpeg: true });
  if (format === 'png') return pipeline.png({ compressionLevel: 9, palette: quality < 90 });
  if (format === 'avif') return pipeline.avif({ quality: Math.max(30, quality - 20), effort: 4 });
  if (format === 'gif') return pipeline.gif();
  if (format === 'tiff') return pipeline.tiff({ quality });
  return pipeline.webp({ quality, effort: 4 });
}

async function render(input, plan, ext) {
  const animated = ext === '.gif' || ext === '.webp';
  const meta = await sharp(input, { failOn: 'none', animated }).metadata();
  if (!meta.width || !meta.height || meta.width * (meta.pageHeight || meta.height) > MAX_SOURCE_PIXELS) {
    throw badRequest('Dieses Bild lässt sich nicht umrechnen.', { field: 'w' });
  }
  const moving = animated && (meta.pages || 1) > 1;
  let output = plan.format || INPUT_FORMATS[ext] || 'webp';
  if (moving && output === 'avif') output = 'webp';
  if (!moving && output === 'gif') output = 'png';
  let pipeline = sharp(input, { failOn: 'none', animated: moving }).rotate();
  if (plan.width || plan.height) {
    pipeline = pipeline.resize({
      width: plan.width || undefined,
      height: plan.height || undefined,
      fit: plan.fit,
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  if (output === 'jpeg') pipeline = pipeline.flatten({ background: '#ffffff' });
  const buffer = await encode(pipeline, output, plan.quality).toBuffer();
  return { buffer, output };
}

async function send(req, res, record, { relative, file, cacheControl }) {
  if (!enabled() || !supports(record)) return false;
  const plan = parse(req.query);
  const ext = extensionOf(record.filename).toLowerCase();
  const guessed = plan.format || (ext === '.gif' ? 'gif' : INPUT_FORMATS[ext] || 'webp');
  const dir = root();
  await fsp.mkdir(dir, { recursive: true });
  await measure();
  const probe = path.join(dir, `${keyOf(record, plan, guessed)}${EXTENSIONS[guessed] || '.bin'}`);
  let target = fs.existsSync(probe) ? probe : null;
  let output = guessed;
  if (!target) {
    assertBudget(req);
    await slot();
    try {
      const input = await source(record, relative, file);
      if (!input) throw badRequest('Datei nicht gefunden.');
      const rendered = await render(input, plan, ext);
      output = rendered.output;
      target = path.join(dir, `${keyOf(record, plan, output)}${EXTENSIONS[output]}`);
      const partial = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.part`;
      await fsp.writeFile(partial, rendered.buffer);
      await fsp.rename(partial, target);
      total += rendered.buffer.length;
      if (output !== guessed) {
        await fsp.copyFile(target, probe).catch(() => {});
        total += rendered.buffer.length;
      }
    } finally {
      release();
    }
    if (total > limitBytes()) prune().catch((error) => log.debug('Zwischenspeicher ließ sich nicht aufräumen', { error }));
  } else {
    const stat = await fsp.stat(target).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > TOUCH_AFTER_MS) fsp.utimes(target, new Date(), new Date()).catch(() => {});
    output = Object.keys(EXTENSIONS).find((key) => EXTENSIONS[key] === path.extname(target)) || guessed;
  }
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(TYPES[output] || 'application/octet-stream');
  res.sendFile(target, { cacheControl: false, dotfiles: 'allow' });
  return true;
}

async function clear() {
  await fsp.rm(root(), { recursive: true, force: true });
  sized = null;
  total = 0;
}

async function usage() {
  await measure();
  return { bytes: total, limit: limitBytes() };
}

module.exports = { wanted, parse, supports, send, clear, usage, enabled, MAX_SIDE };
