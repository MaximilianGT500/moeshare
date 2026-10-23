'use strict';

const fsp = require('fs').promises;
const path = require('path');
const db = require('../lib/db');
const imaging = require('../lib/imaging');
const { badRequest } = require('../lib/errors');
const { filePaths } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');

const POSITIONS = [...Object.keys(imaging.POSITIONS), 'tile'];
const KINDS = ['text', 'image'];
const MAX_TEXT = 80;
const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_LOGO = 600 * 1024;

const DEFAULTS = {
  enabled: false,
  kind: 'text',
  text: '',
  position: 'bottom-right',
  size: 5,
  opacity: 70,
  color: '#ffffff',
  shadow: true,
  keepOriginal: false,
  image: null,
};

const allowed = () => settings.get('images.watermarks');

function parse(raw) {
  try {
    const value = JSON.parse(raw || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const within = (value, min, max, fallback) => (Number.isInteger(value) && value >= min && value <= max ? value : fallback);

function clean(stored) {
  const input = stored || {};
  return {
    enabled: input.enabled === true,
    kind: KINDS.includes(input.kind) ? input.kind : DEFAULTS.kind,
    text: typeof input.text === 'string' ? input.text.slice(0, MAX_TEXT) : '',
    position: POSITIONS.includes(input.position) ? input.position : DEFAULTS.position,
    size: within(input.size, 2, 60, DEFAULTS.size),
    opacity: within(input.opacity, 10, 100, DEFAULTS.opacity),
    color: typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : DEFAULTS.color,
    shadow: input.shadow !== false,
    keepOriginal: input.keepOriginal === true,
    image: typeof input.image === 'string' && input.image ? input.image : null,
  };
}

async function get(userId) {
  const row = await db.get('SELECT watermark FROM users WHERE id = ?', [userId]);
  return clean(parse(row && row.watermark));
}

const present = (config) => ({
  ...config,
  image: config.image ? `data:image/png;base64,${config.image}` : null,
  allowed: allowed(),
});

function usable(config) {
  if (!config.enabled) return false;
  return config.kind === 'image' ? Boolean(config.image) : Boolean(config.text.trim());
}

async function forUser(userId) {
  if (!allowed() || !userId) return null;
  const config = await get(userId);
  return usable(config) ? config : null;
}

async function decodeLogo(value) {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(value || ''));
  if (!match) throw badRequest('Das Logo muss ein Bild sein (PNG, JPEG, WebP oder SVG).', { field: 'image' });
  const buffer = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_UPLOAD) throw badRequest('Das Logo darf höchstens 4 MB groß sein.', { field: 'image' });
  let png;
  try {
    png = await imaging.normalizeLogo(buffer);
  } catch {
    throw badRequest('Das Logo ließ sich nicht lesen. Nimm ein PNG, JPEG, WebP oder SVG.', { field: 'image' });
  }
  if (png.length > MAX_LOGO)
    throw badRequest('Das Logo ist zu detailreich. Nimm eine einfachere oder kleinere Grafik.', { field: 'image' });
  return png.toString('base64');
}

async function validate(userId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('Ungültige Anfrage.');
  const current = await get(userId);
  const next = { ...current };
  if (input.enabled !== undefined) next.enabled = input.enabled === true;
  if (input.kind !== undefined) {
    if (!KINDS.includes(input.kind)) throw badRequest('Unbekannte Art von Wasserzeichen.', { field: 'kind' });
    next.kind = input.kind;
  }
  if (input.text !== undefined) {
    const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim() : '';
    if (text.length > MAX_TEXT) throw badRequest(`Der Text darf höchstens ${MAX_TEXT} Zeichen haben.`, { field: 'text' });
    next.text = text;
  }
  if (input.position !== undefined) {
    if (!POSITIONS.includes(input.position)) throw badRequest('Unbekannte Position.', { field: 'position' });
    next.position = input.position;
  }
  for (const [key, min, max] of [
    ['size', 2, 60],
    ['opacity', 10, 100],
  ]) {
    if (input[key] === undefined) continue;
    const value = Number(input[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw badRequest(`Erlaubt sind ${min} bis ${max}.`, { field: key });
    next[key] = value;
  }
  if (input.color !== undefined) {
    if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) {
      throw badRequest('Bitte eine Farbe als Hex-Wert wie #ffffff eingeben.', { field: 'color' });
    }
    next.color = input.color.toLowerCase();
  }
  if (input.shadow !== undefined) next.shadow = input.shadow !== false;
  if (input.keepOriginal !== undefined) next.keepOriginal = input.keepOriginal === true;
  if (input.image === null) next.image = null;
  else if (typeof input.image === 'string' && input.image.startsWith('data:')) next.image = await decodeLogo(input.image);
  if (next.enabled && next.kind === 'text' && !next.text) throw badRequest('Gib einen Text für das Wasserzeichen ein.', { field: 'text' });
  if (next.enabled && next.kind === 'image' && !next.image) throw badRequest('Lade zuerst ein Logo hoch.', { field: 'image' });
  return next;
}

async function save(userId, input) {
  if (!allowed()) throw badRequest('Wasserzeichen sind auf diesem Server abgeschaltet.');
  const next = await validate(userId, input);
  await db.run('UPDATE users SET watermark = ? WHERE id = ?', [JSON.stringify(next), userId]);
  return next;
}

async function reset(userId) {
  await db.run('UPDATE users SET watermark = NULL WHERE id = ?', [userId]);
}

async function sampleFor(username) {
  const rows = await db.all(
    `SELECT * FROM file_data WHERE username = ? AND ${files.LIVE} AND storage = 'local' AND resolution_width >= 400 ORDER BY id DESC LIMIT 20`,
    [username]
  );
  for (const row of rows) {
    if (!imaging.canProcess(path.extname(row.filename))) continue;
    try {
      return await fsp.readFile(filePaths(row.username, row.filename).file);
    } catch {}
  }
  return null;
}

async function preview(user, input) {
  const config = input ? await validate(user.id, { ...input, enabled: true }) : await get(user.id);
  if (!usable({ ...config, enabled: true })) throw badRequest('Für die Vorschau fehlt noch ein Text oder Logo.');
  return imaging.preview(await sampleFor(user.username), config);
}

module.exports = { allowed, get, present, forUser, save, reset, preview };
