'use strict';

const crypto = require('crypto');
const sharp = require('sharp');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, forbidden, notFound, tooLarge } = require('../lib/errors');
const settings = require('./settingsService');

const log = logger.scope('profilbilder');

const SIZE = 256;
const MIN_SIDE = 32;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const MAX_PIXELS = 50 * 1000 * 1000;
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);
const CACHE_BYTES = 32 * 1024 * 1024;

const cache = new Map();
let cachedBytes = 0;

const enabled = () => settings.get('profiles.avatars');

function urlFor(row) {
  if (!enabled() || !row || !row.avatar || !row.username) return null;
  return `/u/${encodeURIComponent(row.username)}/avatar?v=${encodeURIComponent(row.avatar)}`;
}

function remember(key, value) {
  if (value.image.length > CACHE_BYTES / 4) return;
  while (cachedBytes + value.image.length > CACHE_BYTES && cache.size) {
    const [oldest, entry] = cache.entries().next().value;
    cache.delete(oldest);
    cachedBytes -= entry.image.length;
  }
  cache.set(key, value);
  cachedBytes += value.image.length;
}

function forget(userId) {
  for (const [key, entry] of cache) {
    if (entry.userId !== Number(userId)) continue;
    cache.delete(key);
    cachedBytes -= entry.image.length;
  }
}

function number(value) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function cropOf(input) {
  if (!input || typeof input !== 'object') return null;
  const crop = { x: number(input.x), y: number(input.y), size: number(input.size) };
  return crop.x === null || crop.y === null || crop.size === null ? null : crop;
}

function region(crop, width, height) {
  const side = Math.min(width, height);
  const size = Math.max(1, Math.min(Math.round(crop ? crop.size : side), width, height));
  const left = Math.round(crop ? crop.x : (width - size) / 2);
  const top = Math.round(crop ? crop.y : (height - size) / 2);
  return {
    left: Math.max(0, Math.min(left, width - size)),
    top: Math.max(0, Math.min(top, height - size)),
    width: size,
    height: size,
  };
}

async function inspect(input) {
  try {
    return await sharp(input, { animated: true, limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    return null;
  }
}

async function encode(input, { animated, area }) {
  const pipeline = sharp(input, { animated, limitInputPixels: MAX_PIXELS });
  if (!animated) pipeline.rotate();
  return pipeline
    .extract(area)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 86, effort: 4, ...(animated ? { loop: 0 } : {}) })
    .toBuffer();
}

async function render(input, crop) {
  const meta = await inspect(input);
  if (!meta || !FORMATS.has(meta.format)) {
    throw badRequest('Das Bild lässt sich nicht lesen. Nimm ein JPG, PNG, WebP, AVIF oder GIF.', { field: 'image' });
  }
  const pages = Number(meta.pages) || 1;
  const frameHeight = pages > 1 ? Number(meta.pageHeight) || Math.round(meta.height / pages) : meta.height;
  const canAnimate = pages > 1 && ['gif', 'webp'].includes(meta.format) && settings.get('profiles.animatedAvatars');
  const swap = !canAnimate && (Number(meta.orientation) || 1) >= 5;
  const width = swap ? frameHeight : meta.width;
  const height = swap ? meta.width : frameHeight;
  if (Math.min(width, height) < MIN_SIDE) {
    throw badRequest(`Das Bild ist zu klein. Es braucht mindestens ${MIN_SIDE} × ${MIN_SIDE} Pixel.`, { field: 'image' });
  }
  const area = region(crop, width, height);
  if (canAnimate) {
    const moving = await encode(input, { animated: true, area });
    if (moving.length <= MAX_OUTPUT_BYTES) return { image: moving, animated: true };
    log.debug('Bewegtes Profilbild zu groß, nehme das erste Bild', { bytes: moving.length });
  }
  return { image: await encode(input, { animated: false, area }), animated: false };
}

function assertEnabled() {
  if (!enabled()) throw forbidden('Profilbilder sind auf diesem Server abgeschaltet.');
}

async function save(userId, input, crop) {
  assertEnabled();
  if (!Buffer.isBuffer(input) || !input.length) throw badRequest('Es kam kein Bild an.', { field: 'image' });
  if (input.length > MAX_INPUT_BYTES) throw tooLarge('Das Bild ist zu groß. Erlaubt sind bis zu 15 MB.');
  const { image, animated } = await render(input, cropOf(crop));
  const version = crypto.randomBytes(6).toString('base64url');
  const row = { user_id: userId, image, animated: animated ? 1 : 0, size_bytes: image.length, created_at: Date.now() };
  await db.upsert('user_avatars', row, ['user_id']);
  await db.run('UPDATE users SET avatar = ? WHERE id = ?', [version, userId]);
  forget(userId);
  return { version, animated, sizeBytes: image.length };
}

async function remove(userId) {
  const row = await db.get('SELECT avatar FROM users WHERE id = ?', [userId]);
  await db.run('DELETE FROM user_avatars WHERE user_id = ?', [userId]);
  await db.run('UPDATE users SET avatar = NULL WHERE id = ?', [userId]);
  forget(userId);
  return Boolean(row && row.avatar);
}

function hiddenByModeration(raw) {
  try {
    const profile = JSON.parse(raw || '{}');
    return Boolean(profile && profile.blocked);
  } catch {
    return false;
  }
}

async function read(username) {
  if (!enabled() || typeof username !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(username)) return null;
  const owner = await db.get('SELECT id, avatar, status, profile FROM users WHERE lower(username) = lower(?)', [username]);
  if (!owner || !owner.avatar || owner.status !== 'active' || hiddenByModeration(owner.profile)) return null;
  const key = `${owner.id}:${owner.avatar}`;
  if (cache.has(key)) return cache.get(key);
  const row = await db.get('SELECT image, animated FROM user_avatars WHERE user_id = ?', [owner.id]);
  if (!row || !row.image) return null;
  const found = { userId: Number(owner.id), version: owner.avatar, image: Buffer.from(row.image), animated: Boolean(Number(row.animated)) };
  remember(key, found);
  return found;
}

async function file(userId) {
  const row = await db.get('SELECT image FROM user_avatars WHERE user_id = ?', [userId]);
  return row && row.image ? Buffer.from(row.image) : null;
}

async function urlsFor(usernames) {
  const names = [...new Set(usernames.filter((name) => typeof name === 'string' && name))];
  if (!enabled() || !names.length) return new Map();
  const rows = await db.all(
    `SELECT username, avatar FROM users WHERE avatar IS NOT NULL AND status = 'active' AND username IN (${names.map(() => '?').join(', ')})`,
    names
  );
  return new Map(rows.map((row) => [row.username, urlFor(row)]));
}

async function urlOf(username) {
  return (await urlsFor([username])).get(username) || null;
}

function assertFound(found) {
  if (!found) throw notFound('Dieses Profilbild gibt es nicht.');
  return found;
}

module.exports = {
  SIZE,
  MAX_INPUT_BYTES,
  enabled,
  urlFor,
  urlsFor,
  urlOf,
  save,
  remove,
  read,
  file,
  render,
  assertFound,
};
