'use strict';

const db = require('../lib/db');
const { badRequest, notFound } = require('../lib/errors');
const { randomToken, sha256 } = require('../lib/secrets');
const { EXPIRY_CHOICES } = require('../lib/expiry');
const { STYLES } = require('../lib/slugs');
const { languageOf } = require('./preferenceService');

const PREFIX = 'ms_';
const MAX_TOKENS = 25;
const TOUCH_INTERVAL_MS = 60 * 1000;
const SCOPES = ['upload', 'links', 'read', 'delete'];
const PRESET_KEYS = ['album', 'tags', 'expires', 'urlStyle', 'warning'];
const MAX_PRESET_TAGS = 20;

function scopesOf(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const list = String(raw)
    .split(',')
    .filter((scope) => SCOPES.includes(scope));
  return list.length === SCOPES.length ? null : list;
}

function presetOf(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const preset = Object.fromEntries(
      PRESET_KEYS.filter((key) => value[key] !== undefined && value[key] !== null).map((key) => [key, value[key]])
    );
    return Object.keys(preset).length ? preset : null;
  } catch {
    return null;
  }
}

const toRecord = (row) => ({
  id: row.id,
  name: row.name,
  hint: row.hint,
  legacy: Boolean(row.legacy),
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  scopes: scopesOf(row.scopes),
  preset: presetOf(row.preset),
});

function cleanName(name) {
  const text = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!text) throw badRequest('Gib dem Token einen Namen, z. B. „ShareX am PC“.');
  if (text.length > 60) throw badRequest('Der Name darf höchstens 60 Zeichen lang sein.');
  return text;
}

function cleanScopes(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((scope) => !SCOPES.includes(scope))) throw badRequest('Unbekanntes Recht.', { field: 'scopes' });
  const list = SCOPES.filter((scope) => value.includes(scope));
  if (!list.length) throw badRequest('Ein Token braucht mindestens ein Recht.', { field: 'scopes' });
  return list.length === SCOPES.length ? null : list.join(',');
}

function cleanPreset(value, validate) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw badRequest('Ungültige Vorgaben.', { field: 'preset' });
  const preset = {};
  for (const key of Object.keys(value)) {
    if (!PRESET_KEYS.includes(key)) throw badRequest('Ungültige Vorgaben.', { field: 'preset' });
  }
  if (value.album !== undefined && value.album !== null && value.album !== '') {
    const album = Number(value.album);
    if (!Number.isSafeInteger(album) || album < 1) throw badRequest('Dieses Album gibt es nicht.', { field: 'album' });
    preset.album = album;
  }
  if (value.tags !== undefined && value.tags !== null && value.tags !== '') {
    const list = (Array.isArray(value.tags) ? value.tags : String(value.tags).split(/[\s,]+/))
      .map((tag) => String(tag).trim())
      .filter(Boolean);
    if (list.length > MAX_PRESET_TAGS) throw badRequest(`Höchstens ${MAX_PRESET_TAGS} Tags.`, { field: 'tags' });
    if (list.length) preset.tags = list.join(',');
  }
  if (value.expires !== undefined && value.expires !== null && value.expires !== '') {
    if (!EXPIRY_CHOICES.includes(value.expires)) throw badRequest('Ungültige Ablaufzeit.', { field: 'expires' });
    preset.expires = value.expires;
  }
  if (value.urlStyle !== undefined && value.urlStyle !== null && value.urlStyle !== '') {
    if (!STYLES.includes(value.urlStyle)) throw badRequest('Diesen Adressstil gibt es nicht.', { field: 'urlStyle' });
    preset.urlStyle = value.urlStyle;
  }
  if (value.warning !== undefined && value.warning !== null && value.warning !== false) {
    if (typeof value.warning !== 'string' && value.warning !== true) throw badRequest('Ungültige Inhaltswarnung.', { field: 'warning' });
    const text = value.warning === true ? '' : value.warning.replace(/\s+/g, ' ').trim().slice(0, 100);
    preset.warning = text || true;
  }
  return validate(preset).then(() => (Object.keys(preset).length ? JSON.stringify(preset) : null));
}

async function create(userId, name, { scopes, preset, validate = async () => {} } = {}) {
  const label = cleanName(name);
  const count = await db.count('SELECT COUNT(*) FROM api_tokens WHERE user_id = ?', [userId]);
  if (count >= MAX_TOKENS) throw badRequest(`Mehr als ${MAX_TOKENS} Tokens sind nicht möglich. Widerrufe zuerst ein altes.`);
  const scopeValue = cleanScopes(scopes);
  const presetValue = await cleanPreset(preset, validate);

  const token = `${PREFIX}${randomToken(32)}`;
  const now = Date.now();
  const id = await db.insertRow('api_tokens', {
    user_id: userId,
    name: label,
    token_hash: sha256(token),
    hint: `${token.slice(0, 7)}…${token.slice(-4)}`,
    legacy: 0,
    created_at: now,
    scopes: scopeValue ?? null,
    preset: presetValue ?? null,
  });
  const row = await db.get('SELECT * FROM api_tokens WHERE id = ?', [id]);
  return { token, record: toRecord(row) };
}

async function update(userId, id, input = {}, { validate = async () => {} } = {}) {
  const row = await db.get('SELECT * FROM api_tokens WHERE user_id = ? AND id = ?', [userId, id]);
  if (!row) throw notFound('Dieses Token gibt es nicht (mehr).');
  const fields = {};
  if (input.name !== undefined) fields.name = cleanName(input.name);
  const scopes = cleanScopes(input.scopes);
  if (scopes !== undefined) fields.scopes = scopes;
  const preset = await cleanPreset(input.preset, validate);
  if (preset !== undefined) fields.preset = preset;
  const columns = Object.keys(fields);
  if (columns.length) {
    await db.run(`UPDATE api_tokens SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((column) => fields[column]),
      row.id,
    ]);
  }
  return toRecord(await db.get('SELECT * FROM api_tokens WHERE id = ?', [row.id]));
}

async function resolve(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  const row = await db.get(
    `SELECT t.id AS token_id, t.last_used_at, t.scopes, t.preset, u.id, u.username, u.role, u.status, u.preferences, u.avatar
     FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ?`,
    [sha256(token.trim())]
  );
  if (!row) return null;
  const now = Date.now();
  if (!row.last_used_at || now - row.last_used_at > TOUCH_INTERVAL_MS) {
    db.run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', [now, row.token_id]).catch(() => {});
  }
  return {
    tokenId: row.token_id,
    scopes: scopesOf(row.scopes),
    preset: presetOf(row.preset),
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      isAdmin: row.role === 'admin',
      status: row.status,
      language: languageOf(row.preferences),
      avatar: row.avatar || null,
    },
  };
}

const allows = (scopes, scope) => !scopes || scopes.includes(scope);

const listForUser = (userId) =>
  db.all('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY id DESC', [userId]).then((rows) => rows.map(toRecord));

async function revoke(userId, id) {
  const result = await db.run('DELETE FROM api_tokens WHERE user_id = ? AND id = ?', [userId, id]);
  if (!result.changes) throw notFound('Dieses Token gibt es nicht (mehr).');
}

const revokeAll = (userId) => db.run('DELETE FROM api_tokens WHERE user_id = ?', [userId]).then((r) => r.changes);

module.exports = { SCOPES, PRESET_KEYS, create, update, resolve, allows, listForUser, revoke, revokeAll };
