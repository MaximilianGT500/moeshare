'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('../../config');
const { parseDatabaseUrl, maskUrl } = require('../db/url');
const { build } = require('../db/dialect');
const { introspect } = require('../db/schema');

async function openSource(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('Gib die Datenbank des alten Uploaders an.');
  const isUrl = /^[a-z0-9+]+:\/\//i.test(text) || /^sqlite3?:/i.test(text);
  const options = isUrl ? parseDatabaseUrl(text, config.paths.root) : { client: 'sqlite', file: path.resolve(config.paths.root, text) };
  if (options.client === 'sqlite') {
    if (!fs.existsSync(options.file) || !fs.statSync(options.file).isFile()) throw new Error('Die Datenbankdatei gibt es nicht.');
    const sqlite3 = require('sqlite3');
    const connection = await new Promise((resolve, reject) => {
      const opened = new sqlite3.Database(options.file, sqlite3.OPEN_READONLY, (error) => (error ? reject(error) : resolve(opened)));
    });
    connection.configure('busyTimeout', 5000);
    const exec = (sql, params = []) =>
      new Promise((resolve, reject) =>
        connection.all(sql, params, (error, rows) => (error ? reject(error) : resolve({ rows, changes: 0, insertId: null })))
      );
    return {
      db: build(exec, 'sqlite'),
      client: 'sqlite',
      label: options.file,
      close: () => new Promise((resolve) => connection.close(() => resolve())),
    };
  }
  const Adapter = require(`../db/${options.client}`);
  const adapter = new Adapter(options);
  await adapter.open();
  return {
    db: build((sql, params) => adapter.query(sql, params), adapter.client),
    client: adapter.client,
    label: maskUrl(text),
    close: () => adapter.close(),
  };
}

async function shape(source, tables) {
  const look = introspect(source.db);
  const result = {};
  for (const table of tables) result[table] = (await look.hasTable(table)) ? await look.columns(table) : null;
  return result;
}

function toMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return number < 1e11 ? Math.round(number * 1000) : Math.round(number);
  }
  const text = String(value).trim();
  const normalized = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

const toInt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};

const truthy = (value) => value === true || value === 1 || value === '1' || value === 't' || value === 'true';

const UNITS = { b: 1, kb: 1024, k: 1024, mb: 1024 ** 2, m: 1024 ** 2, gb: 1024 ** 3, g: 1024 ** 3, tb: 1024 ** 4, t: 1024 ** 4 };

function parseBytes(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([kmgt]?b?|[kmgt])?\s*$/i.exec(String(value));
  if (!match) return null;
  const bytes = Math.round(Number(match[1]) * (UNITS[(match[2] || 'b').toLowerCase()] || 1));
  return bytes > 0 ? bytes : null;
}

function inflate(value) {
  if (typeof value !== 'string' || !value) return value || '';
  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded[0] === 0x1f && decoded[1] === 0x8b) return zlib.gunzipSync(decoded).toString('utf8');
  } catch {}
  return value;
}

const extensionOf = (name) => {
  const ext = path.extname(String(name || '')).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
};

module.exports = { openSource, shape, toMs, toInt, truthy, parseBytes, inflate, extensionOf };
