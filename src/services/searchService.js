'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const settings = require('./settingsService');
const files = require('./fileService');
const storage = require('./storageService');

const log = logger.scope('suche');

const MAX_BYTES = 512 * 1024;
const CONTEXT = 70;

const enabled = () => settings.get('search.content');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function readText(record) {
  const { stream } = await storage.openRead(record);
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= MAX_BYTES) break;
    }
  } finally {
    if (typeof stream.destroy === 'function') stream.destroy();
  }
  const buffer = Buffer.concat(chunks).subarray(0, MAX_BYTES);
  if (buffer.includes(0)) return '';
  const text = buffer.toString('utf8');
  return (total > MAX_BYTES ? text.replace(/�+$/, '') : text).replace(/\r\n?/g, '\n');
}

async function remove(fileId) {
  await db.run('DELETE FROM file_search WHERE file_id = ?', [fileId]);
}

async function store(fileId, body) {
  await db.upsert('file_search', { file_id: fileId, body, folded: body.toLowerCase(), indexed_at: Date.now() }, ['file_id']);
}

async function index(record) {
  if (!record) return false;
  if (files.typeOf(record.filename, record.syntax).type !== 'text') {
    await remove(record.id);
    return false;
  }
  let body = '';
  try {
    body = await readText(record);
  } catch (error) {
    log.debug('Text ließ sich nicht für die Suche lesen', { file: record.filename, error });
  }
  await store(record.id, body);
  return Boolean(body);
}

const indexLater = (record) =>
  index(record).catch((error) => log.warn('Der Suchindex ließ sich nicht aktualisieren', { file: record && record.filename, error }));

function snippet(body, pattern) {
  const found = pattern.exec(body);
  if (!found) return null;
  const start = Math.max(0, found.index - CONTEXT);
  const end = Math.min(body.length, found.index + found[0].length + CONTEXT);
  const clean = (text) => text.replace(/\s+/g, ' ');
  return {
    before: `${start > 0 ? '…' : ''}${clean(body.slice(start, found.index)).trimStart()}`,
    match: found[0],
    after: `${clean(body.slice(found.index + found[0].length, end)).trimEnd()}${end < body.length ? '…' : ''}`,
    line: body.slice(0, found.index).split('\n').length,
  };
}

async function snippets(ids, term) {
  const result = new Map();
  if (!ids.length || !term) return result;
  const rows = await db.all(`SELECT file_id, body FROM file_search WHERE file_id IN (${ids.map(() => '?').join(', ')})`, ids);
  const pattern = new RegExp(escapeRegex(String(term)), 'iu');
  for (const row of rows) {
    const found = snippet(String(row.body || ''), pattern);
    if (found) result.set(Number(row.file_id), found);
  }
  return result;
}

async function backfill(limit = 40) {
  if (!enabled()) return 0;
  const text = files.typeFilter('text');
  const rows = await db.all(
    `SELECT file_data.* FROM file_data LEFT JOIN file_search s ON s.file_id = file_data.id
     WHERE s.file_id IS NULL AND ${text.sql} ORDER BY file_data.id DESC LIMIT ?`,
    [...text.params, limit]
  );
  for (const row of rows) await index(row);
  return rows.length;
}

files.useContentSearch({ enabled, snippets });

module.exports = { enabled, index, indexLater, remove, backfill };
