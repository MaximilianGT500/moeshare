'use strict';

const crypto = require('crypto');
const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest } = require('../lib/errors');
const settings = require('./settingsService');

const log = logger.scope('reactions');

const REACTIONS = ['like', 'love', 'laugh', 'wow', 'fire', 'clap'];
const KINDS = new Set(['f', 'a']);
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SEEN = 50000;
const NOTICE_DELAY_MS = config.reactionNoticeMs;
const MAX_NOTICES = 500;
const MAX_USERS = 100;

const seen = new Map();
let salt = crypto.randomBytes(16);
let saltedAt = Date.now();

const enabled = () => Boolean(settings.get('reactions.enabled'));

function visitor(req) {
  if (Date.now() - saltedAt > WINDOW_MS) {
    salt = crypto.randomBytes(16);
    saltedAt = Date.now();
    seen.clear();
  }
  return crypto
    .createHmac('sha256', salt)
    .update(`${req.ip || ''}|${req.get('user-agent') || ''}`)
    .digest('base64url')
    .slice(0, 22);
}

function remember(key, now) {
  for (const [entry, at] of seen) {
    if (seen.size < MAX_SEEN && now - at < WINDOW_MS) break;
    seen.delete(entry);
  }
  seen.set(key, now);
}

const empty = () => Object.fromEntries(REACTIONS.map((reaction) => [reaction, 0]));

function assertKind(kind) {
  if (!KINDS.has(kind)) throw new Error(`Unbekannte Reaktionsart ${kind}`);
}

async function counts(kind, refId) {
  assertKind(kind);
  const rows = await db.all('SELECT reaction, count FROM reactions WHERE kind = ? AND ref_id = ?', [kind, Number(refId)]);
  const result = empty();
  for (const row of rows) if (REACTIONS.includes(row.reaction)) result[row.reaction] = Number(row.count) || 0;
  return result;
}

async function totals(kind, refIds) {
  assertKind(kind);
  const ids = [...new Set(refIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const rows = await db.all(
    `SELECT ref_id, SUM(count) AS total FROM reactions WHERE kind = ? AND ref_id IN (${ids.map(() => '?').join(', ')}) GROUP BY ref_id`,
    [kind, ...ids]
  );
  return new Map(rows.map((row) => [Number(row.ref_id), Number(row.total) || 0]));
}

async function note(userId, kind, refId, now) {
  await db.insertIgnore('reaction_notices', { user_id: userId, kind, ref_id: refId, reactions: 0, first_at: now });
  await db.run('UPDATE reaction_notices SET reactions = reactions + 1 WHERE user_id = ? AND kind = ? AND ref_id = ?', [
    userId,
    kind,
    refId,
  ]);
}

async function react(target, reaction, req, { now = Date.now() } = {}) {
  assertKind(target.kind);
  if (!REACTIONS.includes(reaction)) throw badRequest('Diese Reaktion gibt es nicht.', { field: 'reaction' });
  const key = `${target.kind}${target.id}:${reaction}:${visitor(req)}`;
  const known = seen.get(key);
  if (known && now - known < WINDOW_MS) return { reaction, counted: false, counts: await counts(target.kind, target.id) };
  remember(key, now);
  await db.increment('reactions', { kind: target.kind, ref_id: Number(target.id), reaction }, { count: 1 });
  const self = req.user && Number(req.user.id) === Number(target.ownerId);
  if (target.ownerId && !self) {
    await note(Number(target.ownerId), target.kind, Number(target.id), now).catch((error) =>
      log.debug('Reaktionshinweis nicht vorgemerkt', { error })
    );
  }
  return { reaction, counted: true, counts: await counts(target.kind, target.id) };
}

async function forget(kind, refIds, q = db) {
  assertKind(kind);
  const ids = [...new Set((Array.isArray(refIds) ? refIds : [refIds]).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return;
  const marks = ids.map(() => '?').join(', ');
  await q.run(`DELETE FROM reactions WHERE kind = ? AND ref_id IN (${marks})`, [kind, ...ids]);
  await q.run(`DELETE FROM reaction_notices WHERE kind = ? AND ref_id IN (${marks})`, [kind, ...ids]);
}

async function top(username, { limit = 5 } = {}) {
  const rows = await db.all(
    `SELECT r.ref_id, SUM(r.count) AS total FROM reactions r JOIN file_data f ON f.id = r.ref_id
     WHERE r.kind = 'f' AND f.username = ? AND f.deleted_at IS NULL
     GROUP BY r.ref_id ORDER BY SUM(r.count) DESC, r.ref_id DESC LIMIT ?`,
    [username, Math.max(1, Math.min(20, Number(limit) || 5))]
  );
  return rows.filter((row) => Number(row.total) > 0).map((row) => ({ id: Number(row.ref_id), total: Number(row.total) }));
}

async function sum(username) {
  const row = await db.get(
    `SELECT SUM(r.count) AS total FROM reactions r JOIN file_data f ON f.id = r.ref_id
     WHERE r.kind = 'f' AND f.username = ? AND f.deleted_at IS NULL`,
    [username]
  );
  return Number(row && row.total) || 0;
}

async function due(now = Date.now()) {
  const users = await db.all(
    'SELECT user_id FROM reaction_notices GROUP BY user_id HAVING MIN(first_at) <= ? ORDER BY MIN(first_at) LIMIT ?',
    [now - NOTICE_DELAY_MS, MAX_USERS]
  );
  if (!users.length) return [];
  const ids = users.map((row) => Number(row.user_id));
  return db.all(`SELECT * FROM reaction_notices WHERE user_id IN (${ids.map(() => '?').join(', ')}) ORDER BY user_id, first_at LIMIT ?`, [
    ...ids,
    MAX_NOTICES,
  ]);
}

async function clear(rows) {
  if (!rows.length) return;
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.run('UPDATE reaction_notices SET reactions = reactions - ?, comments = comments - ? WHERE id = ?', [
        Number(row.reactions) || 0,
        Number(row.comments) || 0,
        Number(row.id),
      ]);
    }
    const ids = rows.map((row) => Number(row.id));
    await tx.run(`DELETE FROM reaction_notices WHERE id IN (${ids.map(() => '?').join(', ')}) AND reactions <= 0 AND comments <= 0`, ids);
  });
}

module.exports = { REACTIONS, NOTICE_DELAY_MS, enabled, counts, totals, react, forget, top, sum, due, clear };
