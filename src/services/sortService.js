'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const { badRequest, notFound } = require('../lib/errors');
const { extensionOf } = require('../lib/storage');
const { resolveExpiry, EXPIRY_CHOICES } = require('../lib/expiry');
const settings = require('./settingsService');
const files = require('./fileService');

const log = logger.scope('sort');

const MAX_RULES = 25;
const MAX_PATTERNS = 10;
const MAX_PATTERN = 100;
const MAX_EXTENSIONS = 20;
const MAX_NAME = 80;
const MAX_WARNING = 100;
const MAX_SIZE = 1024 ** 4;
const TYPES = ['image', 'video', 'audio', 'text', 'file'];
const SOURCES = ['browser', 'token', 'telegram', 'discord', 'phone', 'request'];
const APPLIES = new Set(['upload', 'resumable', 'text', 'link', 'telegram', 'discord', 'request', 'phone']);
const VIA_SOURCES = { telegram: 'telegram', discord: 'discord', request: 'request', phone: 'phone' };

const parse = (text, fallback) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
};

const unique = (list) => [...new Set(list)];

function patternsOf(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  const patterns = unique(input.map((item) => String(item).trim()).filter(Boolean));
  if (patterns.length > MAX_PATTERNS) throw badRequest(`Höchstens ${MAX_PATTERNS} Namensmuster pro Regel.`, { field: 'names' });
  for (const pattern of patterns) {
    if (pattern.length > MAX_PATTERN) throw badRequest(`Ein Namensmuster darf höchstens ${MAX_PATTERN} Zeichen haben.`, { field: 'names' });
  }
  return patterns;
}

