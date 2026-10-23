'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { HttpError, badRequest, conflict, notFound, tooLarge, tooManyRequests } = require('../lib/errors');
const { formatBytes } = require('../lib/format');
const { extensionOf, ensureUserDirs, userDirs, isValidUsername } = require('../lib/storage');
const settings = require('./settingsService');
const quota = require('./quotaService');
const files = require('./fileService');
const uploads = require('./uploadService');

const log = logger.scope('upload');

const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK = 64 * 1024 * 1024;
const MAX_SESSIONS = 20;
const HOUR = 60 * 60 * 1000;
const MISSING = 'Diesen Upload gibt es nicht (mehr). Starte ihn neu.';

const enabled = () => settings.get('uploads.chunked');
const lifetime = () => settings.get('uploads.resumeHours') * HOUR;
const partialDir = (username) => path.join(userDirs(username).root, '.partial');
const partPath = (username, id) => path.join(partialDir(username), `${id}.part`);
const cleanName = (value) =>
  String(value || '')
    .replace(/[\\/\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 255);

const present = (row) => ({
  id: row.id,
  name: row.name,
  size: Number(row.size_bytes),
  received: Number(row.received),
  fileId: row.file_id ? Number(row.file_id) : null,
  fingerprint: row.fingerprint || null,
  chunkSize: CHUNK_BYTES,
  maxChunk: MAX_CHUNK,
  createdAt: Number(row.created_at),
  expiresAt: Number(row.expires_at),
});

function serialize(options) {
  const { expiresAt, ...rest } = options;
  return JSON.stringify({ ...rest, expiresIn: expiresAt ? Math.max(0, expiresAt - Date.now()) : null });
}

function restore(raw) {
  try {
    const { expiresIn, ...rest } = JSON.parse(raw || '{}');
    return { ...rest, expiresAt: expiresIn === null || expiresIn === undefined ? null : Date.now() + Number(expiresIn) };
  } catch {
    return null;
  }
}

const reserved = (userId, exceptId = null) =>
  db.count(
    `SELECT COALESCE(SUM(size_bytes), 0) FROM upload_sessions WHERE user_id = ? AND expires_at > ?${exceptId ? ' AND id <> ?' : ''}`,
    [userId, Date.now(), ...(exceptId ? [exceptId] : [])]
  );

async function assertRoom(user, size, exceptId = null) {
  const limits = await quota.limitsFor(user);
  if (limits.maxFileBytes && size > limits.maxFileBytes) {
    throw tooLarge(`Die Datei ist zu groß. Erlaubt sind höchstens ${formatBytes(limits.maxFileBytes)}.`);
  }
  if (!limits.quotaBytes) return;
  const free = limits.quotaBytes - limits.used - (await reserved(user.id, exceptId));
  if (size <= free) return;
  throw tooLarge(
    free > 0
      ? `Nicht genug Speicher frei: noch ${formatBytes(free)} von ${formatBytes(limits.quotaBytes)}.`
      : `Dein Speicher ist voll (${formatBytes(limits.quotaBytes)}). Lösche alte Dateien oder frag nach mehr Platz.`
  );
}

async function find(user, id) {
  const row =
    typeof id === 'string' && /^[A-Za-z0-9_-]{16,40}$/.test(id)
      ? await db.get('SELECT * FROM upload_sessions WHERE id = ? AND user_id = ? AND expires_at > ?', [id, user.id, Date.now()])
      : null;
  if (!row) throw notFound(MISSING);
  return row;
}

async function create(user, input = {}, raw = {}) {
  if (!enabled()) throw notFound('Fortsetzbare Uploads sind auf diesem Server abgeschaltet.');
  const name = cleanName(input.name);
  if (!name) throw badRequest('Es fehlt der Dateiname.', { field: 'name' });
  const size = Number(input.size);
  if (!Number.isSafeInteger(size) || size < 1) throw badRequest('Ungültige Dateigröße.', { field: 'size' });
  const open = await db.count('SELECT COUNT(*) FROM upload_sessions WHERE user_id = ? AND expires_at > ?', [user.id, Date.now()]);
  if (open >= MAX_SESSIONS) throw tooManyRequests('Es gibt schon zu viele unfertige Uploads. Setze sie fort oder verwirf ein paar.');
  let fileId = null;
  let options = null;
  if (input.fileId !== undefined && input.fileId !== null && input.fileId !== '') {
    const record = await files.findOwned(user.username, String(input.fileId));
    if (!record) throw notFound('Diese Datei gibt es nicht (mehr).');
    fileId = record.id;
  } else {
    options = serialize(await uploads.resolveOptions(user, raw));
  }
  await assertRoom(user, size);
  const id = crypto.randomBytes(18).toString('base64url');
  ensureUserDirs(user.username);
  await fsp.mkdir(partialDir(user.username), { recursive: true });
  await fsp.writeFile(partPath(user.username, id), '');
  const now = Date.now();
  await db.insertIgnore('upload_sessions', {
    id,
    user_id: user.id,
    name,
    size_bytes: size,
    received: 0,
    file_id: fileId,
    fingerprint: input.fingerprint ? String(input.fingerprint).slice(0, 191) : null,
    options,
    created_at: now,
    updated_at: now,
    expires_at: now + lifetime(),
  });
  log.debug('Fortsetzbarer Upload begonnen', { user: user.username, size: formatBytes(size) });
  return present(await find(user, id));
}

async function list(user) {
  const rows = await db.all('SELECT * FROM upload_sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC', [
    user.id,
    Date.now(),
  ]);
  return rows.map(present);
}

const get = async (user, id) => present(await find(user, id));

async function receive(req, target, start, limit) {
  const out = fs.createWriteStream(target, { flags: 'r+', start });
  let seen = 0;
  const guard = new Transform({
    transform(chunk, encoding, done) {
      seen += chunk.length;
      if (seen > limit) return done(Object.assign(new Error('Teilstück zu groß'), { code: 'ETOOLARGE' }));
      return done(null, chunk);
    },
  });
  try {
    await pipeline(req, guard, out);
    return { written: out.bytesWritten, aborted: false };
  } catch (error) {
    if (!out.closed) await new Promise((resolve) => out.once('close', resolve));
    if (error.code === 'ETOOLARGE') throw tooLarge('Dieses Teilstück ist zu groß.');
    return { written: out.bytesWritten, aborted: true };
  }
}

const OCTET = /^application\/(offset\+)?octet-stream\b/i;

async function append(user, id, req) {
  const row = await find(user, id);
  if (!OCTET.test(String(req.get('content-type') || ''))) {
    throw new HttpError(415, 'Teilstücke werden als application/offset+octet-stream gesendet.', { code: 'content_type' });
  }
  const offset = Number.parseInt(req.get('upload-offset'), 10);
  const received = Number(row.received);
  if (!Number.isSafeInteger(offset) || offset < 0) throw badRequest('Der Header Upload-Offset fehlt oder ist ungültig.');
  if (offset !== received) throw conflict('Der Upload steht an einer anderen Stelle.', { code: 'offset_mismatch', extra: { received } });
  const remaining = Number(row.size_bytes) - received;
  if (remaining <= 0) throw conflict('Alle Teile sind schon angekommen.', { code: 'complete', extra: { received } });
  const limit = Math.min(MAX_CHUNK, remaining);
  const declared = Number.parseInt(req.get('content-length'), 10);
  if (Number.isFinite(declared) && declared > limit) throw tooLarge('Dieses Teilstück ist zu groß.');
  const { written } = await receive(req, partPath(user.username, row.id), offset, limit);
  const next = received + written;
  const now = Date.now();
  const { changes } = await db.run(
    'UPDATE upload_sessions SET received = ?, updated_at = ?, expires_at = ? WHERE id = ? AND received = ?',
    [next, now, now + lifetime(), row.id, received]
  );
  if (changes !== 1) {
    const fresh = await find(user, id);
    throw conflict('Der Upload steht an einer anderen Stelle.', { code: 'offset_mismatch', extra: { received: Number(fresh.received) } });
  }
  return { received: next, size: Number(row.size_bytes) };
}

async function complete(user, id) {
  const row = await find(user, id);
  const size = Number(row.size_bytes);
  if (Number(row.received) !== size)
    throw conflict('Es fehlen noch Teile.', { code: 'incomplete', extra: { received: Number(row.received) } });
  const source = partPath(user.username, row.id);
  const stat = await fsp.stat(source).catch(() => null);
  if (!stat || stat.size < size) {
    await discard(user.username, row.id);
    throw conflict('Die hochgeladenen Teile fehlen. Starte den Upload neu.', { code: 'missing_parts' });
  }
  if (stat.size > size) await fsp.truncate(source, size);
  const { changes } = await db.run('DELETE FROM upload_sessions WHERE id = ?', [row.id]);
  if (changes !== 1) throw conflict('Dieser Upload wird schon abgeschlossen.');
  try {
    if (!row.file_id) await assertRoom(user, size);
  } catch (error) {
    await fsp.rm(source, { force: true });
    throw error;
  }
  const filename = uploads.newFilename(extensionOf(row.name));
  const target = path.join(userDirs(user.username).root, filename);
  await fsp.rename(source, target);
  if (row.file_id) {
    const record = await files.findOwned(user.username, String(row.file_id));
    if (!record) {
      await fsp.rm(target, { force: true });
      throw notFound('Diese Datei gibt es nicht (mehr).');
    }
    return { version: await uploads.addVersion(user, record, filename, { originalName: row.name }) };
  }
  const options = restore(row.options) || (await uploads.resolveOptions(user, {}));
  return { links: await uploads.accept(user, filename, { via: 'resumable', originalName: row.name, options }) };
}

async function discard(username, id) {
  await db.run('DELETE FROM upload_sessions WHERE id = ?', [id]);
  if (isValidUsername(username)) await fsp.rm(partPath(username, id), { force: true });
}

async function cancel(user, id) {
  const row = await find(user, id);
  await discard(user.username, row.id);
}

async function cleanup(now = Date.now()) {
  const rows = await db.all(
    'SELECT s.id, u.username FROM upload_sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.expires_at <= ? LIMIT 200',
    [now]
  );
  for (const row of rows) await discard(row.username, row.id);
  return rows.length;
}

module.exports = { CHUNK_BYTES, enabled, create, list, get, append, complete, cancel, cleanup };
