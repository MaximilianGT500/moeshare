'use strict';

const db = require('../lib/db');
const { badRequest, notFound } = require('../lib/errors');
const { randomToken, sha256 } = require('../lib/secrets');
const { languageOf } = require('./preferenceService');

const PREFIX = 'ms_';
const MAX_TOKENS = 25;
const TOUCH_INTERVAL_MS = 60 * 1000;

const toRecord = (row) => ({
  id: row.id,
  name: row.name,
  hint: row.hint,
  legacy: Boolean(row.legacy),
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

function cleanName(name) {
  const text = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!text) throw badRequest('Gib dem Token einen Namen, z. B. „ShareX am PC“.');
  if (text.length > 60) throw badRequest('Der Name darf höchstens 60 Zeichen lang sein.');
  return text;
}

async function create(userId, name) {
  const label = cleanName(name);
  const count = await db.count('SELECT COUNT(*) FROM api_tokens WHERE user_id = ?', [userId]);
  if (count >= MAX_TOKENS) throw badRequest(`Mehr als ${MAX_TOKENS} Tokens sind nicht möglich. Widerrufe zuerst ein altes.`);

  const token = `${PREFIX}${randomToken(32)}`;
  const now = Date.now();
  const id = await db.insertRow('api_tokens', {
    user_id: userId,
    name: label,
    token_hash: sha256(token),
    hint: `${token.slice(0, 7)}…${token.slice(-4)}`,
    legacy: 0,
    created_at: now,
  });
  const row = await db.get('SELECT * FROM api_tokens WHERE id = ?', [id]);
  return { token, record: toRecord(row) };
}

async function resolve(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  const row = await db.get(
    `SELECT t.id AS token_id, t.last_used_at, u.id, u.username, u.role, u.status, u.preferences
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
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      isAdmin: row.role === 'admin',
      status: row.status,
      language: languageOf(row.preferences),
    },
  };
}

const listForUser = (userId) =>
  db.all('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY id DESC', [userId]).then((rows) => rows.map(toRecord));

async function revoke(userId, id) {
  const result = await db.run('DELETE FROM api_tokens WHERE user_id = ? AND id = ?', [userId, id]);
  if (!result.changes) throw notFound('Dieses Token gibt es nicht (mehr).');
}

const revokeAll = (userId) => db.run('DELETE FROM api_tokens WHERE user_id = ?', [userId]).then((r) => r.changes);

module.exports = { create, resolve, listForUser, revoke, revokeAll };
