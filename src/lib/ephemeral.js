'use strict';

const db = require('./db');

const valid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;

function parse(row) {
  if (!row || row.expires_at < Date.now()) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

async function put(kind, id, data, ttlMs) {
  await db.run('INSERT OR REPLACE INTO ephemeral (kind, id, data, expires_at) VALUES (?, ?, ?, ?)', [
    kind,
    id,
    JSON.stringify(data),
    Date.now() + ttlMs,
  ]);
}

async function putIfAbsent(kind, id, data, ttlMs) {
  await db.run('DELETE FROM ephemeral WHERE kind = ? AND id = ? AND expires_at < ?', [kind, id, Date.now()]);
  await db.run('INSERT OR IGNORE INTO ephemeral (kind, id, data, expires_at) VALUES (?, ?, ?, ?)', [
    kind,
    id,
    JSON.stringify(data),
    Date.now() + ttlMs,
  ]);
  return get(kind, id);
}

async function get(kind, id) {
  if (!valid(id)) return null;
  return parse(await db.get('SELECT data, expires_at FROM ephemeral WHERE kind = ? AND id = ?', [kind, id]));
}

async function take(kind, id) {
  if (!valid(id)) return null;
  const rows = await db.all('DELETE FROM ephemeral WHERE kind = ? AND id = ? RETURNING data, expires_at', [kind, id]);
  return parse(rows[0]);
}

async function increment(kind, id, field) {
  if (!/^\w+$/.test(field)) throw new Error(`Ungültiges Feld: ${field}`);
  if (!valid(id)) return null;
  const rows = await db.all(
    `UPDATE ephemeral SET data = json_set(data, '$.${field}', COALESCE(json_extract(data, '$.${field}'), 0) + 1)
     WHERE kind = ? AND id = ? AND expires_at >= ? RETURNING data, expires_at`,
    [kind, id, Date.now()]
  );
  return parse(rows[0]);
}

async function remove(kind, id) {
  if (!valid(id)) return;
  await db.run('DELETE FROM ephemeral WHERE kind = ? AND id = ?', [kind, id]);
}

async function prune() {
  const { changes } = await db.run('DELETE FROM ephemeral WHERE expires_at < ?', [Date.now()]);
  return changes;
}

module.exports = { put, putIfAbsent, get, take, increment, remove, prune };
