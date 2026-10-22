'use strict';

const db = require('./db');

const valid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 191;

function parse(row) {
  if (!row || Number(row.expires_at) < Date.now()) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

async function put(kind, id, data, ttlMs) {
  await db.upsert('ephemeral', { kind, id, data: JSON.stringify(data), expires_at: Date.now() + ttlMs }, ['kind', 'id']);
}

async function putIfAbsent(kind, id, data, ttlMs) {
  await db.run('DELETE FROM ephemeral WHERE kind = ? AND id = ? AND expires_at < ?', [kind, id, Date.now()]);
  await db.insertIgnore('ephemeral', { kind, id, data: JSON.stringify(data), expires_at: Date.now() + ttlMs });
  return get(kind, id);
}

const read = (kind, id) => db.get('SELECT data, expires_at FROM ephemeral WHERE kind = ? AND id = ?', [kind, id]);

async function get(kind, id) {
  if (!valid(id)) return null;
  return parse(await read(kind, id));
}

async function take(kind, id) {
  if (!valid(id)) return null;
  const row = await read(kind, id);
  if (!row) return null;
  const { changes } = await db.run('DELETE FROM ephemeral WHERE kind = ? AND id = ? AND data = ?', [kind, id, row.data]);
  return changes === 1 ? parse(row) : null;
}

async function increment(kind, id, field) {
  if (!/^\w+$/.test(field)) throw new Error(`Ungültiges Feld: ${field}`);
  if (!valid(id)) return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await read(kind, id);
    const data = parse(row);
    if (!data) return null;
    data[field] = (Number(data[field]) || 0) + 1;
    const next = JSON.stringify(data);
    const { changes } = await db.run('UPDATE ephemeral SET data = ? WHERE kind = ? AND id = ? AND data = ? AND expires_at >= ?', [
      next,
      kind,
      id,
      row.data,
      Date.now(),
    ]);
    if (changes === 1) return data;
  }
  return null;
}

async function remove(kind, id) {
  if (!valid(id)) return;
  await db.run('DELETE FROM ephemeral WHERE kind = ? AND id = ?', [kind, id]);
}

async function prune() {
  const { changes } = await db.run('DELETE FROM ephemeral WHERE expires_at < ?', [Date.now()]);
  return changes;
}

async function acquire(name, ttlMs) {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const stored = await putIfAbsent('lock', name, { token }, ttlMs);
  return stored && stored.token === token ? token : null;
}

async function release(name, token) {
  const stored = await get('lock', name);
  if (stored && stored.token === token) await remove('lock', name);
}

module.exports = { put, putIfAbsent, get, take, increment, remove, prune, acquire, release };
