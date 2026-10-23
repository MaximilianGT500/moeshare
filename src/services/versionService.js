'use strict';

const fsp = require('fs').promises;
const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const { notFound } = require('../lib/errors');
const { hashFile } = require('../lib/hash');
const { filePaths } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');
const storage = require('./storageService');

const log = logger.scope('versionen');

const NOTES = ['original', 'edited', 'trimmed'];

const enabled = () => settings.get('uploads.versions');

function archived(record, now, note = null) {
  return {
    file_id: record.id,
    version: Number(record.version) || 1,
    filename: record.filename,
    original_name: record.original_name || null,
    size_bytes: Number(record.size_bytes) || 0,
    sha256: record.sha256 || null,
    created_at: Number(record.version_at || record.created_at) || now,
    replaced_at: now,
    resolution_width: Number(record.resolution_width) || 0,
    resolution_height: Number(record.resolution_height) || 0,
    dominant_color: record.dominant_color || '#ffffff',
    storage: record.storage || 'local',
    variants: record.variants || null,
    note: NOTES.includes(note) ? note : null,
  };
}

const present = (record, row) => ({
  id: Number(row.id),
  version: Number(row.version),
  name: row.original_name || row.filename,
  filename: row.filename,
  sizeBytes: Number(row.size_bytes) || 0,
  createdAt: Number(row.created_at),
  replacedAt: Number(row.replaced_at),
  width: Number(row.resolution_width) || 0,
  height: Number(row.resolution_height) || 0,
  note: row.note || null,
  type: files.typeOf(row.filename, record.syntax).type,
  content: `/api/files/${record.id}/versions/${row.id}/content`,
});

async function list(record) {
  const rows = await files.versionRows(record.id);
  return rows.map((row) => present(record, row));
}

async function nextNumber(record) {
  const highest = await db.count('SELECT COALESCE(MAX(version), 0) FROM file_versions WHERE file_id = ?', [record.id]);
  return Math.max(highest, Number(record.version) || 1) + 1;
}

async function prune(record) {
  const keep = settings.get('uploads.versionsKeep');
  const rows = await db.all('SELECT * FROM file_versions WHERE file_id = ? ORDER BY replaced_at DESC, version DESC', [record.id]);
  const removable = rows.filter((row) => row.note !== 'original');
  const allowance = Math.max(0, keep - (rows.length - removable.length));
  for (const row of removable.slice(allowance)) await drop(record, row);
}

async function drop(record, row) {
  await storage
    .removeArtifacts(files.versionRecord(record, row))
    .catch((error) => log.warn('Eine ältere Version ließ sich nicht löschen', { file: row.filename, error }));
  await db.run('DELETE FROM file_versions WHERE id = ?', [row.id]);
}

async function replace(record, filename, { originalName, note = null, scanStatus = null } = {}) {
  const { file } = filePaths(record.username, filename);
  const { size } = await fsp.stat(file);
  const sha256 = await hashFile(file);
  const now = Date.now();
  const keep = enabled();
  const version = keep ? await nextNumber(record) : Number(record.version) || 1;
  await db.transaction(async (tx) => {
    if (keep) await tx.insertRow('file_versions', archived(record, now, note));
    await tx.run(
      `UPDATE file_data SET filename = ?, slug = ?, size_bytes = ?, original_name = ?, sha256 = ?, deduped = 0, resolution_width = 0,
       resolution_height = 0, dominant_color = '#ffffff', storage = 'local', variants = NULL, version = ?, version_at = ?, scan_status = ?
       WHERE id = ?`,
      [
        filename,
        record.slug || record.filename,
        size,
        originalName === undefined ? record.original_name || null : originalName ? String(originalName).slice(0, 255) : null,
        sha256,
        version,
        now,
        scanStatus,
        record.id,
      ]
    );
  });
  if (!keep) {
    await storage
      .removeArtifacts(record)
      .catch((error) => log.warn('Die alte Fassung ließ sich nicht vollständig löschen', { file: record.filename, error }));
    await files.adoptTwin(record);
  }
  cache.clear();
  const updated = await files.findById(record.id);
  if (keep) await prune(updated);
  log.info(keep ? 'Neue Version gespeichert' : 'Datei ersetzt', { user: record.username, file: filename, version });
  return updated;
}

async function find(record, versionId) {
  const row = Number.isSafeInteger(Number(versionId))
    ? await db.get('SELECT * FROM file_versions WHERE id = ? AND file_id = ?', [Number(versionId), record.id])
    : null;
  if (!row) throw notFound('Diese Version gibt es nicht (mehr).');
  return row;
}

async function restore(record, versionId) {
  const row = await find(record, versionId);
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.insertRow('file_versions', archived(record, now));
    await tx.run(
      `UPDATE file_data SET filename = ?, size_bytes = ?, original_name = ?, sha256 = ?, deduped = 0, resolution_width = ?, resolution_height = ?,
       dominant_color = ?, storage = ?, variants = ?, version = ?, version_at = ? WHERE id = ?`,
      [
        row.filename,
        Number(row.size_bytes) || 0,
        row.original_name || null,
        row.sha256 || null,
        Number(row.resolution_width) || 0,
        Number(row.resolution_height) || 0,
        row.dominant_color || '#ffffff',
        row.storage || 'local',
        row.variants || null,
        Number(row.version),
        Number(row.created_at) || now,
        record.id,
      ]
    );
    await tx.run('DELETE FROM file_versions WHERE id = ?', [row.id]);
  });
  cache.clear();
  log.info('Ältere Version wiederhergestellt', { user: record.username, file: row.filename, version: Number(row.version) });
  return files.findById(record.id);
}

async function remove(record, versionId) {
  const row = await find(record, versionId);
  await drop(record, row);
  cache.clear();
}

async function keepOriginal(record, { filename, size, sha256, originalName }) {
  const now = Date.now();
  await db.insertRow('file_versions', {
    file_id: record.id,
    version: 1,
    filename,
    original_name: originalName || null,
    size_bytes: size,
    sha256: sha256 || null,
    created_at: Number(record.created_at) || now,
    replaced_at: now,
    resolution_width: 0,
    resolution_height: 0,
    dominant_color: '#ffffff',
    storage: 'local',
    variants: null,
    note: 'original',
  });
}

module.exports = { enabled, list, replace, restore, remove, find, keepOriginal };