function globRegex(pattern) {
  const source = pattern
    .split('')
    .map((char) => (char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${source}$`, 'i');
}

function extensionsOf(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/);
  const list = unique(
    input
      .map((item) =>
        String(item)
          .trim()
          .toLowerCase()
          .replace(/^\*?\./, '')
      )
      .filter(Boolean)
  );
  if (list.length > MAX_EXTENSIONS) throw badRequest(`Höchstens ${MAX_EXTENSIONS} Dateiendungen pro Regel.`, { field: 'extensions' });
  for (const ext of list) {
    if (!/^[a-z0-9]{1,12}$/.test(ext)) throw badRequest(`„${ext}“ ist keine gültige Dateiendung.`, { field: 'extensions' });
  }
  return list;
}

function sizeOf(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_SIZE) throw badRequest('Ungültige Größe.', { field });
  return Math.round(number);
}

function listOf(value, allowed, field, message) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw badRequest(message, { field });
  const list = unique(value.map(String));
  if (list.some((item) => !allowed.includes(item))) throw badRequest(message, { field });
  return list;
}

async function tokensOf(userId, value) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw badRequest('Ungültige Auswahl an Zugängen.', { field: 'tokens' });
  const ids = unique(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)).slice(0, 20);
  if (!ids.length) return [];
  const rows = await db.all(`SELECT id FROM api_tokens WHERE user_id = ? AND id IN (${ids.map(() => '?').join(', ')})`, [userId, ...ids]);
  if (rows.length !== ids.length) throw badRequest('Diesen Zugang gibt es nicht.', { field: 'tokens' });
  return ids;
}

async function albumOf(userId, value) {
  if (value === undefined || value === null || value === '') return null;
  const row = await db.get(
    `SELECT a.id, a.rule FROM albums a WHERE (a.id = ? OR a.code = ?) AND (a.user_id = ? OR EXISTS (
       SELECT 1 FROM album_members m WHERE m.album_id = a.id AND m.user_id = ?))`,
    [Number(value) || 0, String(value), userId, userId]
  );
  if (!row) throw badRequest('Dieses Album gibt es nicht.', { field: 'album' });
  if (row.rule) throw badRequest('Smarte Alben füllen sich selbst und nehmen keine Uploads an.', { field: 'album' });
  return Number(row.id);
}

function expiryOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (!EXPIRY_CHOICES.includes(text)) throw badRequest('Ungültige Ablaufzeit.', { field: 'expires' });
  return text;
}

function warningOf(value) {
  if (value === undefined || value === null || value === false) return null;
  if (value === true) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_WARNING);
}

async function normalize(userId, input = {}) {
  const name = String(input.name || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) throw badRequest('Gib der Regel einen Namen.', { field: 'name' });
  if (name.length > MAX_NAME) throw badRequest(`Der Name darf höchstens ${MAX_NAME} Zeichen haben.`, { field: 'name' });
  const when = input.conditions && typeof input.conditions === 'object' ? input.conditions : {};
  const then = input.actions && typeof input.actions === 'object' ? input.actions : {};
  const conditions = {
    types: listOf(when.types, TYPES, 'types', 'Unbekannter Dateityp.'),
    extensions: extensionsOf(when.extensions),
    names: patternsOf(when.names),
    sources: listOf(when.sources, SOURCES, 'sources', 'Unbekannte Quelle.'),
    tokens: await tokensOf(userId, when.tokens),
    minSize: sizeOf(when.minSize, 'minSize'),
    maxSize: sizeOf(when.maxSize, 'maxSize'),
  };
  if (conditions.minSize !== null && conditions.maxSize !== null && conditions.minSize > conditions.maxSize) {
    throw badRequest('Die Mindestgröße ist größer als die Höchstgröße.', { field: 'maxSize' });
  }
  if (conditions.tokens.length && conditions.sources.length && !conditions.sources.includes('token')) {
    throw badRequest('Zugänge passen nur zur Quelle „Zugang“.', { field: 'tokens' });
  }
  const actions = {
    album: await albumOf(userId, then.album),
    tags: files.normalizeTags(then.tags || []),
    expires: expiryOf(then.expires),
    warning: warningOf(then.warning),
    star: then.star === true,
  };
  if (!actions.album && !actions.tags.length && !actions.expires && actions.warning === null && !actions.star) {
    throw badRequest('Wähle mindestens eine Aktion: Album, Tags, Ablaufzeit, Inhaltswarnung oder Stern.', { field: 'actions' });
  }
  return { name, enabled: input.enabled !== false, conditions, actions, stopAfter: input.stopAfter === true };
}

function toRule(row) {
  return {
    id: Number(row.id),
    name: row.name,
    enabled: Boolean(Number(row.enabled)),
    order: Number(row.sort_order) || 0,
    conditions: {
      types: [],
      extensions: [],
      names: [],
      sources: [],
      tokens: [],
      minSize: null,
      maxSize: null,
      ...parse(row.conditions, {}),
    },
    actions: { album: null, tags: [], expires: null, warning: null, star: false, ...parse(row.actions, {}) },
    stopAfter: Boolean(Number(row.stop_after)),
    matches: Number(row.matches) || 0,
    lastMatchedAt: row.last_matched_at ? Number(row.last_matched_at) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function rows(userId) {
  return db.all('SELECT * FROM upload_rules WHERE user_id = ? ORDER BY sort_order, id', [userId]);
}

async function list(userId) {
  const found = (await rows(userId)).map(toRule);
  const albumIds = unique(found.map((rule) => rule.actions.album).filter(Boolean));
  const albums = albumIds.length
    ? await db.all(`SELECT id, code, title FROM albums WHERE id IN (${albumIds.map(() => '?').join(', ')})`, albumIds)
    : [];
  const byId = new Map(albums.map((album) => [Number(album.id), { id: Number(album.id), code: album.code, title: album.title }]));
  return found.map((rule) => ({ ...rule, album: rule.actions.album ? byId.get(rule.actions.album) || null : null }));
}

async function owned(userId, id) {
  const row = await db.get('SELECT * FROM upload_rules WHERE id = ? AND user_id = ?', [Number(id) || 0, userId]);
  if (!row) throw notFound('Diese Regel gibt es nicht.');
  return row;
}

async function create(userId, input) {
  const count = await db.count('SELECT COUNT(*) FROM upload_rules WHERE user_id = ?', [userId]);
  if (count >= MAX_RULES) throw badRequest(`Mehr als ${MAX_RULES} Regeln gehen nicht.`);
  const rule = await normalize(userId, input);
  const order = await db.count('SELECT COALESCE(MAX(sort_order), 0) FROM upload_rules WHERE user_id = ?', [userId]);
  const now = Date.now();
  const id = await db.insertRow('upload_rules', {
    user_id: userId,
    name: rule.name,
    enabled: rule.enabled ? 1 : 0,
    sort_order: order + 1,
    conditions: JSON.stringify(rule.conditions),
    actions: JSON.stringify(rule.actions),
    stop_after: rule.stopAfter ? 1 : 0,
    created_at: now,
    updated_at: now,
  });
  return (await list(userId)).find((entry) => entry.id === Number(id));
}

async function update(userId, id, input) {
  const row = await owned(userId, id);
  const current = toRule(row);
  const merged = {
    name: input.name !== undefined ? input.name : current.name,
    enabled: input.enabled !== undefined ? input.enabled === true : current.enabled,
    conditions: input.conditions !== undefined ? input.conditions : current.conditions,
    actions: input.actions !== undefined ? input.actions : current.actions,
    stopAfter: input.stopAfter !== undefined ? input.stopAfter === true : current.stopAfter,
  };
  const rule = await normalize(userId, merged);
  await db.run('UPDATE upload_rules SET name = ?, enabled = ?, conditions = ?, actions = ?, stop_after = ?, updated_at = ? WHERE id = ?', [
    rule.name,
    rule.enabled ? 1 : 0,
    JSON.stringify(rule.conditions),
    JSON.stringify(rule.actions),
    rule.stopAfter ? 1 : 0,
    Date.now(),
    row.id,
  ]);
  return (await list(userId)).find((entry) => entry.id === Number(row.id));
}

async function remove(userId, id) {
  const row = await owned(userId, id);
  await db.run('DELETE FROM upload_rules WHERE id = ?', [row.id]);
}

async function reorder(userId, ids) {
  if (!Array.isArray(ids)) throw badRequest('Erwartet wird eine Liste von Regeln.', { field: 'ids' });
  const current = await rows(userId);
  const known = new Set(current.map((row) => Number(row.id)));
  const wanted = unique(ids.map(Number)).filter((id) => known.has(id));
  const rest = current.map((row) => Number(row.id)).filter((id) => !wanted.includes(id));
  const order = [...wanted, ...rest];
  await db.transaction(async (tx) => {
    for (const [index, id] of order.entries()) await tx.run('UPDATE upload_rules SET sort_order = ? WHERE id = ?', [index + 1, id]);
  });
  return list(userId);
}

function matches(rule, facts) {
  const when = rule.conditions;
  if (when.types.length && !when.types.includes(facts.type)) return false;
  if (when.extensions.length && !when.extensions.includes(facts.extension)) return false;
  if (when.names.length) {
    const names = [facts.originalName, facts.filename].filter(Boolean);
    if (!when.names.some((pattern) => names.some((name) => globRegex(pattern).test(name)))) return false;
  }
  if (when.sources.length && !when.sources.includes(facts.source)) return false;
  if (when.tokens.length && !(facts.source === 'token' && when.tokens.includes(Number(facts.tokenId)))) return false;
  if (when.minSize !== null && facts.size < when.minSize) return false;
  if (when.maxSize !== null && facts.size > when.maxSize) return false;
  return true;
}

function factsOf({ filename, originalName = null, syntax = null, size = 0, source = null }) {
  const ext = extensionOf(filename || originalName || '').replace(/^\./, '');
  const named = originalName ? extensionOf(originalName).replace(/^\./, '') : '';
  return {
    type: files.typeOf(filename || originalName || '', syntax).type,
    extension: named || ext,
    filename: filename || '',
    originalName: originalName || '',
    size: Number(size) || 0,
    source: source ? source.kind : null,
    tokenId: source && source.tokenId ? Number(source.tokenId) : null,
  };
}

function evaluate(rules, facts) {
  const matched = [];
  const result = { album: null, tags: [], expires: null, warning: null, star: false };
  for (const rule of rules) {
    if (!rule.enabled || !matches(rule, facts)) continue;
    matched.push({ id: rule.id, name: rule.name });
    const then = rule.actions;
    if (then.album && !result.album) result.album = then.album;
    for (const tag of then.tags) if (!result.tags.includes(tag)) result.tags.push(tag);
    if (then.expires && !result.expires) result.expires = then.expires;
    if (then.warning !== null && result.warning === null) result.warning = then.warning;
    if (then.star) result.star = true;
    if (rule.stopAfter) break;
  }
  return { matched, ...result };
}

function sourceFor(via, chosen) {
  if (VIA_SOURCES[via]) return { kind: VIA_SOURCES[via] };
  return chosen && chosen.source ? chosen.source : null;
}

async function apply(user, { via, filename, originalName, syntax, size }, chosen) {
  if (!user || !user.id || !APPLIES.has(via)) return null;
  const rules = (await rows(user.id)).map(toRule).filter((rule) => rule.enabled);
  if (!rules.length) return null;
  const facts = factsOf({ filename, originalName, syntax, size, source: sourceFor(via, chosen) });
  const outcome = evaluate(rules, facts);
  if (!outcome.matched.length) return null;
  const explicit = (chosen && chosen.explicit) || {};
  const next = { ...chosen };
  if (outcome.album && !next.albumId) {
    const album = await albumOf(user.id, outcome.album).catch(() => null);
    if (album) next.albumId = album;
  }
  if (outcome.tags.length) next.tags = files.normalizeTags([...(next.tags || []), ...outcome.tags]);
  if (outcome.expires && !explicit.expires) {
    const expiry = resolveExpiry(outcome.expires, { max: settings.get('uploads.maxExpiry') });
    const capped = expiry.error === 'too_long' ? resolveExpiry(undefined, { fallback: expiry.limit, max: expiry.limit }) : expiry;
    if (!capped.error) next.expiresAt = capped.ms ? Date.now() + capped.ms : null;
  }
  if (outcome.warning !== null && !explicit.warning) next.warning = outcome.warning;
  next.star = Boolean(next.star || outcome.star);
  next.sortedBy = outcome.matched;
  const ids = outcome.matched.map((rule) => rule.id);
  db.run(`UPDATE upload_rules SET matches = matches + 1, last_matched_at = ? WHERE id IN (${ids.map(() => '?').join(', ')})`, [
    Date.now(),
    ...ids,
  ]).catch((error) => log.debug('Regelzähler nicht aktualisiert', { error }));
  return next;
}

async function test(user, input = {}) {
  const rules = (await list(user.id)).filter((rule) => rule.enabled);
  const source = SOURCES.includes(input.source) ? { kind: input.source, tokenId: Number(input.tokenId) || null } : null;
  const name = String(input.name || '').slice(0, 255);
  const facts = factsOf({ filename: name, originalName: name, size: Number(input.size) || 0, source });
  const outcome = evaluate(rules, facts);
  return { facts: { type: facts.type, extension: facts.extension, source: facts.source }, ...outcome };
}

async function forgetAlbum(albumId, q = db) {
  const users = await q.all('SELECT id, actions FROM upload_rules WHERE actions LIKE ?', [`%"album":${Number(albumId)}%`]);
  for (const row of users) {
    const actions = parse(row.actions, {});
    if (Number(actions.album) !== Number(albumId)) continue;
    actions.album = null;
    await q.run('UPDATE upload_rules SET actions = ?, updated_at = ? WHERE id = ?', [JSON.stringify(actions), Date.now(), row.id]);
  }
}

module.exports = {
  MAX_RULES,
  TYPES,
  SOURCES,
  list,
  create,
  update,
  remove,
  reorder,
  apply,
  test,
  matches,
  globRegex,
  forgetAlbum,
};
