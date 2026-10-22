'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const { notFound } = require('../lib/errors');
const { berlinDate } = require('../lib/format');
const { displayPath } = require('../lib/slugs');
const { extensionOf, baseNameOf, userDirs, isSafeFilename } = require('../lib/storage');
const settings = require('./settingsService');
const storage = require('./storageService');
const domains = require('./domainService');

const fsp = require('fs').promises;

const log = logger.scope('files');

const MEDIA_TYPES = ['image', 'video', 'audio'];
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE = 'deleted_at IS NULL';

const TEXT_SYNTAX = {
  '.txt': 'plaintext',
  '.text': 'plaintext',
  '.log': 'plaintext',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.json': 'json',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.ps1': 'powershell',
  '.bat': 'dos',
  '.sql': 'sql',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.xml': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.lua': 'lua',
  '.swift': 'swift',
  '.diff': 'diff',
  '.patch': 'diff',
  '.csv': 'plaintext',
};

const SORTS = {
  newest: 'id DESC',
  oldest: 'id ASC',
  name: 'lower(filename) ASC, id ASC',
  size: 'size_bytes DESC, id DESC',
  views: 'views DESC, id DESC',
  expiring: 'CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ASC, id DESC',
};

const formatsOf = (type) =>
  type === 'image' ? [...settings.get('uploads.formats.image'), '.gif'] : settings.get(`uploads.formats.${type}`);

function typeOf(filename, syntax = null) {
  const ext = extensionOf(filename);
  if (ext === '.gif') return { type: 'image', isGif: true };
  const type = MEDIA_TYPES.find((candidate) => formatsOf(candidate).includes(ext));
  if (type) return { type, isGif: false };
  if (syntax || TEXT_SYNTAX[ext]) return { type: 'text', isGif: false };
  return { type: 'file', isGif: false };
}

const syntaxOf = (record) => record.syntax || TEXT_SYNTAX[extensionOf(record.filename)] || null;

function matchesAny(extensions) {
  if (!extensions.length) return { sql: '1 = 0', params: [] };
  return {
    sql: `(${extensions.map(() => "lower(filename) LIKE ? ESCAPE '!'").join(' OR ')})`,
    params: extensions.map((ext) => `%${db.escapeLike(ext.toLowerCase())}`),
  };
}

function typeFilter(type) {
  if (MEDIA_TYPES.includes(type)) return matchesAny(formatsOf(type));
  const media = matchesAny(MEDIA_TYPES.flatMap(formatsOf));
  const text = matchesAny(Object.keys(TEXT_SYNTAX));
  if (type === 'text')
    return { sql: `(NOT ${media.sql} AND (syntax IS NOT NULL OR ${text.sql}))`, params: [...media.params, ...text.params] };
  if (type !== 'file') return null;
  return { sql: `(NOT ${media.sql} AND syntax IS NULL AND NOT ${text.sql})`, params: [...media.params, ...text.params] };
}

const origins = () => [settings.get('site.baseUrl'), ...settings.get('site.domains')];

const originsFor = (username) => [...origins(), ...(username ? domains.originsFor(username) : [])];

function pickDomain(preference, username = null) {
  const base = settings.get('site.baseUrl');
  const all = originsFor(username);
  if (!preference || preference === 'base' || all.length < 2) return base;
  if (preference === 'random') return all[Math.floor(Math.random() * all.length)];
  return all.includes(preference) ? preference : base;
}

function resolveDomain(value, username = null) {
  const text = String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
  if (!text) return null;
  if (text === 'base' || text === 'random') return text;
  const candidates = originsFor(username);
  return candidates.find((origin) => origin.toLowerCase() === text || new URL(origin).host.toLowerCase() === text) || undefined;
}

const hostFor = (record, domain) => (domain && originsFor(record.username).includes(domain) ? domain : settings.get('site.baseUrl'));

function urlsFor(record, { domain = null } = {}) {
  const base = settings.get('site.baseUrl');
  const host = hostFor(record, domain);
  const { type } = typeOf(record.filename, record.syntax);
  const preview = type === 'video' ? `${baseNameOf(record.filename)}.jpg` : record.filename;
  const slug = record.slug || record.filename;
  return {
    view: `${host}/view/${displayPath(slug)}`,
    direct: `${host}/uploads/${record.username}/${record.filename}`,
    download: `${host}/download/${displayPath(slug)}`,
    preview: `${host}/uploads/${record.username}/preview/${preview}`,
    delete: `${base}/delete/${displayPath(slug)}`,
  };
}

