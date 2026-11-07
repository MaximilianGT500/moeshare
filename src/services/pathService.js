'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, conflict, forbidden } = require('../lib/errors');
const settings = require('./settingsService');

const log = logger.scope('pfade');

const REFRESH_MS = 30 * 1000;
const PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/;

const RESERVED = new Set(
  (
    'a about account accounts admin administrator api app apps assets auth avatar avatars billing blog cdn changelog contact css ' +
    'dashboard datenschutz delete design dev docs download downloads edit embed explore favicon.ico favicon.svg feed file files ' +
    'help home i i18n icons images img impressum imprint info js legal login logout manifest.webmanifest media moderation news ' +
    'oauth oembed p password privacy profile profiles public raw register report reports reset robots.txt root rss s search ' +
    'security settings setup share share-target shares sharex signin signup sitemap.xml static status support sw.js system terms ' +
    'u upload uploads user users v view views www .well-known healthz r requests metrics maintenance subtitles'
  ).split(' ')
);

let byUser = new Map();
let byName = new Map();
let timer = null;

const enabled = () => settings.get('links.personalPaths');

async function refresh() {
  const rows = await db.all(
    `SELECT p.path, p.user_id, u.username FROM user_paths p JOIN users u ON u.id = p.user_id
     WHERE p.retired_at IS NULL AND u.status = 'active'`
  );
  byUser = new Map(rows.map((row) => [Number(row.user_id), row.path]));
  byName = new Map(rows.map((row) => [row.username, row.path]));
}

function start() {
  if (timer) return;
  timer = setInterval(() => refresh().catch((error) => log.debug('Pfade nicht abgeglichen', { error })), REFRESH_MS);
  timer.unref();
}

const currentFor = (username) => (enabled() && username ? byName.get(username) || null : null);

const currentOf = (userId) => byUser.get(Number(userId)) || null;

function suggestionFor(username) {
  const base = String(username || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32);
  return PATTERN.test(base) && !RESERVED.has(base) ? base : '';
}

const isReserved = (value) => RESERVED.has(String(value || '').toLowerCase());

function normalize(input) {
  const value =
    typeof input === 'string'
      ? input
          .trim()
          .toLowerCase()
          .replace(/^\/+|\/+$/g, '')
      : '';
  if (!value) throw badRequest('Gib einen Pfad ein, zum Beispiel deinen Namen.', { field: 'path' });
  if (value.length < 2 || value.length > 32 || !PATTERN.test(value)) {
    throw badRequest('Erlaubt sind 2 bis 32 Kleinbuchstaben, Ziffern, Bindestriche und Unterstriche.', { field: 'path' });
  }
  if (RESERVED.has(value)) throw badRequest('Dieser Pfad ist für den Server reserviert.', { field: 'path' });
  return value;
}

async function assertFree(value, userId) {
  const holder = await db.get('SELECT user_id FROM user_paths WHERE path = ?', [value]);
  if (holder && Number(holder.user_id) !== Number(userId)) throw conflict('Diesen Pfad nutzt schon jemand anderes.', { field: 'path' });
  const named = await db.get('SELECT id FROM users WHERE lower(username) = ? AND id <> ?', [value, userId]);
  if (named) throw conflict('So heißt schon ein anderes Konto.', { field: 'path' });
}

async function set(user, input) {
  if (!enabled()) throw forbidden('Eigene Pfade sind auf diesem Server abgeschaltet.');
  const value = normalize(input);
  const current = (await db.get('SELECT path FROM user_paths WHERE user_id = ? AND retired_at IS NULL', [user.id])) || null;
  if (current && current.path === value) return { path: value, previous: value };
  await assertFree(value, user.id);
  const now = Date.now();
  const mine = await db.get('SELECT path FROM user_paths WHERE path = ? AND user_id = ?', [value, user.id]);
  if (mine) await db.run('UPDATE user_paths SET retired_at = NULL WHERE path = ?', [value]);
  else {
    try {
      await db.run('INSERT INTO user_paths (path, user_id, created_at, retired_at) VALUES (?, ?, ?, NULL)', [value, user.id, now]);
    } catch (error) {
      if (db.isUniqueViolation(error)) throw conflict('Diesen Pfad nutzt schon jemand anderes.', { field: 'path' });
      throw error;
    }
  }
  await db.run('UPDATE user_paths SET retired_at = ? WHERE user_id = ? AND retired_at IS NULL AND path <> ?', [now, user.id, value]);
  await refresh();
  log.info('Eigener Pfad gesetzt', { user: user.username, path: value, before: current ? current.path : undefined });
  return { path: value, previous: current ? current.path : null };
}

async function clear(userId) {
  const current = await db.get('SELECT path FROM user_paths WHERE user_id = ? AND retired_at IS NULL', [userId]);
  if (!current) return null;
  await db.run('UPDATE user_paths SET retired_at = ? WHERE user_id = ? AND retired_at IS NULL', [Date.now(), userId]);
  await refresh();
  return current.path;
}

async function revoke(userId) {
  const current = await db.get('SELECT path FROM user_paths WHERE user_id = ? AND retired_at IS NULL', [userId]);
  if (!current) return null;
  await db.run('DELETE FROM user_paths WHERE path = ?', [current.path]);
  await refresh();
  return current.path;
}

async function resolve(segment) {
  if (typeof segment !== 'string') return null;
  const value = segment.toLowerCase();
  if (!PATTERN.test(value) || RESERVED.has(value)) return null;
  const row = await db.get(
    `SELECT p.path, p.user_id, p.retired_at, u.username, u.status FROM user_paths p JOIN users u ON u.id = p.user_id WHERE p.path = ?`,
    [value]
  );
  if (!row || row.status !== 'active') return null;
  const current = row.retired_at
    ? (await db.get('SELECT path FROM user_paths WHERE user_id = ? AND retired_at IS NULL', [row.user_id])) || null
    : row;
  return {
    path: row.path,
    userId: Number(row.user_id),
    username: row.username,
    retired: Boolean(row.retired_at),
    current: current ? current.path : null,
    exact: segment === row.path,
  };
}

module.exports = {
  RESERVED,
  enabled,
  refresh,
  start,
  currentFor,
  currentOf,
  suggestionFor,
  isReserved,
  normalize,
  set,
  clear,
  revoke,
  resolve,
};
