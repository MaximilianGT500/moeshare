'use strict';

const fs = require('fs');
const fsp = fs.promises;
const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const media = require('../lib/media');
const { notFound } = require('../lib/errors');
const { berlinDate } = require('../lib/format');
const { extensionOf, baseNameOf, filePaths, userDirs, isSafeFilename } = require('../lib/storage');
const settings = require('./settingsService');

const log = logger.scope('files');

const MEDIA_TYPES = ['image', 'video', 'audio'];

const SORTS = {
  newest: 'id DESC',
  oldest: 'id ASC',
  name: 'filename COLLATE NOCASE ASC',
  size: 'size_bytes DESC',
  views: 'views DESC, id DESC',
};

const formatsOf = (type) =>
  type === 'image' ? [...settings.get('uploads.formats.image'), '.gif'] : settings.get(`uploads.formats.${type}`);

function typeOf(filename) {
  const ext = extensionOf(filename);
  if (ext === '.gif') return { type: 'image', isGif: true };
  const type = MEDIA_TYPES.find((candidate) => formatsOf(candidate).includes(ext)) || 'file';
  return { type, isGif: false };
}

function matchesAny(extensions) {
  if (!extensions.length) return { sql: '0', params: [] };
  return { sql: `(${extensions.map(() => 'filename LIKE ?').join(' OR ')})`, params: extensions.map((ext) => `%${ext}`) };
}

function typeFilter(type) {
  if (MEDIA_TYPES.includes(type)) return matchesAny(formatsOf(type));
  if (type !== 'file') return null;
  const any = matchesAny(MEDIA_TYPES.flatMap(formatsOf));
  return { sql: `NOT ${any.sql}`, params: any.params };
}

const escapeLike = (term) => String(term).replace(/[\\%_]/g, (char) => `\\${char}`);

function urlsFor(username, filename) {
  const base = settings.get('site.baseUrl');
  const preview = typeOf(filename).type === 'video' ? `${baseNameOf(filename)}.jpg` : filename;
  return {
    view: `${base}/view/${filename}`,
    direct: `${base}/uploads/${username}/${filename}`,
    download: `${base}/download/${filename}`,
    preview: `${base}/uploads/${username}/preview/${preview}`,
    delete: `${base}/delete/${filename}`,
  };
}

const toFile = (row) => ({
  id: row.id,
  filename: row.filename,
  username: row.username,
  sizeBytes: row.size_bytes,
  date: row.creation_date,
  width: row.resolution_width,
  height: row.resolution_height,
  color: row.dominant_color,
  views: row.views || 0,
  ...typeOf(row.filename),
  urls: urlsFor(row.username, row.filename),
});

async function paginate({ conditions, params, order, page, limit, maxLimit }) {
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const size = Math.min(maxLimit, Math.max(1, Number.parseInt(limit, 10) || 24));
  const total = await db.count(`SELECT COUNT(*) FROM file_data ${where}`, params);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.max(1, Number.parseInt(page, 10) || 1);
  const rows = await db.all(`SELECT * FROM file_data ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, size, (current - 1) * size]);
  return { files: rows.map(toFile), total, page: current, pages, limit: size, hasNext: current < pages };
}

function listForUser(username, { page = 1, limit = 24, search = '', type = '', sort = 'newest' } = {}) {
  const conditions = ['username = ?'];
  const params = [username];
  if (search) {
    conditions.push("filename LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(search)}%`);
  }
  const filter = typeFilter(type);
  if (filter) {
    conditions.push(filter.sql);
    params.push(...filter.params);
  }
  return paginate({ conditions, params, order: SORTS[sort] || SORTS.newest, page, limit, maxLimit: 100 });
}

function listAll({ page = 1, limit = 50, search = '' } = {}) {
  const conditions = search ? ["filename LIKE ? ESCAPE '\\'"] : [];
  const params = search ? [`%${escapeLike(search)}%`] : [];
  return paginate({ conditions, params, order: SORTS.newest, page, limit, maxLimit: 200 });
}

const namesFor = (username) =>
  db.all('SELECT filename FROM file_data WHERE username = ? ORDER BY id DESC', [username]).then((rows) => rows.map((row) => row.filename));

const findByFilename = (filename) => db.get('SELECT * FROM file_data WHERE filename = ?', [filename]);

const find = (username, filename) => db.get('SELECT * FROM file_data WHERE username = ? AND filename = ?', [username, filename]);

async function insert({ username, filename, sizeBytes, createdAt = new Date() }) {
  await db.run(
    `INSERT INTO file_data (username, filename, creation_date, size_bytes, dominant_color, resolution_width, resolution_height)
     VALUES (?, ?, ?, ?, '#ffffff', 0, 0)`,
    [username, filename, berlinDate(createdAt), sizeBytes]
  );
  cache.clear();
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

async function remove(username, filename) {
  if (!isSafeFilename(filename)) throw notFound('Diese Datei gibt es nicht (mehr).');
  const paths = filePaths(username, filename);
  const record = await find(username, filename);
  if (!record && !fs.existsSync(paths.file)) throw notFound('Diese Datei gibt es nicht (mehr).');
  await Promise.all([paths.file, paths.preview, paths.poster].map((file) => fsp.rm(file, { force: true })));
  await media.removeHlsArtifacts(username, filename);
  await db.run('DELETE FROM file_data WHERE username = ? AND filename = ?', [username, filename]);
  cache.clear();
  log.info('Datei gelöscht', { user: username, file: filename });
}

async function removeAllForUser(username) {
  await db.run('DELETE FROM file_data WHERE username = ?', [username]);
  await fsp.rm(userDirs(username).root, { recursive: true, force: true });
  cache.clear();
}

const incrementViews = (filename) => db.run('UPDATE file_data SET views = views + 1 WHERE filename = ?', [filename]);

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
  const row = await db.get(
    `SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes, COALESCE(SUM(views), 0) AS views, ${sums.sql}
     FROM file_data ${username ? 'WHERE username = ?' : ''}`,
    [...sums.params, ...(username ? [username] : [])]
  );
  const count = (type) => row[`count_${type}`] || 0;
  const bytes = (type) => row[`bytes_${type}`] || 0;
  return {
    files: row.files,
    storageBytes: row.bytes,
    views: row.views,
    images: count('image'),
    videos: count('video'),
    audio: count('audio'),
    storageBreakdown: {
      images: bytes('image'),
      videos: bytes('video'),
      audio: bytes('audio'),
      other: Math.max(0, row.bytes - bytes('image') - bytes('video') - bytes('audio')),
    },
  };
}

const userStats = (username) =>
  cache.remember(`stats:user:${username}`, 30000, async () => {
    const latest = await db.get('SELECT creation_date FROM file_data WHERE username = ? ORDER BY id DESC LIMIT 1', [username]);
    return { ...(await summary(username)), latestUpload: latest ? latest.creation_date : null };
  });

const globalStats = () =>
  cache.remember('stats:global', 30000, async () => ({
    ...(await summary()),
    users: await db.count('SELECT COUNT(*) FROM users'),
  }));

module.exports = {
  typeOf,
  urlsFor,
  listForUser,
  listAll,
  findByFilename,
  namesFor,
  insert,
  update,
  remove,
  removeAllForUser,
  incrementViews,
  userStats,
  globalStats,
};