function protectionOf(record) {
  return {
    password: Boolean(record.password_hash),
    maxViews: record.max_views || null,
    expiresAt: record.expires_at ? Number(record.expires_at) : null,
  };
}

const toFile = (row, tags = [], domain = null) => ({
  id: row.id,
  slug: row.slug || row.filename,
  filename: row.filename,
  username: row.username,
  title: row.title || null,
  originalName: row.original_name || null,
  sizeBytes: Number(row.size_bytes) || 0,
  date: row.creation_date,
  createdAt: row.created_at ? Number(row.created_at) : null,
  width: row.resolution_width,
  height: row.resolution_height,
  color: row.dominant_color,
  views: row.views || 0,
  storage: row.storage || 'local',
  syntax: syntaxOf(row),
  tags,
  listed: Boolean(row.listed),
  deletedAt: row.deleted_at ? Number(row.deleted_at) : null,
  purgeAt: row.deleted_at ? Number(row.deleted_at) + settings.get('trash.days') * DAY_MS : null,
  blocked: row.blocked_at ? { at: Number(row.blocked_at), reason: row.blocked_reason || '' } : null,
  ...protectionOf(row),
  ...typeOf(row.filename, row.syntax),
  urls: urlsFor(row, { domain }),
});

async function tagsByFile(ids) {
  if (!ids.length) return new Map();
  const rows = await db.all(`SELECT file_id, tag FROM file_tags WHERE file_id IN (${ids.map(() => '?').join(', ')}) ORDER BY tag`, ids);
  const grouped = new Map();
  for (const row of rows) grouped.set(Number(row.file_id), [...(grouped.get(Number(row.file_id)) || []), row.tag]);
  return grouped;
}

async function withTags(rows, { domain = null } = {}) {
  const tags = await tagsByFile(rows.map((row) => row.id));
  return rows.map((row) => toFile(row, tags.get(Number(row.id)) || [], domain));
}

