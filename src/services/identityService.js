'use strict';

const db = require('../lib/db');
const { conflict } = require('../lib/errors');

const toIdentity = (row) => ({ provider: row.provider, name: row.name || '', createdAt: row.created_at, lastUsedAt: row.last_used_at });

const findUser = (provider, subject) =>
  db.get('SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?', [provider, subject]);

const subjectOf = (userId, provider) =>
  db.get('SELECT subject FROM identities WHERE user_id = ? AND provider = ?', [userId, provider]).then((row) => (row ? row.subject : null));

const listForUser = (userId) =>
  db.all('SELECT * FROM identities WHERE user_id = ? ORDER BY created_at', [userId]).then((rows) => rows.map(toIdentity));

async function listByUser() {
  const rows = await db.all('SELECT * FROM identities ORDER BY created_at');
  const grouped = new Map();
  for (const row of rows) grouped.set(row.user_id, [...(grouped.get(row.user_id) || []), toIdentity(row)]);
  return grouped;
}

async function assertFree(provider, subject, userId, label) {
  const owner = await db.get('SELECT user_id FROM identities WHERE provider = ? AND subject = ?', [provider, subject]);
  if (owner && owner.user_id !== userId) throw conflict(`Dieses ${label}-Konto ist schon mit einem anderen Benutzer verknüpft.`);
}

async function link(userId, provider, { subject, name }, label) {
  await assertFree(provider, subject, userId, label);
  await db.upsert(
    'identities',
    { user_id: userId, provider, subject, name: name || null, created_at: Date.now() },
    ['user_id', 'provider'],
    ['subject', 'name']
  );
}

const touch = (provider, subject, name) =>
  db.run('UPDATE identities SET last_used_at = ?, name = COALESCE(?, name) WHERE provider = ? AND subject = ?', [
    Date.now(),
    name || null,
    provider,
    subject,
  ]);

const unlink = (userId, provider) =>
  db.run('DELETE FROM identities WHERE user_id = ? AND provider = ?', [userId, provider]).then((r) => r.changes);

module.exports = { findUser, subjectOf, listForUser, listByUser, assertFree, link, touch, unlink };
