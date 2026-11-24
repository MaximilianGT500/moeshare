'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const ephemeral = require('../lib/ephemeral');
const { conflict, notFound } = require('../lib/errors');
const { isValidUsername, isSafeFilename, baseNameOf } = require('../lib/storage');
const files = require('./fileService');
const storage = require('./storageService');

const log = logger.scope('speicher');

const MONTHS = 12;
const LARGEST = 10;
const TOP_USERS = 8;
const LIST_LIMIT = 500;
const GRACE_MS = 60 * 60 * 1000;
const TEMP_GRACE_MS = 24 * 60 * 60 * 1000;
const KIND = 'inventory';
const RESULT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const LOCK = 'inventory-check';
const LOCK_MS = 30 * 60 * 1000;
const ORPHAN_FOLDER = '.verwaist';
const STORED = '(CASE WHEN deduped = 1 THEN 0 ELSE size_bytes END)';
const STORED_OWN = '(CASE WHEN f.deduped = 1 THEN 0 ELSE f.size_bytes END)';
const HLS_PART = /^(\.m3u8|_?\d+\.ts)$/;
const VARIANT_DIRS = { preview: 'previews', m3u8: 'videos', web: 'videos' };

let running = null;

const number = (value) => Number(value) || 0;

function zoneOf(value) {
  if (typeof value !== 'string' || !value || value.length > 64) return 'UTC';
  try {
    return Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function monthKeys(now, zone) {
  const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit' });
  const parts = Object.fromEntries(format.formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  let year = Number(parts.year);
  let month = Number(parts.month);
  const keys = [];
  for (let index = 0; index < MONTHS; index++) {
    keys.unshift(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return { keys, monthOf: monthReader(zone) };
}

function monthReader(zone) {
  const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit' });
  const seen = new Map();
  return (ms) => {
    const hour = Math.floor(ms / 3600000);
    let key = seen.get(hour);
    if (!key) {
      const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
      key = `${parts.year}-${parts.month}`;
      seen.set(hour, key);
    }
    return key;
  };
}

async function freeSpace() {
  try {
    const stats = await fsp.statfs(fs.existsSync(config.paths.uploads) ? config.paths.uploads : config.paths.root);
    return { free: number(stats.bavail) * number(stats.bsize), total: number(stats.blocks) * number(stats.bsize) };
  } catch {
    return null;
  }
}

async function analysis({ timeZone = null, now = Date.now() } = {}) {
  const zone = zoneOf(timeZone);
  const { keys, monthOf } = monthKeys(now, zone);
  const oldest = now - (MONTHS + 1) * 31 * 24 * 60 * 60 * 1000;
  const [summary, trash, users, versionsByUser, recent, largest, deduped, disk, versionCount] = await Promise.all([
    files.summary(),
    db.get(`SELECT COUNT(*) AS files, COALESCE(SUM(${STORED}), 0) AS bytes FROM file_data WHERE deleted_at IS NOT NULL`),
    db.all(
      `SELECT f.username, COUNT(*) AS files, COALESCE(SUM(${STORED_OWN}), 0) AS bytes, u.quota_bytes
       FROM file_data f LEFT JOIN users u ON u.username = f.username WHERE f.deleted_at IS NULL GROUP BY f.username, u.quota_bytes`
    ),
    db.all(
      'SELECT f.username, COALESCE(SUM(v.size_bytes), 0) AS bytes FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE f.deleted_at IS NULL GROUP BY f.username'
    ),
    db.all(`SELECT created_at, ${STORED} AS bytes FROM file_data WHERE deleted_at IS NULL AND created_at >= ?`, [oldest]),
    db.all(
      `SELECT id, username, filename, slug, original_name, title, size_bytes, created_at, storage FROM file_data WHERE deleted_at IS NULL
       ORDER BY size_bytes DESC, id DESC LIMIT ?`,
      [LARGEST]
    ),
    db.get('SELECT COUNT(*) AS files FROM file_data WHERE deleted_at IS NULL AND deduped = 1'),
    freeSpace(),
    db.count('SELECT COUNT(*) FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE f.deleted_at IS NULL'),
  ]);
  const versionBytes = new Map(versionsByUser.map((row) => [row.username, number(row.bytes)]));
  const ranked = users
    .map((row) => ({
      username: row.username,
      files: number(row.files),
      bytes: number(row.bytes) + (versionBytes.get(row.username) || 0),
      quota: row.quota_bytes === null || row.quota_bytes === undefined ? null : number(row.quota_bytes),
    }))
    .sort((a, b) => b.bytes - a.bytes || a.username.localeCompare(b.username));
  const rest = ranked.slice(TOP_USERS);
  const months = new Map(keys.map((key) => [key, { month: key, files: 0, bytes: 0 }]));
  for (const row of recent) {
    const entry = months.get(monthOf(number(row.created_at)));
    if (!entry) continue;
    entry.files += 1;
    entry.bytes += number(row.bytes);
  }
  const breakdown = summary.storageBreakdown;
  const counts = { image: summary.images, video: summary.videos, audio: summary.audio };
  return {
    timeZone: zone,
    total: { files: summary.files, bytes: summary.storageBytes },
    types: [
      { type: 'image', files: counts.image, bytes: breakdown.images },
      { type: 'video', files: counts.video, bytes: breakdown.videos },
      { type: 'audio', files: counts.audio, bytes: breakdown.audio },
      { type: 'other', files: Math.max(0, summary.files - counts.image - counts.video - counts.audio), bytes: breakdown.other },
      { type: 'versions', files: versionCount, bytes: breakdown.versions },
    ],
    users: {
      top: ranked.slice(0, TOP_USERS),
      rest: rest.length
        ? { users: rest.length, files: rest.reduce((sum, row) => sum + row.files, 0), bytes: rest.reduce((sum, row) => sum + row.bytes, 0) }
        : null,
    },
    months: [...months.values()],
    largest: largest.map((row) => {
      const record = files.toFile(row);
      return {
        id: number(row.id),
        username: row.username,
        name: row.title || row.original_name || row.filename,
        sizeBytes: number(row.size_bytes),
        createdAt: row.created_at ? number(row.created_at) : null,
        type: record.type,
        view: record.urls.view,
        storage: row.storage || 'local',
      };
    }),
    savings: { files: number(deduped && deduped.files), bytes: summary.savedBytes },
    trash: { files: number(trash && trash.files), bytes: number(trash && trash.bytes) },
    disk,
    driver: storage.activeDriver(),
    lastCheck: summaryOf(await lastResult()),
  };
}

function summaryOf(result) {
  if (!result) return null;
  return {
    finishedAt: result.finishedAt,
    missing: result.missing.count,
    orphans: result.orphans.count,
    orphanBytes: result.orphans.bytes,
    disk: result.disk,
  };
}

async function lastResult() {
  const stored = await ephemeral.get(KIND, 'result').catch(() => null);
  return stored && typeof stored === 'object' && stored.missing && stored.orphans ? stored : null;
}

async function knownPaths() {
  const known = new Set();
  const bases = new Map();
  const remember = (username, filename) => {
    if (!isValidUsername(username) || !isSafeFilename(filename)) return;
    const base = baseNameOf(filename);
    known.add(`${username}/${filename}`);
    known.add(`${username}/preview/${filename}`);
    known.add(`${username}/preview/${base}.jpg`);
    known.add(`${username}/web/${base}.mp4`);
    known.add(`${username}/web/conversionStarted-${base}`);
    known.add(`${username}/m3u8/conversionStarted-${base}`);
    known.add(`${username}/m3u8/conversionComplete-${base}`);
    if (!bases.has(username)) bases.set(username, new Set());
    bases.get(username).add(base);
  };
  const rows = await db.all(
    'SELECT id, username, filename, storage, size_bytes, created_at, deleted_at, original_name, title FROM file_data'
  );
  const versions = await db.all(
    'SELECT v.id, v.file_id, v.filename, v.storage, v.size_bytes, v.created_at, f.username FROM file_versions v JOIN file_data f ON f.id = v.file_id'
  );
  for (const row of rows) remember(row.username, row.filename);
  for (const row of versions) remember(row.username, row.filename);
  const isKnown = (relative) => {
    if (known.has(relative)) return true;
    const match = /^([^/]+)\/m3u8\/(.+)$/.exec(relative);
    if (!match || !bases.has(match[1])) return false;
    for (const base of bases.get(match[1])) {
      if (match[2].startsWith(base) && HLS_PART.test(match[2].slice(base.length))) return true;
    }
    return false;
  };
  return { rows, versions, isKnown };
}

async function entriesOf(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function walkUploads(isKnown, now, onProgress) {
  const root = config.paths.uploads;
  const disk = { originals: 0, previews: 0, videos: 0, other: 0, total: 0 };
  const seen = new Set();
  const orphans = { count: 0, bytes: 0, items: [] };
  let visited = 0;
  const account = async (file, relative, bucket) => {
    let stat;
    try {
      stat = await fsp.lstat(file);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;
    visited += 1;
    if (visited % 500 === 0) onProgress({ scanned: visited });
    const inode = `${stat.dev}:${stat.ino}`;
    const fresh = stat.ino && seen.has(inode) ? 0 : stat.size;
    if (stat.ino) seen.add(inode);
    if (isKnown(relative)) {
      disk[bucket] += fresh;
      disk.total += fresh;
      return null;
    }
    const temporary = path.basename(relative).startsWith('.');
    if (now - stat.mtimeMs < (temporary ? TEMP_GRACE_MS : GRACE_MS)) return null;
    orphans.count += 1;
    orphans.bytes += stat.size;
    disk.other += fresh;
    disk.total += fresh;
    if (orphans.items.length < LIST_LIMIT)
      orphans.items.push({ path: relative, sizeBytes: stat.size, modifiedAt: Math.round(stat.mtimeMs) });
    return null;
  };
  for (const user of await entriesOf(root)) {
    if (!user.isDirectory() || user.name.startsWith('.') || !isValidUsername(user.name)) continue;
    for (const entry of await entriesOf(path.join(root, user.name))) {
      const full = path.join(root, user.name, entry.name);
      if (entry.isDirectory()) {
        const bucket = VARIANT_DIRS[entry.name];
        if (!bucket) continue;
        for (const inner of await entriesOf(full)) {
          if (inner.isFile()) await account(path.join(full, inner.name), `${user.name}/${entry.name}/${inner.name}`, bucket);
        }
      } else if (entry.isFile()) {
        await account(full, `${user.name}/${entry.name}`, 'originals');
      }
    }
  }
  return { disk, orphans, scanned: visited };
}

async function missingFiles(rows, versions, onProgress) {
  const missing = { count: 0, bytes: 0, items: [] };
  const remote = new Map();
  const remoteNames = async (username) => {
    if (!remote.has(username)) remote.set(username, await storage.remoteOriginals(username).catch(() => null));
    return remote.get(username);
  };
  const check = async (entry) => {
    if (!isValidUsername(entry.username) || !isSafeFilename(entry.filename)) return;
    let present = false;
    if (entry.storage === 's3') {
      if (!storage.configured()) present = false;
      else {
        const names = await remoteNames(entry.username);
        present = names === null || names.has(entry.filename);
      }
    } else {
      present = fs.existsSync(path.join(config.paths.uploads, entry.username, entry.filename));
    }
    if (present) return;
    missing.count += 1;
    missing.bytes += number(entry.size_bytes);
    if (missing.items.length < LIST_LIMIT) missing.items.push(entry.item);
  };
  let done = 0;
  for (const row of rows) {
    await check({
      ...row,
      item: {
        kind: 'file',
        id: number(row.id),
        username: row.username,
        filename: row.filename,
        name: row.title || row.original_name || row.filename,
        sizeBytes: number(row.size_bytes),
        createdAt: row.created_at ? number(row.created_at) : null,
        storage: row.storage || 'local',
        deleted: Boolean(row.deleted_at),
      },
    });
    done += 1;
    if (done % 500 === 0) onProgress({ checked: done });
  }
  for (const row of versions) {
    await check({
      ...row,
      item: {
        kind: 'version',
        id: number(row.file_id),
        username: row.username,
        filename: row.filename,
        name: row.filename,
        sizeBytes: number(row.size_bytes),
        createdAt: row.created_at ? number(row.created_at) : null,
        storage: row.storage || 'local',
        deleted: false,
      },
    });
  }
  return missing;
}

async function audit({ onProgress = () => {}, now = Date.now() } = {}) {
  const started = Date.now();
  const { rows, versions, isKnown } = await knownPaths();
  onProgress({ phase: 'missing', total: rows.length + versions.length });
  const missing = await missingFiles(rows, versions, (progress) => onProgress({ phase: 'missing', ...progress }));
  onProgress({ phase: 'orphans' });
  const walked = await walkUploads(isKnown, now, (progress) => onProgress({ phase: 'orphans', ...progress }));
  return {
    startedAt: started,
    finishedAt: Date.now(),
    driver: storage.activeDriver(),
    checked: { files: rows.length, versions: versions.length, scanned: walked.scanned },
    missing,
    orphans: walked.orphans,
    disk: walked.disk,
    moved: null,
  };
}

const progress = { phase: null, checked: 0, scanned: 0, total: 0, startedAt: null };

function status() {
  return { running: Boolean(running), progress: running ? { ...progress } : null };
}

async function check({ onProgress = () => {}, actor = null, token = null } = {}) {
  const lock = token || (await ephemeral.acquire(LOCK, LOCK_MS).catch(() => null));
  if (!lock) throw conflict('Die Speicherprüfung läuft schon.');
  try {
    const result = await audit({ onProgress });
    await ephemeral.put(KIND, 'result', result, RESULT_TTL_MS);
    log.info('Speicher geprüft', { missing: result.missing.count, orphans: result.orphans.count, by: actor || undefined });
    return result;
  } finally {
    await ephemeral.release(LOCK, lock).catch(() => {});
  }
}

async function start({ actor = null } = {}) {
  if (running) return status();
  const token = await ephemeral.acquire(LOCK, LOCK_MS).catch(() => null);
  if (!token) throw conflict('Die Speicherprüfung läuft schon.');
  Object.assign(progress, { phase: 'missing', checked: 0, scanned: 0, total: 0, startedAt: Date.now() });
  running = check({ onProgress: (next) => Object.assign(progress, next), actor, token })
    .catch((error) => {
      log.error('Die Speicherprüfung ist fehlgeschlagen', { error });
      throw error;
    })
    .finally(() => {
      running = null;
    });
  running.catch(() => {});
  return status();
}

async function wait() {
  if (running) await running.catch(() => {});
  return lastResult();
}

async function result() {
  return { ...status(), result: await lastResult() };
}

function stampOf(now) {
  return new Date(now).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function moveOrphans({ now = Date.now() } = {}) {
  if (running) throw conflict('Die Speicherprüfung läuft gerade, versuch es gleich noch einmal.');
  const last = await lastResult();
  if (!last || !last.orphans.items.length) throw notFound('Es gibt keine verwaisten Dateien zum Verschieben.');
  const { isKnown } = await knownPaths();
  const folder = path.join(config.paths.uploads, ORPHAN_FOLDER, stampOf(now));
  const moved = { at: now, count: 0, bytes: 0, folder: path.relative(config.paths.root, folder).split(path.sep).join('/') };
  for (const item of last.orphans.items) {
    const parts = item.path.split('/');
    if (parts.length < 2 || parts.some((part) => !part || part === '.' || part === '..') || isKnown(item.path)) continue;
    const source = path.join(config.paths.uploads, ...parts);
    let stat;
    try {
      stat = await fsp.lstat(source);
    } catch {
      continue;
    }
    if (!stat.isFile() || now - stat.mtimeMs < GRACE_MS) continue;
    const target = path.join(folder, ...parts);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.rename(source, target);
    moved.count += 1;
    moved.bytes += stat.size;
  }
  const next = {
    ...last,
    orphans: { count: Math.max(0, last.orphans.count - moved.count), bytes: Math.max(0, last.orphans.bytes - moved.bytes), items: [] },
    disk: { ...last.disk, other: Math.max(0, last.disk.other - moved.bytes), total: Math.max(0, last.disk.total - moved.bytes) },
    moved,
  };
  await ephemeral.put(KIND, 'result', next, RESULT_TTL_MS);
  log.info('Verwaiste Dateien verschoben', { files: moved.count, folder: moved.folder });
  return next;
}

module.exports = { analysis, audit, check, start, wait, status, result, moveOrphans, lastResult, ORPHAN_FOLDER };