async function paginate({ conditions, params, order, page, limit, maxLimit, from = 'file_data', domain = null }) {
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const size = Math.min(maxLimit, Math.max(1, Number.parseInt(limit, 10) || 24));
  const total = await db.count(`SELECT COUNT(*) FROM ${from} ${where}`, params);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
  const rows = await db.all(`SELECT file_data.* FROM ${from} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [
    ...params,
    size,
    (current - 1) * size,
  ]);
  return { files: await withTags(rows, { domain }), total, page: current, pages, limit: size, hasNext: current < pages };
}

function searchCondition(search) {
  const term = `%${db.escapeLike(String(search).toLowerCase())}%`;
  return {
    sql: "(lower(filename) LIKE ? ESCAPE '!' OR lower(slug) LIKE ? ESCAPE '!' OR lower(title) LIKE ? ESCAPE '!' OR lower(original_name) LIKE ? ESCAPE '!')",
    params: [term, term, term, term],
  };
}

function listForUser(
  username,
  { page = 1, limit = 24, search = '', type = '', sort = 'newest', tag = '', album = null, trash = false, domain = null } = {}
) {
  const conditions = ['file_data.username = ?', trash ? 'file_data.deleted_at IS NOT NULL' : 'file_data.deleted_at IS NULL'];
  const params = [username];
  if (search) {
    const condition = searchCondition(search);
    conditions.push(condition.sql);
    params.push(...condition.params);
  }
  const filter = typeFilter(type);
  if (filter) {
    conditions.push(filter.sql);
    params.push(...filter.params);
  }
  if (tag) {
    conditions.push('EXISTS (SELECT 1 FROM file_tags t WHERE t.file_id = file_data.id AND t.tag = ?)');
    params.push(normalizeTag(tag) || '');
  }
  if (album) {
    conditions.push('EXISTS (SELECT 1 FROM album_files a WHERE a.file_id = file_data.id AND a.album_id = ?)');
    params.push(Number(album) || 0);
  }
  const order = trash ? 'deleted_at DESC, id DESC' : SORTS[sort] || SORTS.newest;
  return paginate({ conditions, params, order, page, limit, maxLimit: 100, domain });
}

function listAll({ page = 1, limit = 50, search = '', trash = false } = {}) {
  const conditions = [trash ? 'deleted_at IS NOT NULL' : LIVE];
  const params = [];
  if (search) {
    const condition = searchCondition(search);
    conditions.push(condition.sql);
    params.push(...condition.params);
  }
  return paginate({ conditions, params, order: trash ? 'deleted_at DESC, id DESC' : SORTS.newest, page, limit, maxLimit: 200 });
}

function listListed(username, { page = 1, limit = 30, now = Date.now(), domain = null } = {}) {
  return paginate({
    conditions: [
      'username = ?',
      'listed = 1',
      LIVE,
      'blocked_at IS NULL',
      'password_hash IS NULL',
      'max_views IS NULL',
      '(expires_at IS NULL OR expires_at > ?)',
    ],
    params: [username, now],
    order: SORTS.newest,
    page,
    limit,
    maxLimit: 60,
    domain,
  });
}

const namesFor = (username) =>
  db
    .all(`SELECT filename FROM file_data WHERE username = ? AND ${LIVE} ORDER BY id DESC`, [username])
    .then((rows) => rows.map((row) => row.filename));

const findByFilename = (filename) => db.get(`SELECT * FROM file_data WHERE filename = ? AND ${LIVE}`, [filename]);

const findById = (id) =>
  Number.isSafeInteger(Number(id)) && Number(id) > 0 ? db.get('SELECT * FROM file_data WHERE id = ?', [Number(id)]) : null;

async function findBySlug(slug) {
  if (typeof slug !== 'string' || !slug || slug.length > 255) return null;
  return (
    (await db.get(`SELECT * FROM file_data WHERE slug = ? AND ${LIVE}`, [slug])) || (isSafeFilename(slug) ? findByFilename(slug) : null)
  );
}

const slugTaken = async (slug) => Boolean(await db.get('SELECT id FROM file_data WHERE slug = ? OR filename = ?', [slug, slug]));

const find = (username, filename) =>
  db.get(`SELECT * FROM file_data WHERE username = ? AND filename = ? AND ${LIVE}`, [username, filename]);

async function findOwned(username, key, { deleted = false } = {}) {
  const byId = /^\d+$/.test(String(key)) ? await findById(key) : null;
  const record = byId || (await findBySlug(String(key)));
  if (!record || record.username !== username) return null;
  if (Boolean(record.deleted_at) !== deleted) return null;
  return record;
}

async function insert({
  username,
  filename,
  sizeBytes,
  createdAt = new Date(),
  slug = filename,
  expiresAt = null,
  passwordHash = null,
  maxViews = null,
  originalName = null,
  title = null,
  syntax = null,
}) {
  const id = await db.insertRow('file_data', {
    username,
    filename,
    slug,
    creation_date: berlinDate(createdAt),
    created_at: createdAt.getTime(),
    size_bytes: sizeBytes,
    dominant_color: '#ffffff',
    resolution_width: 0,
    resolution_height: 0,
    views: 0,
    storage: 'local',
    expires_at: expiresAt,
    password_hash: passwordHash,
    max_views: maxViews,
    original_name: originalName ? String(originalName).slice(0, 255) : null,
    title: title ? String(title).slice(0, 255) : null,
    syntax,
  });
  cache.clear();
  return findById(id);
}

async function update(username, filename, { dominantColor, width, height }) {
  await db.run('UPDATE file_data SET dominant_color = ?, resolution_width = ?, resolution_height = ? WHERE username = ? AND filename = ?', [
    dominantColor,
    width,
    height,
    username,
    filename,
  ]);
}

async function patch(record, fields) {
  const columns = Object.keys(fields);
  if (!columns.length) return record;
  await db.run(`UPDATE file_data SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
    ...columns.map((column) => fields[column]),
    record.id,
  ]);
  cache.clear();
  return findById(record.id);
}

async function forget(record) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM album_files WHERE file_id = ?', [record.id]);
    await tx.run('DELETE FROM file_tags WHERE file_id = ?', [record.id]);
    await tx.run('UPDATE albums SET cover_file_id = NULL WHERE cover_file_id = ?', [record.id]);
    await tx.run("DELETE FROM stats_daily WHERE kind = 'f' AND ref_id = ?", [record.id]);
    await tx.run("DELETE FROM stats_sources WHERE kind = 'f' AND ref_id = ?", [record.id]);
    await tx.run('DELETE FROM file_data WHERE id = ?', [record.id]);
  });
}

const REMOVAL_MESSAGES = {
  expired: 'Abgelaufene Datei gelöscht',
  trash: 'Datei aus dem Papierkorb gelöscht',
  deleted: 'Datei gelöscht',
};

