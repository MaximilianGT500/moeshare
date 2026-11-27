'use strict';

const crypto = require('crypto');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, forbidden, notFound, tooManyRequests } = require('../lib/errors');
const settings = require('./settingsService');
const avatars = require('./avatarService');

const log = logger.scope('comments');

const KINDS = new Set(['f', 'a']);
const MAX_BODY = 2000;
const MAX_NAME = 60;
const PAGE = 50;
const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PER_WINDOW = 5;
const PER_DAY = 40;
const MAX_LINKS = 3;
const GUEST_DELETE_MS = DAY_MS;
const MAX_VISITORS = 20000;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;

const recent = new Map();
let salt = crypto.randomBytes(16);
let saltedAt = Date.now();

const mode = () => settings.get('comments.mode');
const enabled = () => mode() !== 'off';

function visitor(req) {
  if (Date.now() - saltedAt > DAY_MS) {
    salt = crypto.randomBytes(16);
    saltedAt = Date.now();
    recent.clear();
  }
  return crypto
    .createHmac('sha256', salt)
    .update(`${req.ip || ''}|${req.get('user-agent') || ''}`)
    .digest('base64url')
    .slice(0, 22);
}

function throttle(key, now) {
  const times = (recent.get(key) || []).filter((at) => now - at < DAY_MS);
  if (times.filter((at) => now - at < WINDOW_MS).length >= PER_WINDOW || times.length >= PER_DAY) {
    throw tooManyRequests('Du hast gerade viele Kommentare geschrieben. Warte ein paar Minuten.', { code: 'limited' });
  }
  times.push(now);
  if (!recent.has(key) && recent.size >= MAX_VISITORS) recent.delete(recent.keys().next().value);
  recent.set(key, times);
}

const hashOf = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function cleanBody(value) {
  const text = String(value === undefined || value === null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw badRequest('Schreib erst etwas.', { field: 'body' });
  if (text.length > MAX_BODY) throw badRequest(`Ein Kommentar darf höchstens ${MAX_BODY} Zeichen haben.`, { field: 'body' });
  return text;
}

function cleanName(value) {
  const text = String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) throw badRequest('Gib einen Namen an.', { field: 'name' });
  if (text.length > MAX_NAME) throw badRequest(`Der Name darf höchstens ${MAX_NAME} Zeichen haben.`, { field: 'name' });
  return text;
}

function assertWords(...texts) {
  const words = settings.get('comments.blockedWords');
  if (!words.length) return;
  const haystack = texts.join('\n').toLowerCase();
  if (words.some((word) => haystack.includes(word))) {
    throw badRequest('Der Kommentar enthält ein Wort, das hier nicht erlaubt ist.', { field: 'body', code: 'blocked_word' });
  }
}

function assertLinks(body, guest) {
  const links = (body.match(URL_PATTERN) || []).length;
  if (guest && links && !settings.get('comments.guestLinks')) {
    throw badRequest('Ohne Konto gehen keine Links in Kommentaren.', { field: 'body', code: 'links' });
  }
  if (links > MAX_LINKS) throw badRequest(`Höchstens ${MAX_LINKS} Links pro Kommentar.`, { field: 'body', code: 'links' });
}

function switchedOn(target) {
  if (!enabled()) return false;
  if (target.override === 0 || target.override === false) return false;
  if (target.override === 1 || target.override === true) return true;
  return target.byDefault !== false;
}

function rights(target, viewer) {
  const on = switchedOn(target);
  const owner = Boolean(viewer && Number(viewer.id) === Number(target.ownerId));
  const admin = Boolean(viewer && viewer.isAdmin);
  const guestsAllowed = mode() === 'everyone';
  return {
    enabled: on,
    canPost: on && (Boolean(viewer) || guestsAllowed),
    needsName: on && !viewer && guestsAllowed,
    signInToPost: on && !viewer && !guestsAllowed,
    moderate: on && (owner || admin),
    owner,
    admin,
  };
}

