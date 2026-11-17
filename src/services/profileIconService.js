'use strict';

const crypto = require('crypto');
const db = require('../lib/db');
const { badRequest, forbidden, notFound, tooLarge } = require('../lib/errors');
const settings = require('./settingsService');
const avatars = require('./avatarService');

const SIZE = 128;
const MAX_ICONS = 40;
const KEY = /^[A-Za-z0-9_-]{12,24}$/;
const USERNAME = /^[A-Za-z0-9_.-]{1,64}$/;

const enabled = () => Boolean(settings.get('profiles.enabled') && settings.get('profiles.customIcons'));

const isKey = (value) => typeof value === 'string' && KEY.test(value);

const urlFor = (username, key) => `/u/${encodeURIComponent(username)}/icons/${key}`;

function assertEnabled() {
  if (!enabled()) throw forbidden('Eigene Symbole sind auf diesem Server abgeschaltet.');
}

function present(username, row) {
  return {
    key: row.icon_key,
    url: urlFor(username, row.icon_key),
    sizeBytes: Number(row.size_bytes) || 0,
    createdAt: Number(row.created_at) || null,
  };
}

async function list(user) {
  const rows = await db.all('SELECT icon_key, size_bytes, created_at FROM profile_icons WHERE user_id = ? ORDER BY id', [user.id]);
  return rows.map((row) => present(user.username, row));
}

async function keysOf(userId) {
  const rows = await db.all('SELECT icon_key FROM profile_icons WHERE user_id = ?', [userId]);
  return new Set(rows.map((row) => row.icon_key));
}

async function add(user, input, crop) {
  assertEnabled();
  if (!Buffer.isBuffer(input) || !input.length) throw badRequest('Es kam kein Bild an.', { field: 'image' });
  if (input.length > avatars.MAX_INPUT_BYTES) throw tooLarge('Das Bild ist zu groß. Erlaubt sind bis zu 15 MB.');
  const count = await db.count('SELECT COUNT(*) FROM profile_icons WHERE user_id = ?', [user.id]);
  if (count >= MAX_ICONS) {
    throw badRequest(`Du hast schon ${MAX_ICONS} eigene Symbole. Lösch erst eins, das du nicht mehr brauchst.`, { code: 'icons_full' });
  }
  const { image } = await avatars.render(input, avatars.cropOf(crop), { size: SIZE, animate: false });
  const row = {
    user_id: user.id,
    icon_key: crypto.randomBytes(12).toString('base64url'),
    image,
    size_bytes: image.length,
    created_at: Date.now(),
  };
  await db.insertRow('profile_icons', row);
  return present(user.username, row);
}

async function remove(user, key) {
  if (!isKey(key)) throw notFound('Dieses Symbol gibt es nicht.');
  const row = await db.get('SELECT id FROM profile_icons WHERE user_id = ? AND icon_key = ?', [user.id, key]);
  if (!row) throw notFound('Dieses Symbol gibt es nicht.');
  await db.run('DELETE FROM profile_icons WHERE id = ?', [row.id]);
  return true;
}

async function read(username, key) {
  if (!enabled() || !isKey(key) || typeof username !== 'string' || !USERNAME.test(username)) return null;
  const owner = await db.get('SELECT id, status, profile FROM users WHERE lower(username) = lower(?)', [username]);
  if (!owner || owner.status !== 'active' || avatars.hiddenByModeration(owner.profile)) return null;
  const row = await db.get('SELECT image FROM profile_icons WHERE user_id = ? AND icon_key = ?', [owner.id, key]);
  return row && row.image ? Buffer.from(row.image) : null;
}

module.exports = { SIZE, MAX_ICONS, enabled, isKey, urlFor, list, keysOf, add, remove, read };
