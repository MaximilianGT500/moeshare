'use strict';

const crypto = require('crypto');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, gone, notFound } = require('../lib/errors');
const { deviceLabel } = require('../lib/request');
const settings = require('./settingsService');
const files = require('./fileService');

const log = logger.scope('phone');

const LIFETIME_MS = 15 * 60 * 1000;
const MAX_LIFETIME_MS = 60 * 60 * 1000;
const MAX_UPLOADS = 100;
const MAX_OPEN = 3;
const CODE = /^[A-Za-z0-9_-]{24}$/;

const hashOf = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const now = () => Date.now();
const parse = (text) => {
  try {
    const value = JSON.parse(text || '[]');
    return Array.isArray(value) ? value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
};

const enabled = () => Boolean(settings.get('uploads.phone'));

function urlOf(code) {
  return `${String(settings.get('site.baseUrl')).replace(/\/+$/, '')}/m/${code}`;
}

async function albumOf(user, value) {
  if (value === undefined || value === null || value === '') return null;
  const row = await db.get(
    `SELECT a.id, a.code, a.title, a.rule FROM albums a WHERE (a.id = ? OR a.code = ?) AND (a.user_id = ? OR EXISTS (
       SELECT 1 FROM album_members m WHERE m.album_id = a.id AND m.user_id = ?))`,
    [Number(value) || 0, String(value), user.id, user.id]
  );
  if (!row) throw badRequest('Dieses Album gibt es nicht.', { field: 'album' });
  if (row.rule) throw badRequest('Smarte Alben füllen sich selbst und nehmen keine Uploads an.', { field: 'album' });
  return row;
}

const isOpen = (row, at = now()) => Boolean(row) && !row.closed_at && Number(row.expires_at) > at;

async function present(row, { withFiles = true } = {}) {
  const ids = parse(row.files);
  let list = [];
  if (withFiles && ids.length) {
    const records = await db.all(
      `SELECT * FROM file_data WHERE id IN (${ids.map(() => '?').join(', ')}) AND deleted_at IS NULL ORDER BY id DESC`,
      ids
    );
    list = records.map((record) => files.toFile(record));
  }
  const album = row.album_id ? await db.get('SELECT id, code, title FROM albums WHERE id = ?', [row.album_id]) : null;
  return {
    id: Number(row.id),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    closedAt: row.closed_at ? Number(row.closed_at) : null,
    open: isOpen(row),
    uploads: Number(row.uploads) || 0,
    max: MAX_UPLOADS,
    lastUploadAt: row.last_upload_at ? Number(row.last_upload_at) : null,
    device: row.device || null,
    album: album ? { id: Number(album.id), code: album.code, title: album.title } : null,
    files: list,
  };
}

async function create(user, input = {}) {
  if (!enabled()) throw badRequest('Uploads vom Handy sind auf diesem Server abgeschaltet.');
  const album = await albumOf(user, input.album);
  const at = now();
  const open = await db.all('SELECT id FROM phone_links WHERE user_id = ? AND closed_at IS NULL AND expires_at > ? ORDER BY id', [
    user.id,
    at,
  ]);
  for (const row of open.slice(0, Math.max(0, open.length - MAX_OPEN + 1))) {
    await db.run('UPDATE phone_links SET closed_at = ? WHERE id = ?', [at, row.id]);
  }
  await db.run('DELETE FROM phone_links WHERE user_id = ? AND expires_at < ?', [user.id, at - 7 * 24 * 60 * 60 * 1000]);
  const code = crypto.randomBytes(18).toString('base64url');
  const id = await db.insertRow('phone_links', {
    user_id: user.id,
    code_hash: hashOf(code),
    album_id: album ? Number(album.id) : null,
    created_at: at,
    expires_at: at + LIFETIME_MS,
    uploads: 0,
    files: '[]',
  });
  const row = await db.get('SELECT * FROM phone_links WHERE id = ?', [id]);
  return { ...(await present(row)), code, url: urlOf(code) };
}

async function owned(user, id) {
  const row = await db.get('SELECT * FROM phone_links WHERE id = ? AND user_id = ?', [Number(id) || 0, user.id]);
  if (!row) throw notFound('Diesen Handy-Upload gibt es nicht.');
  return row;
}

async function status(user, id) {
  return present(await owned(user, id));
}

async function close(user, id) {
  const row = await owned(user, id);
  if (!row.closed_at) await db.run('UPDATE phone_links SET closed_at = ? WHERE id = ?', [now(), row.id]);
  return present(await owned(user, id));
}

async function extend(user, id) {
  const row = await owned(user, id);
  if (!isOpen(row)) throw gone('Dieser Handy-Upload ist schon beendet. Starte einen neuen.');
  const until = Math.min(Number(row.created_at) + MAX_LIFETIME_MS, now() + LIFETIME_MS);
  await db.run('UPDATE phone_links SET expires_at = ? WHERE id = ?', [Math.max(until, Number(row.expires_at)), row.id]);
  return present(await owned(user, id));
}

async function byCode(code) {
  if (!CODE.test(String(code || ''))) return null;
  return db.get(
    `SELECT p.*, u.username, u.status AS user_status FROM phone_links p JOIN users u ON u.id = p.user_id WHERE p.code_hash = ?`,
    [hashOf(code)]
  );
}

function assertOpen(row) {
  if (!row || row.user_status !== 'active') throw notFound('Diesen Link gibt es nicht.');
  if (!enabled()) throw gone('Uploads vom Handy sind auf diesem Server abgeschaltet.');
  if (!isOpen(row)) throw gone('Dieser Link ist abgelaufen. Lass dir am Rechner einen neuen QR-Code zeigen.');
  if (Number(row.uploads) >= MAX_UPLOADS) throw gone(`Über diesen Link gehen höchstens ${MAX_UPLOADS} Dateien.`);
}

async function publicInfo(row) {
  const open = Boolean(row) && row.user_status === 'active' && enabled() && isOpen(row) && Number(row.uploads) < MAX_UPLOADS;
  const album = row && row.album_id ? await db.get('SELECT title FROM albums WHERE id = ?', [row.album_id]) : null;
  return {
    found: Boolean(row) && row.user_status === 'active',
    open,
    username: row && row.user_status === 'active' ? row.username : null,
    expiresAt: row ? Number(row.expires_at) : null,
    uploads: row ? Number(row.uploads) || 0 : 0,
    max: MAX_UPLOADS,
    album: album ? album.title : null,
  };
}

async function recordUpload(row, links, req) {
  const ids = parse(row.files);
  if (links && links.id) ids.push(Number(links.id));
  await db.run('UPDATE phone_links SET uploads = uploads + 1, files = ?, last_upload_at = ?, device = ? WHERE id = ?', [
    JSON.stringify(ids.slice(-MAX_UPLOADS)),
    now(),
    deviceLabel(req.get('user-agent')).slice(0, 120),
    row.id,
  ]);
  log.debug('Datei vom Handy empfangen', { user: row.username, file: links && links.filename });
}

module.exports = {
  LIFETIME_MS,
  MAX_UPLOADS,
  enabled,
  create,
  status,
  close,
  extend,
  byCode,
  assertOpen,
  publicInfo,
  recordUpload,
};
