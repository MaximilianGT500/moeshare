'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const { badRequest, conflict, forbidden } = require('../lib/errors');
const settings = require('./settingsService');
const redirects = require('./redirectService');
const paths = require('./pathService');

const log = logger.scope('adressen');

const KINDS = {
  file: {
    table: 'file_data',
    column: 'slug',
    field: 'slug',
    max: 100,
    prefixes: [
      ['/view/', 'view'],
      ['/download/', 'download'],
    ],
  },
  link: { table: 'links', column: 'code', field: 'code', max: 64, prefixes: [['/s/', 'view']] },
  album: { table: 'albums', column: 'code', field: 'code', max: 64, prefixes: [['/a/', 'view']] },
};

const PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}._-]*[\p{L}\p{N}])?$/u;
const ROOT = new Set(['report', 'impressum', 'datenschutz', 'healthz', 'robots.txt', 'sitemap.xml']);

const enabled = () => settings.get('links.customAddresses');

const reservedAtRoot = (value) => ROOT.has(value.toLowerCase()) || paths.isReserved(value);

function normalize(kind, input) {
  const spec = KINDS[kind];
  const value = typeof input === 'string' ? input.normalize('NFC').trim() : '';
  if (!value) throw badRequest('Gib eine Adresse ein.', { field: spec.field });
  const length = [...value].length;
  if (length < 2 || length > spec.max) throw badRequest(`Die Adresse braucht 2 bis ${spec.max} Zeichen.`, { field: spec.field });
  if (!PATTERN.test(value) || value.includes('..')) {
    throw badRequest(
      'Erlaubt sind Buchstaben, Ziffern, Punkte, Binde- und Unterstriche. Vorne und hinten steht ein Buchstabe oder eine Ziffer.',
      {
        field: spec.field,
      }
    );
  }
  if (kind === 'file' && reservedAtRoot(value)) throw badRequest('Diese Adresse ist für den Server reserviert.', { field: spec.field });
  return value;
}

async function targetExists(kind, id) {
  return Boolean(await db.get(`SELECT id FROM ${KINDS[kind].table} WHERE id = ?`, [id]));
}

async function taken(kind, value, exceptId = null) {
  const spec = KINDS[kind];
  const params = kind === 'file' ? [value, value] : [value];
  const filenameClause = kind === 'file' ? ' OR filename = ?' : '';
  const rows = await db.all(`SELECT id FROM ${spec.table} WHERE (lower(${spec.column}) = lower(?)${filenameClause})`, params);
  if (rows.some((row) => Number(row.id) !== Number(exceptId))) return true;
  const entries = await redirects.lookup(spec.prefixes.map(([prefix]) => `${prefix}${value}`));
  for (const entry of entries) {
    if (entry.kind === kind && entry.id === Number(exceptId)) continue;
    if (await targetExists(entry.kind, entry.id)) return true;
  }
  return false;
}

async function claim(kind, input, exceptId = null) {
  if (!enabled()) throw forbidden('Eigene Adressen sind auf diesem Server abgeschaltet.', { field: KINDS[kind].field });
  const value = normalize(kind, input);
  if (await taken(kind, value, exceptId)) throw conflict('Diese Adresse ist schon vergeben.', { field: KINDS[kind].field });
  return value;
}

async function releaseStale(kind, value) {
  const spec = KINDS[kind];
  const entries = await redirects.lookup(spec.prefixes.map(([prefix]) => `${prefix}${value}`));
  for (const entry of entries) {
    if (!(await targetExists(entry.kind, entry.id))) await redirects.drop(entry.kind, entry.id, [entry.path]);
  }
}

async function rename(kind, row, input) {
  const spec = KINDS[kind];
  const before = row[spec.column] || (kind === 'file' ? row.filename : null);
  const value = await claim(kind, input, row.id);
  if (value === before) return { value, previous: before, changed: false };
  await releaseStale(kind, value);
  try {
    await db.run(`UPDATE ${spec.table} SET ${spec.column} = ? WHERE id = ?`, [value, row.id]);
  } catch (error) {
    if (db.isUniqueViolation(error)) throw conflict('Diese Adresse ist schon vergeben.', { field: spec.field });
    throw error;
  }
  await redirects.drop(
    kind,
    row.id,
    spec.prefixes.map(([prefix]) => `${prefix}${value}`)
  );
  if (before) {
    for (const [prefix, variant] of spec.prefixes) {
      await redirects.add(`${prefix}${before}`, kind, row.id, { variant, source: 'rename', allowReserved: [prefix.split('/')[1]] });
    }
  }
  cache.clear();
  log.info('Adresse geändert', { kind, id: row.id, before, after: value });
  return { value, previous: before, changed: true };
}

module.exports = { KINDS, enabled, normalize, taken, claim, rename, releaseStale };