async function removeRecord(record, reason = 'deleted') {
  await storage.removeArtifacts(record);
  await forget(record);
  cache.clear();
  log.info(REMOVAL_MESSAGES[reason] || REMOVAL_MESSAGES.deleted, { user: record.username, file: record.filename });
}

const trashEnabled = () => settings.get('trash.enabled');

async function moveToTrash(record, actorId = null) {
  await db.run(`UPDATE file_data SET deleted_at = ?, deleted_by = ? WHERE id = ? AND ${LIVE}`, [Date.now(), actorId, record.id]);
  cache.clear();
  log.info('Datei in den Papierkorb gelegt', { user: record.username, file: record.filename });
}

async function discard(record, { actorId = null, permanent = false } = {}) {
  if (!permanent && !record.deleted_at && trashEnabled()) {
    await moveToTrash(record, actorId);
    return { trashed: true };
  }
  await removeRecord(record);
  return { trashed: false };
}

async function restore(record) {
  await db.run('UPDATE file_data SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [record.id]);
  cache.clear();
  log.info('Datei wiederhergestellt', { user: record.username, file: record.filename });
  return findById(record.id);
}

async function remove(username, key, options = {}) {
  const record = isSafeFilename(key) ? await find(username, key) : null;
  const owned = record || (await findOwned(username, key));
  if (!owned) throw notFound('Diese Datei gibt es nicht (mehr).');
  const result = await discard(owned, options);
  return { record: owned, ...result };
}

async function emptyTrash(username) {
  const rows = await db.all('SELECT * FROM file_data WHERE username = ? AND deleted_at IS NOT NULL', [username]);
  for (const row of rows) await removeRecord(row, 'trash');
  return rows.length;
}

async function purgeTrash(now = Date.now()) {
  const cutoff = now - settings.get('trash.days') * DAY_MS;
  const rows = await db.all('SELECT * FROM file_data WHERE deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at LIMIT 200', [
    cutoff,
  ]);
  let removed = 0;
  for (const row of rows) {
    try {
      await removeRecord(row, 'trash');
      removed += 1;
    } catch (error) {
      log.warn('Datei im Papierkorb konnte nicht gelöscht werden', { file: row.filename, error });
    }
  }
  return removed;
}

async function trashSummary(username) {
  const row = await db.get(
    'SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM file_data WHERE username = ? AND deleted_at IS NOT NULL',
    [username]
  );
  return { files: Number(row.files) || 0, bytes: Number(row.bytes) || 0, days: settings.get('trash.days'), enabled: trashEnabled() };
}

async function removeAllForUser(username) {
  const rows = await db.all("SELECT * FROM file_data WHERE username = ? AND storage = 's3'", [username]);
  for (const row of rows)
    await storage.removeArtifacts(row).catch((error) => log.warn('S3-Datei blieb liegen', { file: row.filename, error }));
  await db.transaction(async (tx) => {
    const own = 'SELECT id FROM file_data WHERE username = ?';
    await tx.run(`DELETE FROM album_files WHERE file_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM file_tags WHERE file_id IN (${own})`, [username]);
    await tx.run(`UPDATE albums SET cover_file_id = NULL WHERE cover_file_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM stats_daily WHERE kind = 'f' AND ref_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM stats_sources WHERE kind = 'f' AND ref_id IN (${own})`, [username]);
    await tx.run('DELETE FROM file_data WHERE username = ?', [username]);
  });
  await fsp.rm(userDirs(username).root, { recursive: true, force: true });
  cache.clear();
}

async function removeExpired(now = Date.now()) {
  const rows = await db.all('SELECT * FROM file_data WHERE expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at LIMIT 200', [
    now,
  ]);
  let removed = 0;
  for (const row of rows) {
    try {
      await removeRecord(row, 'expired');
      removed += 1;
    } catch (error) {
      log.warn('Abgelaufene Datei konnte nicht gelöscht werden', { file: row.filename, error });
    }
  }
  return removed;
}

const incrementViews = (id) => db.run('UPDATE file_data SET views = views + 1 WHERE id = ?', [id]);

async function consumeView(record, graceMs) {
  const { changes } = await db.run('UPDATE file_data SET views = views + 1 WHERE id = ? AND views < max_views', [record.id]);
  if (changes !== 1) return false;
  if (Number(record.views) + 1 >= Number(record.max_views)) {
    const until = Date.now() + graceMs;
    await db.run('UPDATE file_data SET expires_at = ? WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)', [until, record.id, until]);
  }
  cache.clear();
  return true;
}

function normalizeTag(raw) {
  const tag = String(raw || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, MAX_TAG_LENGTH);
  return tag || null;
}

function normalizeTags(list) {
  const input = Array.isArray(list) ? list : String(list || '').split(/[,\s]+/);
  const tags = [];
  for (const raw of input) {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS);
}

async function setTags(record, list) {
  const tags = normalizeTags(list);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM file_tags WHERE file_id = ?', [record.id]);
    for (const tag of tags) await tx.insertIgnore('file_tags', { file_id: record.id, tag });
  });
  return tags;
}

