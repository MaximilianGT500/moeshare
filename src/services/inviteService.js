'use strict';

const db = require('../lib/db');
const settings = require('./settingsService');
const { randomToken } = require('../lib/secrets');
const { HttpError } = require('../lib/errors');

const toRecord = (row) => {
  const now = Date.now();
  const expired = row.expires_at !== null && row.expires_at <= now;
  const usedUp = row.max_uses !== null && row.uses >= row.max_uses;
  return {
    code: row.code,
    url: `${settings.get('site.baseUrl')}/register?invite=${row.code}`,
    role: row.role,
    quotaBytes: row.quota_bytes,
    maxFileBytes: row.max_file_bytes,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdBy: row.created_by_name || null,
    note: row.note || '',
    state: expired ? 'expired' : usedUp ? 'used' : 'active',
  };
};

const optionalBytes = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  if (!Number.isFinite(value) || value < 1024 * 1024) throw new HttpError(400, `${label}: bitte mindestens 1 MB angeben.`);
  return Math.round(value);
};

async function create(actorId, input = {}) {
  const role = input.role === 'admin' ? 'admin' : 'mitglied';
  const days = input.expiresInDays === null || input.expiresInDays === undefined ? null : Number(input.expiresInDays);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
    throw new HttpError(400, 'Die Gültigkeit muss zwischen 1 und 365 Tagen liegen.');
  }
  const maxUses = input.maxUses === null || input.maxUses === undefined ? null : Number(input.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)) {
    throw new HttpError(400, 'Die Anzahl der Nutzungen muss zwischen 1 und 1000 liegen.');
  }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 120) : '';

  const code = randomToken(12);
  const now = Date.now();
  await db.run(
    `INSERT INTO invites (code, created_by, created_at, expires_at, max_uses, uses, role, quota_bytes, max_file_bytes, note)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      code,
      actorId,
      now,
      days === null ? null : now + days * 86400000,
      maxUses,
      role,
      optionalBytes(input.quotaBytes, 'Speicherlimit'),
      optionalBytes(input.maxFileBytes, 'Maximale Dateigröße'),
      note || null,
    ]
  );
  return get(code);
}

async function get(code) {
  if (typeof code !== 'string' || !/^[\w-]{8,40}$/.test(code)) return null;
  const row = await db.get(
    'SELECT i.*, u.username AS created_by_name FROM invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.code = ?',
    [code]
  );
  return row ? toRecord(row) : null;
}

async function requireUsable(code) {
  const invite = await get(code);
  if (!invite) throw new HttpError(404, 'Diese Einladung gibt es nicht. Prüfe den Link.');
  if (invite.state === 'expired') throw new HttpError(410, 'Diese Einladung ist abgelaufen. Frag nach einer neuen.');
  if (invite.state === 'used') throw new HttpError(410, 'Diese Einladung wurde bereits verwendet.');
  return invite;
}

async function consume(code) {
  const result = await db.run(
    `UPDATE invites SET uses = uses + 1
     WHERE code = ? AND (max_uses IS NULL OR uses < max_uses) AND (expires_at IS NULL OR expires_at > ?)`,
    [code, Date.now()]
  );
  if (!result.changes) throw new HttpError(410, 'Diese Einladung ist nicht mehr gültig.');
}

async function list() {
  const rows = await db.all(
    'SELECT i.*, u.username AS created_by_name FROM invites i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC'
  );
  return rows.map(toRecord);
}

async function revoke(code) {
  const result = await db.run('DELETE FROM invites WHERE code = ?', [code]);
  if (!result.changes) throw new HttpError(404, 'Diese Einladung gibt es nicht (mehr).');
}

const prune = () =>
  db
    .run(
      'DELETE FROM invites WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (max_uses IS NOT NULL AND uses >= max_uses AND created_at < ?)',
      [Date.now() - 30 * 86400000, Date.now() - 30 * 86400000]
    )
    .then((r) => r.changes);

module.exports = { create, get, requireUsable, consume, list, revoke, prune };