async function authorsOf(rows) {
  const ids = [...new Set(rows.map((row) => Number(row.user_id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await db.all(`SELECT id, username, avatar FROM users WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
  return new Map(users.map((user) => [Number(user.id), { username: user.username, name: user.username, avatar: avatars.urlFor(user) }]));
}

function present(row, authors, target, viewer, { token = null } = {}) {
  const author = row.user_id ? authors.get(Number(row.user_id)) : null;
  const mine = Boolean(viewer && row.user_id && Number(viewer.id) === Number(row.user_id));
  const fresh = Date.now() - Number(row.created_at) < GUEST_DELETE_MS;
  return {
    id: Number(row.id),
    body: row.body,
    name: author ? author.name : row.name || '',
    username: author ? author.username : null,
    avatar: author ? author.avatar : null,
    guest: !row.user_id,
    byOwner: Boolean(row.user_id && Number(row.user_id) === Number(target.ownerId)),
    createdAt: Number(row.created_at),
    hidden: Boolean(row.hidden_at),
    mine,
    deletable: mine || (!row.user_id && fresh && Boolean(token)),
  };
}

async function count(kind, refId) {
  return db.count('SELECT COUNT(*) FROM comments WHERE kind = ? AND ref_id = ? AND hidden_at IS NULL', [kind, Number(refId)]);
}

async function totals(kind, refIds) {
  const ids = [...new Set(refIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const rows = await db.all(
    `SELECT ref_id, COUNT(*) AS total FROM comments WHERE kind = ? AND hidden_at IS NULL AND ref_id IN (${ids.map(() => '?').join(', ')}) GROUP BY ref_id`,
    [kind, ...ids]
  );
  return new Map(rows.map((row) => [Number(row.ref_id), Number(row.total) || 0]));
}

async function list(target, viewer, { before = null } = {}) {
  if (!KINDS.has(target.kind)) throw notFound('Unbekannte Art.');
  const allowed = rights(target, viewer);
  if (!allowed.enabled) return { ...allowed, comments: [], more: false, total: 0 };
  const conditions = ['kind = ?', 'ref_id = ?'];
  const params = [target.kind, Number(target.id)];
  if (!allowed.moderate) {
    conditions.push('(hidden_at IS NULL OR user_id = ?)');
    params.push(viewer ? Number(viewer.id) : -1);
  }
  if (before) {
    conditions.push('id < ?');
    params.push(Number(before) || 0);
  }
  const rows = await db.all(`SELECT * FROM comments WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, PAGE + 1]);
  const page = rows.slice(0, PAGE).reverse();
  const authors = await authorsOf(page);
  return {
    ...allowed,
    comments: page.map((row) => present(row, authors, target, viewer)),
    more: rows.length > PAGE,
    total: await count(target.kind, target.id),
  };
}

async function note(ownerId, kind, refId, now) {
  await db.insertIgnore('reaction_notices', { user_id: ownerId, kind, ref_id: refId, reactions: 0, comments: 0, first_at: now });
  await db.run('UPDATE reaction_notices SET comments = comments + 1 WHERE user_id = ? AND kind = ? AND ref_id = ?', [ownerId, kind, refId]);
}

async function create(target, input, req, { now = Date.now() } = {}) {
  const viewer = req.user || null;
  const allowed = rights(target, viewer);
  if (!allowed.enabled) throw forbidden('Kommentare sind hier abgeschaltet.', { code: 'disabled' });
  if (!allowed.canPost) throw forbidden('Melde dich an, um zu kommentieren.', { code: 'unauthenticated' });
  if (input && typeof input.website === 'string' && input.website.trim()) {
    throw badRequest('Der Kommentar konnte nicht gespeichert werden.', { code: 'spam' });
  }
  const body = cleanBody(input && input.body);
  const name = viewer ? null : cleanName(input && input.name);
  assertWords(body, name || '');
  assertLinks(body, !viewer);
  throttle(viewer ? `u${viewer.id}` : visitor(req), now);
  const token = viewer ? null : crypto.randomBytes(18).toString('base64url');
  const id = await db.insertRow('comments', {
    kind: target.kind,
    ref_id: Number(target.id),
    user_id: viewer ? Number(viewer.id) : null,
    name,
    body,
    created_at: now,
    author_key: token ? hashOf(token) : null,
  });
  if (target.ownerId && !(viewer && Number(viewer.id) === Number(target.ownerId))) {
    await note(Number(target.ownerId), target.kind, Number(target.id), now).catch((error) =>
      log.debug('Kommentarhinweis nicht vorgemerkt', { error })
    );
  }
  const row = await db.get('SELECT * FROM comments WHERE id = ?', [id]);
  const authors = await authorsOf([row]);
  return { comment: present(row, authors, target, viewer, { token }), token, total: await count(target.kind, target.id) };
}

async function find(id) {
  const row = await db.get('SELECT * FROM comments WHERE id = ?', [Number(id) || 0]);
  if (!row) throw notFound('Diesen Kommentar gibt es nicht.');
  return row;
}

async function ownerOf(row) {
  if (row.kind === 'f') {
    const file = await db.get('SELECT u.id FROM file_data f JOIN users u ON u.username = f.username WHERE f.id = ?', [row.ref_id]);
    return file ? Number(file.id) : null;
  }
  const album = await db.get('SELECT user_id FROM albums WHERE id = ?', [row.ref_id]);
  return album ? Number(album.user_id) : null;
}

async function remove(id, viewer, { token = null } = {}) {
  const row = await find(id);
  const ownerId = await ownerOf(row);
  const author = Boolean(viewer && row.user_id && Number(viewer.id) === Number(row.user_id));
  const guest =
    !row.user_id &&
    token &&
    row.author_key &&
    Date.now() - Number(row.created_at) < GUEST_DELETE_MS &&
    crypto.timingSafeEqual(Buffer.from(hashOf(token)), Buffer.from(String(row.author_key)));
  const moderator = Boolean(viewer && (viewer.isAdmin || Number(viewer.id) === ownerId));
  if (!author && !guest && !moderator) throw forbidden('Diesen Kommentar darfst du nicht löschen.');
  await db.run('DELETE FROM comments WHERE id = ?', [row.id]);
  return { row, ownerId, byModerator: moderator && !author && !guest };
}

async function hide(id, viewer, hidden) {
  const row = await find(id);
  const ownerId = await ownerOf(row);
  if (!viewer || !(viewer.isAdmin || Number(viewer.id) === ownerId)) throw forbidden('Diesen Kommentar darfst du nicht ausblenden.');
  await db.run('UPDATE comments SET hidden_at = ?, hidden_by = ? WHERE id = ?', [
    hidden ? Date.now() : null,
    hidden ? Number(viewer.id) : null,
    row.id,
  ]);
  const fresh = await find(id);
  const authors = await authorsOf([fresh]);
  return present(fresh, authors, { ownerId }, viewer);
}

async function recentFor(userId, { limit = 20 } = {}) {
  const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
  if (!user) return [];
  const rows = await db.all(
    `SELECT c.*, f.slug, f.filename, f.title AS file_title, f.original_name FROM comments c
     LEFT JOIN file_data f ON c.kind = 'f' AND f.id = c.ref_id
     LEFT JOIN albums a ON c.kind = 'a' AND a.id = c.ref_id
     WHERE (c.kind = 'f' AND f.username = ? AND f.deleted_at IS NULL) OR (c.kind = 'a' AND a.user_id = ?)
     ORDER BY c.id DESC LIMIT ?`,
    [user.username, userId, Math.max(1, Math.min(50, Number(limit) || 20))]
  );
  const albumIds = rows.filter((row) => row.kind === 'a').map((row) => Number(row.ref_id));
  const albums = albumIds.length
    ? await db.all(`SELECT id, code, title FROM albums WHERE id IN (${albumIds.map(() => '?').join(', ')})`, albumIds)
    : [];
  const byAlbum = new Map(albums.map((album) => [Number(album.id), album]));
  const authors = await authorsOf(rows);
  return rows.map((row) => {
    const album = row.kind === 'a' ? byAlbum.get(Number(row.ref_id)) : null;
    return {
      ...present(row, authors, { ownerId: userId }, { id: userId }),
      target:
        row.kind === 'f'
          ? { kind: 'f', id: Number(row.ref_id), name: row.file_title || row.original_name || row.filename, slug: row.slug || row.filename }
          : { kind: 'a', id: Number(row.ref_id), name: album ? album.title : '', code: album ? album.code : null },
    };
  });
}

module.exports = {
  MAX_BODY,
  MAX_NAME,
  enabled,
  mode,
  rights,
  list,
  create,
  remove,
  hide,
  count,
  totals,
  recentFor,
};
