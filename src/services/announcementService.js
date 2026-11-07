'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, notFound } = require('../lib/errors');

const log = logger.scope('ankuendigungen');

const LEVELS = ['info', 'success', 'warning', 'error'];
const AUDIENCES = ['everyone', 'users', 'admins'];
const MAX_ACTIVE = 20;
const REFRESH_MS = 30 * 1000;

let cache = [];
let loadedAt = 0;
let timer = null;

function present(row) {
  return {
    id: Number(row.id),
    title: row.title,
    text: row.text || '',
    level: LEVELS.includes(row.level) ? row.level : 'info',
    audience: AUDIENCES.includes(row.audience) ? row.audience : 'users',
    startsAt: row.starts_at ? Number(row.starts_at) : null,
    endsAt: row.ends_at ? Number(row.ends_at) : null,
    dismissible: Boolean(Number(row.dismissible)),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function refresh() {
  const rows = await db.all('SELECT * FROM announcements WHERE ends_at IS NULL OR ends_at > ? ORDER BY id DESC LIMIT 100', [Date.now()]);
  cache = rows.map(present);
  loadedAt = Date.now();
  return cache;
}

function start() {
  if (timer) return;
  refresh().catch((error) => log.debug('Ankündigungen nicht geladen', { error }));
  timer = setInterval(() => refresh().catch(() => {}), REFRESH_MS);
  timer.unref();
}

const VISIBLE = { visitor: ['everyone'], user: ['everyone', 'users'], admin: ['everyone', 'users', 'admins'] };

function current(viewer = 'visitor', now = Date.now()) {
  const audiences = VISIBLE[viewer] || VISIBLE.visitor;
  return cache
    .filter((item) => audiences.includes(item.audience) && (!item.startsAt || item.startsAt <= now) && (!item.endsAt || item.endsAt > now))
    .slice(0, 3)
    .map(({ id, title, text, level, dismissible, updatedAt }) => ({ id, title, text, level, dismissible, updatedAt }));
}

function time(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(number) || number < 0) throw badRequest('Bitte ein gültiges Datum angeben.', { field });
  return Math.round(number);
}

function clean(input, current = null) {
  const source = input && typeof input === 'object' ? input : {};
  const fields = {};
  if (source.title !== undefined || !current) {
    const title = typeof source.title === 'string' ? source.title.replace(/\s+/g, ' ').trim() : '';
    if (!title) throw badRequest('Gib der Ankündigung eine Überschrift.', { field: 'title' });
    if (title.length > 120) throw badRequest('Die Überschrift darf höchstens 120 Zeichen lang sein.', { field: 'title' });
    fields.title = title;
  }
  if (source.text !== undefined) {
    const text = typeof source.text === 'string' ? source.text.replace(/\r\n?/g, '\n').trim() : '';
    if (text.length > 1000) throw badRequest('Der Text darf höchstens 1.000 Zeichen lang sein.', { field: 'text' });
    fields.text = text || null;
  }
  if (source.level !== undefined) {
    if (!LEVELS.includes(source.level)) throw badRequest('Diese Art gibt es nicht.', { field: 'level' });
    fields.level = source.level;
  }
  if (source.audience !== undefined) {
    if (!AUDIENCES.includes(source.audience)) throw badRequest('Diese Zielgruppe gibt es nicht.', { field: 'audience' });
    fields.audience = source.audience;
  }
  if (source.startsAt !== undefined) fields.starts_at = time(source.startsAt, 'startsAt');
  if (source.endsAt !== undefined) fields.ends_at = time(source.endsAt, 'endsAt');
  if (source.dismissible !== undefined) fields.dismissible = source.dismissible === false ? 0 : 1;
  const starts = fields.starts_at !== undefined ? fields.starts_at : current ? current.starts_at : null;
  const ends = fields.ends_at !== undefined ? fields.ends_at : current ? current.ends_at : null;
  if (starts && ends && Number(ends) <= Number(starts)) throw badRequest('Das Ende muss nach dem Beginn liegen.', { field: 'endsAt' });
  return fields;
}

async function list() {
  const rows = await db.all('SELECT * FROM announcements ORDER BY id DESC LIMIT 200');
  return rows.map(present);
}

async function find(id) {
  const row = Number.isSafeInteger(Number(id)) ? await db.get('SELECT * FROM announcements WHERE id = ?', [Number(id)]) : null;
  if (!row) throw notFound('Diese Ankündigung gibt es nicht (mehr).');
  return row;
}

async function create(actorId, input) {
  const active = await db.count('SELECT COUNT(*) FROM announcements WHERE ends_at IS NULL OR ends_at > ?', [Date.now()]);
  if (active >= MAX_ACTIVE) throw badRequest(`Höchstens ${MAX_ACTIVE} Ankündigungen gleichzeitig.`);
  const now = Date.now();
  const id = await db.insertRow('announcements', {
    level: 'info',
    audience: 'users',
    dismissible: 1,
    ...clean(input),
    created_by: actorId || null,
    created_at: now,
    updated_at: now,
  });
  await refresh();
  return present(await find(id));
}

async function update(id, input) {
  const row = await find(id);
  const fields = { ...clean(input, row), updated_at: Date.now() };
  const columns = Object.keys(fields);
  await db.run(`UPDATE announcements SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
    ...columns.map((column) => fields[column]),
    row.id,
  ]);
  await refresh();
  return present(await find(row.id));
}

async function remove(id) {
  const row = await find(id);
  await db.run('DELETE FROM announcements WHERE id = ?', [row.id]);
  await refresh();
  return present(row);
}

module.exports = { LEVELS, AUDIENCES, start, refresh, current, list, create, update, remove, loadedAt: () => loadedAt };
