'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const { hashFile, hashStream } = require('../lib/hash');
const { filePaths, isValidUsername } = require('../lib/storage');
const settings = require('./settingsService');
const storage = require('./storageService');

const log = logger.scope('duplikate');

const enabled = () => settings.get('uploads.deduplicate') && storage.activeDriver() === 'local';

async function sameInode(a, b) {
  try {
    const [first, second] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
    return first.ino === second.ino && first.dev === second.dev && first.ino !== 0;
  } catch {
    return false;
  }
}

async function replaceWithLink(source, target) {
  const temporary = `${target}.${crypto.randomBytes(4).toString('hex')}.link`;
  try {
    await fsp.link(source, temporary);
    await fsp.rename(temporary, target);
    return true;
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    log.debug('Duplikat ließ sich nicht verknüpfen', { error });
    return false;
  }
}

async function findTwin(username, sha256, size, excludeId = null) {
  const rows = await db.all(
    `SELECT * FROM file_data WHERE username = ? AND sha256 = ? AND storage = 'local' AND size_bytes = ?${excludeId ? ' AND id <> ?' : ''} ORDER BY deduped, id LIMIT 5`,
    [username, sha256, size, ...(excludeId ? [excludeId] : [])]
  );
  for (const row of rows) {
    if (fs.existsSync(filePaths(row.username, row.filename).file)) return row;
  }
  return null;
}

async function linkUpload(username, file, sha256, size) {
  const live = await db.get('SELECT * FROM file_data WHERE username = ? AND sha256 = ? AND deleted_at IS NULL ORDER BY id LIMIT 1', [
    username,
    sha256,
  ]);
  if (!enabled()) return { linked: false, twin: live || null };
  const twin = await findTwin(username, sha256, size);
  if (!twin) return { linked: false, twin: live || null };
  const linked = await replaceWithLink(filePaths(twin.username, twin.filename).file, file);
  return { linked, twin: live || null };
}

async function hashRecord(row) {
  const { file } = filePaths(row.username, row.filename);
  if (fs.existsSync(file)) return hashFile(file);
  if (row.storage !== 's3') return null;
  const { stream } = await storage.openRead(row);
  return hashStream(stream);
}

async function consolidate(username, sha256, size) {
  if (!enabled()) return 0;
  const rows = await db.all(
    "SELECT * FROM file_data WHERE username = ? AND sha256 = ? AND storage = 'local' AND size_bytes = ? ORDER BY id",
    [username, sha256, size]
  );
  const present = rows.filter((row) => fs.existsSync(filePaths(row.username, row.filename).file));
  if (present.length < 2) return 0;
  const [primary, ...others] = present;
  const source = filePaths(primary.username, primary.filename).file;
  let linked = 0;
  for (const row of others) {
    if (Number(row.deduped)) continue;
    const target = filePaths(row.username, row.filename).file;
    if (!(await sameInode(source, target)) && !(await replaceWithLink(source, target))) continue;
    await db.run('UPDATE file_data SET deduped = 1 WHERE id = ? AND deduped = 0', [row.id]);
    linked += 1;
  }
  if (Number(primary.deduped)) await db.run('UPDATE file_data SET deduped = 0 WHERE id = ?', [primary.id]);
  return linked;
}

async function backfill({ maxFiles = 60, maxBytes = 512 * 1024 * 1024 } = {}) {
  const rows = await db.all('SELECT * FROM file_data WHERE sha256 IS NULL ORDER BY id LIMIT ?', [maxFiles]);
  let budget = maxBytes;
  let hashed = 0;
  let linked = 0;
  for (const row of rows) {
    if (budget <= 0) break;
    if (!isValidUsername(row.username)) continue;
    budget -= Number(row.size_bytes) || 0;
    let sha256 = '';
    try {
      sha256 = (await hashRecord(row)) || '';
    } catch (error) {
      log.debug('Prüfsumme ließ sich nicht berechnen', { file: row.filename, error });
    }
    await db.run('UPDATE file_data SET sha256 = ? WHERE id = ? AND sha256 IS NULL', [sha256, row.id]);
    if (!sha256) continue;
    hashed += 1;
    linked += await consolidate(row.username, sha256, Number(row.size_bytes));
  }
  if (hashed) cache.clear();
  if (linked) log.info('Doppelte Dateien zusammengelegt', { files: linked });
  return { hashed, linked };
}

module.exports = { enabled, linkUpload, backfill };
