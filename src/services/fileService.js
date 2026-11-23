'use strict';

const fs = require('fs');
const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const { badRequest, notFound } = require('../lib/errors');
const { durationOf } = require('../lib/expiry');
const { berlinDate, berlinDay } = require('../lib/format');
const { displayPath } = require('../lib/slugs');
const { extensionOf, baseNameOf, userDirs, isSafeFilename, filePaths } = require('../lib/storage');
const similarity = require('../lib/similarity');
const settings = require('./settingsService');
const storage = require('./storageService');
const domains = require('./domainService');
const paths = require('./pathService');

const fsp = fs.promises;

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
  '.tsv': 'plaintext',
};

const SORTS = {
  newest: 'id DESC',
  oldest: 'id ASC',
  name: 'lower(filename) ASC, id ASC',
  size: 'size_bytes DESC, id DESC',
  views: 'views DESC, id DESC',
  reactions: "COALESCE((SELECT SUM(r.count) FROM reactions r WHERE r.kind = 'f' AND r.ref_id = file_data.id), 0) DESC, id DESC",
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

const ROOT_TAKEN = new Set([
  'report',
  'impressum',
  'datenschutz',
  'healthz',
  'favicon.svg',
  'favicon.ico',
  'robots.txt',
  'sw.js',
  'manifest.webmanifest',
]);

const rootable = (slug) => !ROOT_TAKEN.has(String(slug).toLowerCase()) && !paths.isReserved(slug) && !String(slug).startsWith('.');

function ownDomain(record, host) {
  if (!host) return false;
  try {
    const entry = domains.ownerOfHost(new URL(host).hostname);
    return Boolean(entry && entry.username === record.username);
  } catch {
    return false;
  }
}

function viewPathOf(record, host = null) {
  const slug = record.slug || record.filename;
  if (ownDomain(record, host) && rootable(slug)) return `/${displayPath(slug)}`;
  const personal = paths.currentFor(record.username);
  return personal ? `/${personal}/${displayPath(slug)}` : `/view/${displayPath(slug)}`;
}

function urlsFor(record, { domain = null } = {}) {
  const base = settings.get('site.baseUrl');
  const host = hostFor(record, domain);
  const { type } = typeOf(record.filename, record.syntax);
  const preview = type === 'video' ? `${baseNameOf(record.filename)}.jpg` : record.filename;
  const slug = record.slug || record.filename;
  const web = type === 'video' && storage.hasVariant(record, 'web');
  return {
    view: `${host}${viewPathOf(record, host)}`,
    direct: `${host}/uploads/${record.username}/${record.filename}`,
    playback: web ? `${host}/uploads/${record.username}/web/${baseNameOf(record.filename)}.mp4` : null,
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
  description: row.description || null,
  alt: row.alt_text || null,
  starred: Boolean(row.starred_at),
  publishAt: row.publish_at && Number(row.publish_at) > Date.now() ? Number(row.publish_at) : null,
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
  warning: row.warning === null || row.warning === undefined ? null : String(row.warning),
  version: Number(row.version) || 1,
  versionAt: row.version_at ? Number(row.version_at) : row.created_at ? Number(row.created_at) : null,
  scan: row.scan_status || null,
  deduped: Boolean(Number(row.deduped)),
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

async function versionCounts(ids) {
  if (!ids.length) return new Map();
  const rows = await db.all(
    `SELECT file_id, COUNT(*) AS versions FROM file_versions WHERE file_id IN (${ids.map(() => '?').join(', ')}) GROUP BY file_id`,
    ids
  );
  return new Map(rows.map((row) => [Number(row.file_id), Number(row.versions)]));
}

async function twinCounts(rows) {
  const hashed = rows.filter((row) => row.sha256 && !row.deleted_at);
  const result = new Map();
  for (const username of [...new Set(hashed.map((row) => row.username))]) {
    const hashes = [...new Set(hashed.filter((row) => row.username === username).map((row) => row.sha256))];
    const counts = await db.all(
      `SELECT sha256, COUNT(*) AS files FROM file_data WHERE username = ? AND ${LIVE} AND sha256 IN (${hashes.map(() => '?').join(', ')}) GROUP BY sha256`,
      [username, ...hashes]
    );
    for (const row of counts) result.set(`${username}/${row.sha256}`, Number(row.files));
  }
  return result;
}

async function reactionCounts(ids) {
  const wanted = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!wanted.length) return new Map();
  const rows = await db.all(
    `SELECT ref_id, SUM(count) AS total FROM reactions WHERE kind = 'f' AND ref_id IN (${wanted.map(() => '?').join(', ')}) GROUP BY ref_id`,
    wanted
  );
  return new Map(rows.map((row) => [Number(row.ref_id), Number(row.total) || 0]));
}

async function withTags(rows, { domain = null, matches = null } = {}) {
  const ids = rows.map((row) => row.id);
  const [tags, versions, twins, reacted] = await Promise.all([tagsByFile(ids), versionCounts(ids), twinCounts(rows), reactionCounts(ids)]);
  return rows.map((row) => {
    const file = toFile(row, tags.get(Number(row.id)) || [], domain);
    file.versions = versions.get(Number(row.id)) || 0;
    file.reactions = reacted.get(Number(row.id)) || 0;
    file.twins = row.sha256 ? Math.max(0, (twins.get(`${row.username}/${row.sha256}`) || 1) - 1) : 0;
    if (matches && matches.has(Number(row.id))) file.match = matches.get(Number(row.id));
    return file;
  });
}

async function paginate({ conditions, params, order, page, limit, maxLimit, from = 'file_data', domain = null, decorate = null }) {
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
  const matches = decorate ? await decorate(rows) : null;
  return { files: await withTags(rows, { domain, matches }), total, page: current, pages, limit: size, hasNext: current < pages };
}

function searchCondition(search, { content = false } = {}) {
  const term = `%${db.escapeLike(String(search).toLowerCase())}%`;
  const names = [
    "lower(filename) LIKE ? ESCAPE '!'",
    "lower(slug) LIKE ? ESCAPE '!'",
    "lower(title) LIKE ? ESCAPE '!'",
    "lower(original_name) LIKE ? ESCAPE '!'",
    "lower(description) LIKE ? ESCAPE '!'",
    "lower(alt_text) LIKE ? ESCAPE '!'",
  ];
  const params = names.map(() => term);
  if (!content) return { sql: `(${names.join(' OR ')})`, params };
  return {
    sql: `(${names.join(' OR ')} OR EXISTS (SELECT 1 FROM file_search s WHERE s.file_id = file_data.id AND s.folded LIKE ? ESCAPE '!'))`,
    params: [...params, term],
  };
}

let contentSearch = null;
const useContentSearch = (provider) => {
  contentSearch = provider;
};

function listForUser(
  username,
  {
    page = 1,
    limit = 24,
    search = '',
    type = '',
    sort = 'newest',
    tag = '',
    album = null,
    trash = false,
    starred = false,
    scheduled = false,
    missingAlt = false,
    color = '',
    from = null,
    to = null,
    domain = null,
  } = {}
) {
  const conditions = ['file_data.username = ?', trash ? 'file_data.deleted_at IS NOT NULL' : 'file_data.deleted_at IS NULL'];
  const params = [username];
  if (color && similarity.FAMILIES.includes(color)) {
    conditions.push('file_data.color_family = ?');
    params.push(color);
  }
  if (Number.isSafeInteger(from) && from > 0) {
    conditions.push('file_data.created_at >= ?');
    params.push(from);
  }
  if (Number.isSafeInteger(to) && to > 0) {
    conditions.push('file_data.created_at < ?');
    params.push(to);
  }
  if (starred) conditions.push('file_data.starred_at IS NOT NULL');
  if (scheduled) {
    conditions.push('file_data.publish_at > ?');
    params.push(Date.now());
  }
  if (missingAlt) {
    const visual = matchesAny([...formatsOf('image'), ...formatsOf('video')]);
    conditions.push(`(file_data.alt_text IS NULL OR file_data.alt_text = '')`, visual.sql);
    params.push(...visual.params);
  }
  const content = Boolean(search && contentSearch && contentSearch.enabled());
  if (search) {
    const condition = searchCondition(search, { content });
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
  const decorate = content
    ? (rows) =>
        contentSearch.snippets(
          rows.filter((row) => typeOf(row.filename, row.syntax).type === 'text').map((row) => Number(row.id)),
          search
        )
    : null;
  return paginate({ conditions, params, order, page, limit, maxLimit: 100, domain, decorate });
}

const CLEANUP_KINDS = ['large', 'unseen', 'stale', 'similar'];
const SIMILAR_THRESHOLD = 6;
const SIMILAR_LIMIT = 5000;
const SIMILAR_GROUPS = 60;

async function similarGroups(username, { domain = null } = {}) {
  const rows = await db.all(
    `SELECT * FROM file_data WHERE username = ? AND ${LIVE} AND phash IS NOT NULL AND phash <> '' ORDER BY id DESC LIMIT ${SIMILAR_LIMIT}`,
    [username]
  );
  const found = similarity
    .groups(
      rows.map((row) => ({ hash: row.phash, row })),
      { threshold: SIMILAR_THRESHOLD }
    )
    .map((list) => list.map((item) => item.row).sort((a, b) => Number(a.id) - Number(b.id)))
    .sort((a, b) => b.length - a.length || Number(b[b.length - 1].id) - Number(a[a.length - 1].id))
    .slice(0, SIMILAR_GROUPS);
  const flat = found.flat();
  const decorated = await withTags(flat, { domain });
  const byId = new Map(decorated.map((file) => [file.id, file]));
  const files = [];
  found.forEach((list, index) => {
    for (const row of list) {
      const file = byId.get(Number(row.id));
      if (file) files.push({ ...file, group: index + 1 });
    }
  });
  return {
    files,
    total: files.length,
    page: 1,
    pages: 1,
    limit: files.length,
    hasNext: false,
    groups: found.length,
    summary: { count: files.length, bytes: flat.reduce((sum, row) => sum + (Number(row.size_bytes) || 0), 0) },
  };
}

const QUARTER_HOUR = 15 * 60 * 1000;
const ZONE_MARGIN_MS = 14 * 60 * 60 * 1000;

function timeZoneOf(value) {
  if (typeof value !== 'string' || !value || value.length > 64) return null;
  try {
    return Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function dayReader({ timeZone, shift }) {
  if (!timeZone) return (ms) => new Date(ms + shift).toISOString().slice(0, 10);
  const format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const seen = new Map();
  return (ms) => {
    const key = Math.floor(ms / QUARTER_HOUR);
    let day = seen.get(key);
    if (!day) {
      const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
      day = `${parts.year}-${parts.month}-${parts.day}`;
      seen.set(key, day);
    }
    return day;
  };
}

async function calendar(username, { year = new Date().getFullYear(), offsetMinutes = 0, timeZone = null } = {}) {
  const target = Number.isInteger(year) && year > 1990 && year < 3000 ? year : new Date().getFullYear();
  const zone = timeZoneOf(timeZone);
  const shift = zone ? 0 : Math.max(-14 * 60, Math.min(14 * 60, Number(offsetMinutes) || 0)) * 60 * 1000;
  const dayOf = dayReader({ timeZone: zone, shift });
  const margin = zone ? ZONE_MARGIN_MS : 0;
  const rows = await db.all(
    `SELECT created_at, size_bytes FROM file_data WHERE username = ? AND ${LIVE} AND created_at >= ? AND created_at < ?`,
    [username, Date.UTC(target, 0, 1) - shift - margin, Date.UTC(target + 1, 0, 1) - shift + margin]
  );
  const prefix = `${target}-`;
  const days = {};
  let total = 0;
  let bytes = 0;
  for (const row of rows) {
    const day = dayOf(Number(row.created_at));
    if (!day.startsWith(prefix)) continue;
    days[day] = (days[day] || 0) + 1;
    total += 1;
    bytes += Number(row.size_bytes) || 0;
  }
  const range = await db.get(`SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM file_data WHERE username = ? AND ${LIVE}`, [
    username,
  ]);
  const yearOf = (ms) => Number(dayOf(Number(ms)).slice(0, 4));
  const firstYear = range && range.first ? yearOf(range.first) : target;
  const lastYear = range && range.last ? yearOf(range.last) : target;
  const years = [];
  for (let value = Math.max(lastYear, target); value >= Math.min(firstYear, target); value -= 1) years.push(value);
  const counts = Object.values(days);
  return {
    year: target,
    timeZone: zone,
    days,
    total,
    bytes,
    max: counts.length ? Math.max(...counts) : 0,
    activeDays: counts.length,
    years: years.slice(0, 30),
  };
}

async function backfillFingerprints({ limit = 30 } = {}) {
  const image = typeFilter('image');
  const rows = await db.all(
    `SELECT * FROM file_data WHERE phash IS NULL AND deleted_at IS NULL AND ${image.sql} ORDER BY id DESC LIMIT ?`,
    [...image.params, limit]
  );
  let done = 0;
  for (const row of rows) {
    let hash = '';
    try {
      const where = filePaths(row.username, row.filename);
      if (fs.existsSync(where.preview)) hash = await similarity.differenceHash(where.preview);
      else if (fs.existsSync(where.file)) hash = await similarity.differenceHash(where.file);
      else if (row.storage === 's3' && Number(row.size_bytes) <= 40 * 1024 * 1024) {
        const relative = `${row.username}/${storage.hasVariant(row, 'preview') ? 'preview/' : ''}${row.filename}`;
        hash = await similarity.differenceHash(await storage.readRemote(relative));
      }
    } catch {
      hash = '';
    }
    await db.run('UPDATE file_data SET phash = ? WHERE id = ? AND phash IS NULL', [hash, row.id]);
    done += 1;
  }
  const visual = matchesAny([...formatsOf('image'), ...formatsOf('video')]);
  const colors = await db.all(
    `SELECT id, dominant_color FROM file_data WHERE color_family IS NULL AND resolution_width > 0 AND ${visual.sql} ORDER BY id DESC LIMIT 500`,
    visual.params
  );
  if (colors.length && settings.get('uploads.dominantColor')) {
    for (const row of colors) {
      await db.run('UPDATE file_data SET color_family = ? WHERE id = ? AND color_family IS NULL', [
        similarity.familyOf(row.dominant_color),
        row.id,
      ]);
    }
  }
  if (done || colors.length) cache.clear();
  return { fingerprints: done, colors: settings.get('uploads.dominantColor') ? colors.length : 0 };
}

const UNSEEN_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;
const ACTIVITY =
  "SELECT 1 FROM stats_daily s WHERE s.kind = 'f' AND s.ref_id = file_data.id AND (s.views > 0 OR s.downloads > 0 OR s.direct > 0)";

async function cleanupFor(username, { kind = 'large', page = 1, limit = 50, domain = null, now = Date.now() } = {}) {
  if (kind === 'similar') return similarGroups(username, { domain });
  const conditions = ['file_data.username = ?', 'file_data.deleted_at IS NULL', 'file_data.starred_at IS NULL'];
  const params = [username];
  let order = SORTS.size;
  if (kind === 'unseen') {
    conditions.push('file_data.views = 0', 'file_data.created_at < ?', `NOT EXISTS (${ACTIVITY})`);
    params.push(now - UNSEEN_AFTER_MS);
  } else if (kind === 'stale') {
    conditions.push('file_data.created_at < ?', `NOT EXISTS (${ACTIVITY} AND s.day >= ?)`);
    params.push(now - STALE_AFTER_MS, berlinDay(new Date(now - STALE_AFTER_MS)));
    order = 'created_at ASC, id ASC';
  }
  const where = conditions.join(' AND ');
  const summary = await db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM file_data WHERE ${where}`, params);
  const list = await paginate({ conditions, params, order, page, limit, maxLimit: 100, domain });
  return { ...list, summary: { count: Number(summary.count) || 0, bytes: Number(summary.bytes) || 0 } };
}

const MEMORY_YEARS = 10;
const DAY = 24 * 60 * 60 * 1000;

async function memoriesFor(username, { now = new Date(), domain = null, limit = 12 } = {}) {
  const [year, month, day] = berlinDay(now).split('-').map(Number);
  const targets = new Map();
  const ranges = [];
  for (let back = 1; back <= MEMORY_YEARS; back += 1) {
    const middle = Date.UTC(year - back, month - 1, day, 12);
    const target = berlinDay(new Date(middle));
    if (target.slice(5) !== berlinDay(now).slice(5)) continue;
    targets.set(target, back);
    ranges.push(middle - DAY, middle + DAY);
  }
  if (!ranges.length) return [];
  const windows = [];
  for (let index = 0; index < ranges.length; index += 2) windows.push('(created_at >= ? AND created_at < ?)');
  const rows = await db.all(
    `SELECT * FROM file_data WHERE username = ? AND ${LIVE} AND blocked_at IS NULL AND (${windows.join(' OR ')}) ORDER BY created_at DESC LIMIT 400`,
    [username, ...ranges]
  );
  const picked = rows.filter((row) => targets.has(berlinDay(new Date(Number(row.created_at))))).slice(0, limit);
  const decorated = await withTags(picked, { domain });
  const groups = new Map();
  for (const file of decorated) {
    const years = targets.get(berlinDay(new Date(file.createdAt)));
    if (!groups.has(years)) groups.set(years, []);
    groups.get(years).push(file);
  }
  return [...groups].sort((a, b) => a[0] - b[0]).map(([years, list]) => ({ years, files: list }));
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
      '(publish_at IS NULL OR publish_at <= ?)',
    ],
    params: [username, now, now],
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

const slugTaken = async (slug) =>
  Boolean(
    (await db.get('SELECT id FROM file_data WHERE slug = ? OR filename = ?', [slug, slug])) ||
    (await db.get('SELECT path FROM redirects WHERE path = ?', [`/view/${slug}`]))
  );

const find = (username, filename) =>
  db.get(`SELECT * FROM file_data WHERE username = ? AND filename = ? AND ${LIVE}`, [username, filename]);

async function findOwned(username, key, { deleted = false } = {}) {
  const byId = /^\d+$/.test(String(key)) ? await findById(key) : null;
  const record = byId || (await findBySlug(String(key)));
  if (!record || record.username !== username) return null;
  if (Boolean(record.deleted_at) !== deleted) return null;
  return record;
}

const MAX_DESCRIPTION = 2000;
const MAX_ALT = 500;

function cleanDescription(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_DESCRIPTION);
  return text || null;
}

function cleanAlt(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_ALT);
  return text || null;
}

const MAX_SCHEDULE_MS = 366 * 24 * 60 * 60 * 1000;

function publishTime(value, now = Date.now()) {
  if (value === undefined || value === null || value === '') return null;
  let at = NaN;
  if (typeof value === 'number') at = value;
  else {
    const raw = String(value).trim();
    const relative = /^\+?\d{1,4}\s*(?:min|m|h|d|w)$/i.test(raw) ? durationOf(raw.replace(/^\+/, '')) : NaN;
    if (Number.isFinite(relative)) at = now + relative;
    else if (/^\d{12,14}$/.test(raw)) at = Number(raw);
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) at = Date.parse(raw);
  }
  if (!Number.isFinite(at)) throw badRequest('Ungültiger Zeitpunkt für die Veröffentlichung.', { field: 'publishAt' });
  if (at <= now) throw badRequest('Der Zeitpunkt für die Veröffentlichung liegt in der Vergangenheit.', { field: 'publishAt' });
  if (at > now + MAX_SCHEDULE_MS) throw badRequest('Höchstens ein Jahr im Voraus.', { field: 'publishAt' });
  return Math.round(at);
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
  description = null,
  altText = null,
  publishAt = null,
  syntax = null,
  sha256 = null,
  deduped = false,
  warning = null,
  scanStatus = null,
  version = 1,
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
    description: cleanDescription(description),
    alt_text: cleanAlt(altText),
    publish_at: publishAt,
    syntax,
    sha256,
    deduped: deduped ? 1 : 0,
    warning: warning === null || warning === undefined ? null : String(warning).slice(0, 100),
    scan_status: scanStatus,
    version,
    version_at: createdAt.getTime(),
  });
  cache.clear();
  return findById(id);
}

async function update(username, filename, { dominantColor, width, height, phash, colorFamily }) {
  const fields = { dominant_color: dominantColor, resolution_width: width, resolution_height: height };
  if (phash !== undefined) fields.phash = phash;
  if (colorFamily !== undefined) fields.color_family = colorFamily;
  const columns = Object.keys(fields);
  await db.run(`UPDATE file_data SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE username = ? AND filename = ?`, [
    ...columns.map((column) => fields[column]),
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

const versionRows = (fileId) => db.all('SELECT * FROM file_versions WHERE file_id = ? ORDER BY version DESC', [fileId]);

const versionRecord = (record, version) => ({
  id: null,
  username: record.username,
  filename: version.filename,
  storage: version.storage,
  variants: version.variants,
});

async function forget(record) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM album_files WHERE file_id = ?', [record.id]);
    await tx.run('DELETE FROM file_tags WHERE file_id = ?', [record.id]);
    await tx.run("DELETE FROM reactions WHERE kind = 'f' AND ref_id = ?", [record.id]);
    await tx.run("DELETE FROM reaction_notices WHERE kind = 'f' AND ref_id = ?", [record.id]);
    await tx.run('DELETE FROM file_versions WHERE file_id = ?', [record.id]);
    await tx.run('DELETE FROM file_search WHERE file_id = ?', [record.id]);
    await tx.run("DELETE FROM redirects WHERE kind = 'file' AND target_id = ?", [record.id]);
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

async function adoptTwin(record) {
  if (!record.sha256 || Number(record.deduped)) return;
  const primaries = await db.count('SELECT COUNT(*) FROM file_data WHERE username = ? AND sha256 = ? AND deduped = 0', [
    record.username,
    record.sha256,
  ]);
  if (primaries > 0) return;
  const heir = await db.get('SELECT id FROM file_data WHERE username = ? AND sha256 = ? AND deduped = 1 ORDER BY id LIMIT 1', [
    record.username,
    record.sha256,
  ]);
  if (heir) await db.run('UPDATE file_data SET deduped = 0 WHERE id = ?', [heir.id]);
}

async function removeRecord(record, reason = 'deleted') {
  const versions = await versionRows(record.id);
  await storage.removeArtifacts(record);
  for (const version of versions) {
    await storage
      .removeArtifacts(versionRecord(record, version))
      .catch((error) => log.warn('Eine ältere Version ließ sich nicht löschen', { file: version.filename, error }));
  }
  await forget(record);
  await adoptTwin(record);
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
  const [row, versions] = await Promise.all([
    db.get(
      'SELECT COUNT(*) AS files, COALESCE(SUM(CASE WHEN deduped = 1 THEN 0 ELSE size_bytes END), 0) AS bytes FROM file_data WHERE username = ? AND deleted_at IS NOT NULL',
      [username]
    ),
    db.count(
      'SELECT COALESCE(SUM(v.size_bytes), 0) FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE f.username = ? AND f.deleted_at IS NOT NULL',
      [username]
    ),
  ]);
  return {
    files: Number(row.files) || 0,
    bytes: (Number(row.bytes) || 0) + versions,
    days: settings.get('trash.days'),
    enabled: trashEnabled(),
  };
}

async function removeAllForUser(username) {
  const rows = await db.all("SELECT * FROM file_data WHERE username = ? AND storage = 's3'", [username]);
  for (const row of rows)
    await storage.removeArtifacts(row).catch((error) => log.warn('S3-Datei blieb liegen', { file: row.filename, error }));
  const remote = await db.all(
    "SELECT v.*, f.username FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE f.username = ? AND v.storage = 's3'",
    [username]
  );
  for (const version of remote) {
    await storage
      .removeArtifacts(versionRecord(version, version))
      .catch((error) => log.warn('S3-Datei blieb liegen', { file: version.filename, error }));
  }
  await db.transaction(async (tx) => {
    const own = 'SELECT id FROM file_data WHERE username = ?';
    await tx.run(`DELETE FROM album_files WHERE file_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM file_tags WHERE file_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM reactions WHERE kind = 'f' AND ref_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM file_versions WHERE file_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM file_search WHERE file_id IN (${own})`, [username]);
    await tx.run(`DELETE FROM redirects WHERE kind = 'file' AND target_id IN (${own})`, [username]);
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

async function retagRules(username, from, to) {
  const user = await db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (!user) return;
  const albums = await db.all('SELECT id, rule FROM albums WHERE user_id = ? AND rule IS NOT NULL', [user.id]);
  for (const album of albums) {
    let rule;
    try {
      rule = JSON.parse(album.rule);
    } catch {
      continue;
    }
    if (!rule || rule.tag !== from) continue;
    rule.tag = to;
    await db.run('UPDATE albums SET rule = ?, updated_at = ? WHERE id = ?', [JSON.stringify(rule), Date.now(), album.id]);
  }
  await db.run('UPDATE auto_shares SET tag = ? WHERE user_id = ? AND tag = ?', [to, user.id, from]);
}

async function renameTag(username, from, to) {
  const source = normalizeTag(from);
  const target = normalizeTag(to);
  if (!source) throw notFound('Diesen Tag gibt es nicht.');
  if (!target) throw badRequest('Ungültiger Tag.', { field: 'name' });
  const own = 'SELECT id FROM file_data WHERE username = ?';
  const affected = await db.count(`SELECT COUNT(*) FROM file_tags WHERE tag = ? AND file_id IN (${own})`, [source, username]);
  if (!affected) throw notFound('Diesen Tag gibt es nicht.');
  if (source === target) return { tag: target, files: affected, merged: false };
  const existing = await db.count(`SELECT COUNT(*) FROM file_tags WHERE tag = ? AND file_id IN (${own})`, [target, username]);
  await db.transaction(async (tx) => {
    await tx.run(
      `DELETE FROM file_tags WHERE tag = ? AND file_id IN (${own}) AND file_id IN (SELECT file_id FROM file_tags WHERE tag = ?)`,
      [source, username, target]
    );
    await tx.run(`UPDATE file_tags SET tag = ? WHERE tag = ? AND file_id IN (${own})`, [target, source, username]);
  });
  await retagRules(username, source, target);
  cache.clear();
  return {
    tag: target,
    files: await db.count(`SELECT COUNT(*) FROM file_tags WHERE tag = ? AND file_id IN (${own})`, [target, username]),
    merged: existing > 0,
  };
}

async function deleteTag(username, tag) {
  const source = normalizeTag(tag);
  if (!source) throw notFound('Diesen Tag gibt es nicht.');
  const result = await db.run('DELETE FROM file_tags WHERE tag = ? AND file_id IN (SELECT id FROM file_data WHERE username = ?)', [
    source,
    username,
  ]);
  if (!result.changes) throw notFound('Diesen Tag gibt es nicht.');
  cache.clear();
  return result.changes;
}

const STORED = '(CASE WHEN deduped = 1 THEN 0 ELSE size_bytes END)';

function typeSums() {
  const parts = MEDIA_TYPES.map((type) => ({ type, ...matchesAny(formatsOf(type)) }));
  return {
    sql: parts
      .map(
        ({ type, sql }) =>
          `SUM(CASE WHEN ${sql} THEN 1 ELSE 0 END) AS count_${type}, SUM(CASE WHEN ${sql} THEN ${STORED} ELSE 0 END) AS bytes_${type}`
      )
      .join(', '),
    params: parts.flatMap(({ params }) => [...params, ...params]),
  };
}

async function summary(username = null) {
  const sums = typeSums();
  const text = typeFilter('text');
  const [row, versions] = await Promise.all([
    db.get(
      `SELECT COUNT(*) AS files, COALESCE(SUM(${STORED}), 0) AS bytes, COALESCE(SUM(views), 0) AS views, ${sums.sql},
              SUM(CASE WHEN ${text.sql} THEN 1 ELSE 0 END) AS count_text,
              COALESCE(SUM(CASE WHEN deduped = 1 THEN size_bytes ELSE 0 END), 0) AS saved
       FROM file_data WHERE ${LIVE}${username ? ' AND username = ?' : ''}`,
      [...sums.params, ...text.params, ...(username ? [username] : [])]
    ),
    db.count(
      `SELECT COALESCE(SUM(v.size_bytes), 0) FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE f.deleted_at IS NULL${username ? ' AND f.username = ?' : ''}`,
      username ? [username] : []
    ),
  ]);
  const count = (type) => Number(row[`count_${type}`]) || 0;
  const bytes = (type) => Number(row[`bytes_${type}`]) || 0;
  const total = Number(row.bytes) || 0;
  return {
    files: Number(row.files) || 0,
    storageBytes: total + versions,
    views: Number(row.views) || 0,
    images: count('image'),
    videos: count('video'),
    audio: count('audio'),
    texts: count('text'),
    savedBytes: Number(row.saved) || 0,
    storageBreakdown: {
      images: bytes('image'),
      videos: bytes('video'),
      audio: bytes('audio'),
      other: Math.max(0, total - bytes('image') - bytes('video') - bytes('audio')),
      versions,
    },
  };
}

async function duplicates(username) {
  const rows = await db.all(
    `SELECT * FROM file_data WHERE username = ? AND ${LIVE} AND sha256 IN (
       SELECT sha256 FROM file_data WHERE username = ? AND ${LIVE} AND sha256 IS NOT NULL AND sha256 <> '' GROUP BY sha256 HAVING COUNT(*) > 1
     ) ORDER BY sha256, id`,
    [username, username]
  );
  const items = await withTags(rows);
  const groups = new Map();
  for (const [index, row] of rows.entries()) {
    const group = groups.get(row.sha256) || { sha256: row.sha256, sizeBytes: Number(row.size_bytes) || 0, files: [] };
    group.files.push(items[index]);
    groups.set(row.sha256, group);
  }
  const list = [...groups.values()].map((group) => ({
    ...group,
    redundantBytes: group.sizeBytes * (group.files.length - 1),
    savedBytes: group.sizeBytes * group.files.filter((file) => file.deduped).length,
  }));
  return {
    groups: list,
    files: list.reduce((sum, group) => sum + group.files.length - 1, 0),
    redundantBytes: list.reduce((sum, group) => sum + group.redundantBytes, 0),
    savedBytes: list.reduce((sum, group) => sum + group.savedBytes, 0),
  };
}

const duplicateCount = (username) =>
  db.count(
    `SELECT COALESCE(SUM(x.n - 1), 0) FROM (SELECT COUNT(*) AS n FROM file_data WHERE username = ? AND ${LIVE} AND sha256 IS NOT NULL AND sha256 <> '' GROUP BY sha256 HAVING COUNT(*) > 1) x`,
    [username]
  );

const userStats = (username) =>
  cache.remember(`stats:user:${username}`, 30000, async () => {
    const latest = await db.get(`SELECT creation_date FROM file_data WHERE username = ? AND ${LIVE} ORDER BY id DESC LIMIT 1`, [username]);
    return {
      ...(await summary(username)),
      latestUpload: latest ? latest.creation_date : null,
      trash: await trashSummary(username),
      duplicates: await duplicateCount(username),
      starred: await db.count(`SELECT COUNT(*) FROM file_data WHERE username = ? AND ${LIVE} AND starred_at IS NOT NULL`, [username]),
      scheduled: await db.count(`SELECT COUNT(*) FROM file_data WHERE username = ? AND ${LIVE} AND publish_at > ?`, [username, Date.now()]),
      missingAlt: await missingAltCount(username),
    };
  });

function missingAltCount(username) {
  const visual = matchesAny([...formatsOf('image'), ...formatsOf('video')]);
  return db.count(
    `SELECT COUNT(*) FROM file_data WHERE username = ? AND ${LIVE} AND (alt_text IS NULL OR alt_text = '') AND ${visual.sql}`,
    [username, ...visual.params]
  );
}

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
  typeFilter,
  typeFilter,
  useContentSearch,
  versionRows,
  versionRecord,
  duplicates,
  adoptTwin,
  syntaxOf,
  urlsFor,
  viewPathOf,
  rootable,
  pickDomain,
  resolveDomain,
  origins,
  originsFor,
  toFile,
  withTags,
  listForUser,
  cleanupFor,
  memoriesFor,
  cleanDescription,
  cleanAlt,
  publishTime,
  MAX_DESCRIPTION,
  MAX_ALT,
  CLEANUP_KINDS,
  calendar,
  backfillFingerprints,
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
  normalizeTag,
  normalizeTags,
  setTags,
  addTags,
  removeTags,
  tagsFor,
  renameTag,
  deleteTag,
  userStats,
  globalStats,
};
