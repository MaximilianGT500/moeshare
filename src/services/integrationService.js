'use strict';

const db = require('../lib/db');
const { badRequest, notFound } = require('../lib/errors');
const { randomToken, sha256 } = require('../lib/secrets');

const PREFIX = 'msi_';
const MODES = ['direct', 'approval'];
const MAX_INTEGRATIONS = 25;
const MAX_MINUTES = 43200;
const TOUCH_INTERVAL_MS = 60 * 1000;

const toRecord = (row) => ({
  id: Number(row.id),
  name: row.name,
  hint: row.hint,
  mode: MODES.includes(row.mode) ? row.mode : 'approval',
  allowAdmins: Boolean(row.allow_admins),
  maxMinutes: row.max_minutes ? Number(row.max_minutes) : null,
  enabled: Boolean(row.enabled),
  createdAt: Number(row.created_at),
  createdBy: row.creator || null,
  lastUsedAt: row.last_used_at ? Number(row.last_used_at) : null,
  pending: Number(row.pending) || 0,
  issued: Number(row.issued) || 0,
});

const LIST = `
  SELECT i.*, u.username AS creator,
         (SELECT COUNT(*) FROM login_links l WHERE l.integration_id = i.id AND l.status = 'pending' AND l.expires_at > ?) AS pending,
         (SELECT COUNT(*) FROM login_links l WHERE l.integration_id = i.id) AS issued
  FROM integrations i LEFT JOIN users u ON u.id = i.created_by
`;

function cleanName(input) {
  const name = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw badRequest('Gib der Integration einen Namen, zum Beispiel „Support-Portal“.', { field: 'name' });
  if (name.length > 80) throw badRequest('Der Name darf höchstens 80 Zeichen lang sein.', { field: 'name' });
  return name;
}

function cleanMinutes(input) {
  if (input === null || input === undefined || input === '' || input === 0) return null;
  const minutes = Number(input);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    throw badRequest(`Bitte eine ganze Zahl zwischen 1 und ${MAX_MINUTES} Minuten eingeben.`, { field: 'maxMinutes' });
  }
  return minutes;
}

function cleanMode(input) {
  if (!MODES.includes(input)) throw badRequest('Ungültige Auswahl.', { field: 'mode' });
  return input;
}

function freshKey() {
  const key = `${PREFIX}${randomToken(32)}`;
  return { key, hash: sha256(key), hint: `${key.slice(0, 8)}…${key.slice(-4)}` };
}

async function list() {
  const rows = await db.all(`${LIST} ORDER BY i.id`, [Date.now()]);
  return rows.map(toRecord);
}

async function find(id) {
  const row = await db.get(`${LIST} WHERE i.id = ?`, [Date.now(), Number(id) || 0]);
  if (!row) throw notFound('Diese Integration gibt es nicht (mehr).');
  return toRecord(row);
}

async function create(actorId, input = {}) {
  const count = await db.count('SELECT COUNT(*) FROM integrations');
  if (count >= MAX_INTEGRATIONS) throw badRequest(`Mehr als ${MAX_INTEGRATIONS} Integrationen sind nicht möglich.`);
  const fresh = freshKey();
  const id = await db.insertRow('integrations', {
    name: cleanName(input.name),
    key_hash: fresh.hash,
    hint: fresh.hint,
    mode: input.mode === undefined ? 'approval' : cleanMode(input.mode),
    allow_admins: input.allowAdmins === true ? 1 : 0,
    max_minutes: cleanMinutes(input.maxMinutes),
    enabled: 1,
    created_by: actorId || null,
    created_at: Date.now(),
  });
  return { key: fresh.key, integration: await find(id) };
}

async function update(id, input = {}) {
  const current = await find(id);
  const fields = {};
  if (input.name !== undefined) fields.name = cleanName(input.name);
  if (input.mode !== undefined) fields.mode = cleanMode(input.mode);
  if (input.allowAdmins !== undefined) fields.allow_admins = input.allowAdmins === true ? 1 : 0;
  if (input.maxMinutes !== undefined) fields.max_minutes = cleanMinutes(input.maxMinutes);
  if (input.enabled !== undefined) fields.enabled = input.enabled === true ? 1 : 0;
  const keys = Object.keys(fields);
  if (keys.length) {
    await db.run(`UPDATE integrations SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, [
      ...keys.map((key) => fields[key]),
      current.id,
    ]);
  }
  return { before: current, after: await find(current.id) };
}

async function rotate(id) {
  const current = await find(id);
  const fresh = freshKey();
  await db.run('UPDATE integrations SET key_hash = ?, hint = ? WHERE id = ?', [fresh.hash, fresh.hint, current.id]);
  return { key: fresh.key, integration: await find(current.id) };
}

async function remove(id) {
  const current = await find(id);
  await db.run("UPDATE login_links SET status = 'revoked', sealed = NULL WHERE integration_id = ? AND status IN ('pending', 'ready')", [
    current.id,
  ]);
  await db.run('DELETE FROM integrations WHERE id = ?', [current.id]);
  return current;
}

async function resolve(key) {
  if (typeof key !== 'string' || !key.startsWith(PREFIX) || key.length > 200) return null;
  const row = await db.get('SELECT * FROM integrations WHERE key_hash = ?', [sha256(key.trim())]);
  if (!row || !row.enabled) return null;
  const now = Date.now();
  if (!row.last_used_at || now - Number(row.last_used_at) > TOUCH_INTERVAL_MS) {
    db.run('UPDATE integrations SET last_used_at = ? WHERE id = ?', [now, row.id]).catch(() => {});
  }
  return toRecord(row);
}

module.exports = { PREFIX, MODES, MAX_MINUTES, list, find, create, update, rotate, remove, resolve };