async function addTags(record, list) {
  const current = (await tagsByFile([record.id])).get(Number(record.id)) || [];
  return setTags(record, [...current, ...normalizeTags(list)]);
}

async function removeTags(record, list) {
  const drop = normalizeTags(list);
  const current = (await tagsByFile([record.id])).get(Number(record.id)) || [];
  return setTags(
    record,
    current.filter((tag) => !drop.includes(tag))
  );
}

async function tagsFor(username) {
  const rows = await db.all(
    'SELECT t.tag, COUNT(*) AS files FROM file_tags t JOIN file_data f ON f.id = t.file_id WHERE f.username = ? AND f.deleted_at IS NULL GROUP BY t.tag ORDER BY COUNT(*) DESC, t.tag',
    [username]
  );
  return rows.map((row) => ({ tag: row.tag, files: Number(row.files) }));
}

function typeSums() {
  const parts = MEDIA_TYPES.map((type) => ({ type, ...matchesAny(formatsOf(type)) }));
  return {
    sql: parts
      .map(
        ({ type, sql }) =>
          `SUM(CASE WHEN ${sql} THEN 1 ELSE 0 END) AS count_${type}, SUM(CASE WHEN ${sql} THEN size_bytes ELSE 0 END) AS bytes_${type}`
      )
      .join(', '),
    params: parts.flatMap(({ params }) => [...params, ...params]),
  };
}

async function summary(username = null) {
  const sums = typeSums();
  const text = typeFilter('text');
  const row = await db.get(
    `SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes, COALESCE(SUM(views), 0) AS views, ${sums.sql},
            SUM(CASE WHEN ${text.sql} THEN 1 ELSE 0 END) AS count_text
     FROM file_data WHERE ${LIVE}${username ? ' AND username = ?' : ''}`,
    [...sums.params, ...text.params, ...(username ? [username] : [])]
  );
  const count = (type) => Number(row[`count_${type}`]) || 0;
  const bytes = (type) => Number(row[`bytes_${type}`]) || 0;
  const total = Number(row.bytes) || 0;
  return {
    files: Number(row.files) || 0,
    storageBytes: total,
    views: Number(row.views) || 0,
    images: count('image'),
    videos: count('video'),
    audio: count('audio'),
    texts: count('text'),
    storageBreakdown: {
      images: bytes('image'),
      videos: bytes('video'),
      audio: bytes('audio'),
      other: Math.max(0, total - bytes('image') - bytes('video') - bytes('audio')),
    },
  };
}

const userStats = (username) =>
  cache.remember(`stats:user:${username}`, 30000, async () => {
    const latest = await db.get(`SELECT creation_date FROM file_data WHERE username = ? AND ${LIVE} ORDER BY id DESC LIMIT 1`, [username]);
    return { ...(await summary(username)), latestUpload: latest ? latest.creation_date : null, trash: await trashSummary(username) };
  });

const globalStats = () =>
  cache.remember('stats:global', 30000, async () => ({
    ...(await summary()),
    users: await db.count('SELECT COUNT(*) FROM users'),
  }));

module.exports = {
  MEDIA_TYPES,
  TEXT_SYNTAX,
  LIVE,
  typeOf,
  syntaxOf,
  urlsFor,
  pickDomain,
  resolveDomain,
  origins,
  originsFor,
  toFile,
  withTags,
  listForUser,
  listAll,
  listListed,
  findByFilename,
  findById,
  findBySlug,
  findOwned,
  slugTaken,
  namesFor,
  insert,
  update,
  patch,
  remove,
  discard,
  restore,
  emptyTrash,
  purgeTrash,
  trashSummary,
  trashEnabled,
  removeRecord,
  removeAllForUser,
  removeExpired,
  incrementViews,
  consumeView,
  normalizeTags,
  setTags,
  addTags,
  removeTags,
  tagsFor,
  userStats,
  globalStats,
};
