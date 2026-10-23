'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const mime = require('mime-types');
const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const { S3Client } = require('../lib/s3');
const { filePaths, baseNameOf, isValidUsername } = require('../lib/storage');
const { removeHlsArtifacts } = require('../lib/media');
const settings = require('./settingsService');

const log = logger.scope('storage');

const LOCAL_GRACE_MS = 30 * 1000;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const HLS_PART = /^(\.m3u8|_?\d+\.ts)$/;

let client = null;
let clientKey = null;

const s3Options = (overrides = {}) => ({
  endpoint: settings.get('storage.s3.endpoint') || undefined,
  region: settings.get('storage.s3.region') || undefined,
  bucket: settings.get('storage.s3.bucket'),
  accessKeyId: settings.get('storage.s3.accessKeyId'),
  secretAccessKey: settings.get('storage.s3.secretAccessKey'),
  forcePathStyle: settings.get('storage.s3.pathStyle'),
  ...overrides,
});

const configured = () =>
  Boolean(settings.get('storage.s3.bucket') && settings.get('storage.s3.accessKeyId') && settings.get('storage.s3.secretAccessKey'));

function bucket() {
  const options = s3Options();
  const key = JSON.stringify(options);
  if (client && clientKey === key) return client;
  if (client) client.close();
  client = new S3Client(options);
  clientKey = key;
  return client;
}

const activeDriver = () => (settings.get('storage.driver') === 's3' && configured() ? 's3' : 'local');

function prefixed(relative, prefix = settings.get('storage.s3.prefix')) {
  const clean = String(prefix || '').replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/${relative}` : relative;
}

const contentTypeOf = (name) => {
  if (name.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (name.endsWith('.ts')) return 'video/mp2t';
  return mime.lookup(name) || 'application/octet-stream';
};

const variantsOf = (record) =>
  String(record.variants || '')
    .split(',')
    .filter(Boolean);

function localArtifacts(username, filename) {
  const paths = filePaths(username, filename);
  const base = baseNameOf(filename);
  const items = [{ kind: 'original', file: paths.file, relative: `${username}/${filename}` }];
  if (fs.existsSync(paths.preview)) items.push({ kind: 'preview', file: paths.preview, relative: `${username}/preview/${filename}` });
  if (paths.poster !== paths.preview && fs.existsSync(paths.poster)) {
    items.push({ kind: 'poster', file: paths.poster, relative: `${username}/preview/${path.basename(paths.poster)}` });
  }
  if (fs.existsSync(paths.hlsComplete)) {
    for (const entry of fs.readdirSync(paths.hlsDir)) {
      if (entry.startsWith(base) && HLS_PART.test(entry.slice(base.length))) {
        items.push({ kind: 'hls', file: path.join(paths.hlsDir, entry), relative: `${username}/m3u8/${entry}` });
      }
    }
  }
  return items;
}

async function removeLocal(username, filename) {
  const paths = filePaths(username, filename);
  await Promise.all([paths.file, paths.preview, paths.poster].map((file) => fsp.rm(file, { force: true })));
  await removeHlsArtifacts(username, filename);
}

async function upload(items, target = bucket(), prefix = settings.get('storage.s3.prefix')) {
  for (const item of items) {
    const { size } = await fsp.stat(item.file);
    const playlist = item.relative.endsWith('.m3u8');
    await target.put(prefixed(item.relative, prefix), fs.createReadStream(item.file), {
      contentType: contentTypeOf(item.relative),
      contentLength: size,
      cacheControl: playlist ? 'no-cache' : IMMUTABLE,
    });
  }
}

async function markStored(id, storage, variants) {
  await db.run(`UPDATE file_data SET storage = ?, variants = ?${storage === 's3' ? ', deduped = 0' : ''} WHERE id = ?`, [
    storage,
    variants || null,
    id,
  ]);
  cache.clear();
}

async function markVersion(id, storage, variants) {
  await db.run('UPDATE file_versions SET storage = ?, variants = ? WHERE id = ?', [storage, variants || null, id]);
}

const variantList = (items) => [...new Set(items.filter((item) => item.kind !== 'original').map((item) => item.kind))].join(',');

async function offloadVersions(record) {
  if (activeDriver() !== 's3') return 0;
  const rows = await db.all("SELECT * FROM file_versions WHERE file_id = ? AND storage <> 's3'", [record.id]);
  let moved = 0;
  for (const row of rows) {
    const items = localArtifacts(record.username, row.filename);
    if (!fs.existsSync(items[0].file)) continue;
    await upload(items);
    await markVersion(row.id, 's3', variantList(items));
    await removeLocal(record.username, row.filename);
    moved += 1;
  }
  return moved;
}

async function offload(record, { graceMs = LOCAL_GRACE_MS } = {}) {
  if (activeDriver() !== 's3' || record.storage === 's3') return false;
  const items = localArtifacts(record.username, record.filename);
  if (!fs.existsSync(items[0].file)) return false;
  await upload(items);
  const variants = [...new Set(items.filter((item) => item.kind !== 'original').map((item) => item.kind))].join(',');
  await markStored(record.id, 's3', variants);
  const purge = () =>
    removeLocal(record.username, record.filename).catch((error) =>
      log.warn('Lokale Kopie konnte nicht entfernt werden', { file: record.filename, error })
    );
  if (graceMs > 0) setTimeout(purge, graceMs).unref();
  else await purge();
  log.debug('Datei nach S3 verschoben', { user: record.username, file: record.filename, parts: items.length });
  return true;
}

function remoteKeys(record) {
  const base = baseNameOf(record.filename);
  const variants = variantsOf(record);
  const keys = [`${record.username}/${record.filename}`];
  if (variants.includes('preview')) keys.push(`${record.username}/preview/${record.filename}`);
  if (variants.includes('poster')) keys.push(`${record.username}/preview/${base}.jpg`);
  return keys;
}

async function remoteHls(record) {
  const base = baseNameOf(record.filename);
  const folder = prefixed(`${record.username}/m3u8/`);
  const keys = [];
  for await (const object of bucket().listAll(`${folder}${base}`)) {
    if (HLS_PART.test(object.key.slice(folder.length + base.length))) keys.push(object.key);
  }
  return keys;
}

async function removeArtifacts(record) {
  await removeLocal(record.username, record.filename);
  if (record.storage !== 's3' || !configured()) return;
  const target = bucket();
  const keys = remoteKeys(record).map((key) => prefixed(key));
  if (variantsOf(record).includes('hls')) keys.push(...(await remoteHls(record)));
  await Promise.all(keys.map((key) => target.remove(key)));
}

async function download(record, { mark = () => markStored(record.id, 'local', null) } = {}) {
  const target = bucket();
  const paths = filePaths(record.username, record.filename);
  const relatives = remoteKeys(record);
  const hls = variantsOf(record).includes('hls') ? await remoteHls(record) : [];
  const jobs = [
    ...relatives.map((relative) => ({ key: prefixed(relative), file: path.join(path.dirname(paths.root), relative) })),
    ...hls.map((key) => ({ key, file: path.join(paths.hlsDir, path.basename(key)) })),
  ];
  for (const job of jobs) {
    await fsp.mkdir(path.dirname(job.file), { recursive: true });
    const response = await target.get(job.key);
    const temporary = `${job.file}.${crypto.randomBytes(4).toString('hex')}.part`;
    await pipeline(response, fs.createWriteStream(temporary));
    await fsp.rename(temporary, job.file);
  }
  if (hls.length) await fsp.writeFile(paths.hlsComplete, '');
  await mark();
  await Promise.all(jobs.map((job) => target.remove(job.key)));
}

async function migrateVersions(to) {
  const rows = await db.all(
    'SELECT v.*, f.username FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE v.storage <> ? ORDER BY v.id',
    [to]
  );
  for (const row of rows) {
    try {
      if (to === 's3') {
        if (!isValidUsername(row.username) || !fs.existsSync(filePaths(row.username, row.filename).file)) continue;
        const items = localArtifacts(row.username, row.filename);
        await upload(items);
        await markVersion(row.id, 's3', variantList(items));
        await removeLocal(row.username, row.filename);
      } else {
        await download({ ...row, id: null }, { mark: () => markVersion(row.id, 'local', null) });
      }
    } catch (error) {
      log.warn('Eine ältere Version konnte nicht verschoben werden', { file: row.filename, to, error });
    }
  }
}

async function migrate(to, { onProgress = () => {} } = {}) {
  if (!['local', 's3'].includes(to)) throw new Error(`Unbekannter Speicherort: ${to}`);
  if (!configured()) throw new Error('S3 ist noch nicht eingerichtet.');
  await migrateVersions(to);
  const rows = await db.all('SELECT * FROM file_data WHERE storage <> ? ORDER BY id', [to]);
  const result = { total: rows.length, moved: 0, failed: 0, missing: 0 };
  for (const row of rows) {
    try {
      if (to === 's3') {
        if (!isValidUsername(row.username) || !fs.existsSync(filePaths(row.username, row.filename).file)) {
          result.missing += 1;
        } else {
          const items = localArtifacts(row.username, row.filename);
          await upload(items);
          const variants = [...new Set(items.filter((item) => item.kind !== 'original').map((item) => item.kind))].join(',');
          await markStored(row.id, 's3', variants);
          await removeLocal(row.username, row.filename);
          result.moved += 1;
        }
      } else {
        await download(row);
        result.moved += 1;
      }
    } catch (error) {
      result.failed += 1;
      log.warn('Datei konnte nicht verschoben werden', { file: row.filename, to, error });
    }
    onProgress({ ...result, done: result.moved + result.failed + result.missing });
  }
  return result;
}

async function testConnection(overrides = {}) {
  const options = s3Options(overrides);
  const target = new S3Client({ ...options, timeoutMs: 15000 });
  const key = prefixed(`.moeshare-test-${crypto.randomBytes(6).toString('hex')}.txt`, overrides.prefix);
  const body = Buffer.from(`MoeShare ${new Date().toISOString()}`);
  const started = Date.now();
  try {
    await target.put(key, body, { contentType: 'text/plain' });
    const response = await target.get(key);
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    if (!Buffer.concat(chunks).equals(body)) throw new Error('Die gelesene Testdatei unterscheidet sich von der geschriebenen.');
    await target.remove(key);
    return { ok: true, ms: Date.now() - started, region: target.region };
  } finally {
    target.close();
  }
}

async function counts() {
  const rows = await db.all('SELECT storage, COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM file_data GROUP BY storage');
  const result = { local: { files: 0, bytes: 0 }, s3: { files: 0, bytes: 0 } };
  for (const row of rows) result[row.storage === 's3' ? 's3' : 'local'] = { files: Number(row.files), bytes: Number(row.bytes) };
  return result;
}

function hasVariant(record, kind) {
  if (record.storage === 's3') return kind === 'original' || variantsOf(record).includes(kind);
  const paths = filePaths(record.username, record.filename);
  if (kind === 'preview') return fs.existsSync(paths.preview);
  if (kind === 'poster') return fs.existsSync(paths.poster);
  if (kind === 'hls') return fs.existsSync(paths.hlsComplete);
  return fs.existsSync(paths.file);
}

const exists = (record) => hasVariant(record, 'original');

async function openRead(record) {
  const { file } = filePaths(record.username, record.filename);
  if (record.storage !== 's3' || fs.existsSync(file)) {
    const { size, mtime } = await fsp.stat(file);
    return { stream: fs.createReadStream(file), size, modified: mtime };
  }
  const response = await bucket().get(prefixed(`${record.username}/${record.filename}`));
  const declared = Number.parseInt(response.headers['content-length'], 10);
  return { stream: response, size: Number.isFinite(declared) ? declared : Number(record.size_bytes) || 0, modified: null };
}

async function readRemote(relative) {
  const response = await bucket().get(prefixed(relative));
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sendRemote(req, res, relative, { cacheControl, downloadName = null, proxy = false }) {
  const key = prefixed(relative);
  if (!proxy && settings.get('storage.s3.delivery') === 'redirect') {
    const extra = downloadName ? { 'response-content-disposition': `attachment; filename="${downloadName.replace(/["\\]/g, '_')}"` } : {};
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, bucket().presign(key, 300, extra));
  }
  const upstream = await bucket().get(key, { range: req.headers.range });
  res.status(upstream.statusCode);
  for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    if (upstream.headers[header]) res.setHeader(header, upstream.headers[header]);
  }
  res.setHeader('Content-Type', contentTypeOf(relative));
  res.setHeader('Cache-Control', cacheControl);
  if (downloadName) res.attachment(downloadName);
  if (req.method === 'HEAD') {
    upstream.destroy();
    return res.end();
  }
  return pipeline(upstream, res).catch(() => {});
}

async function cleanupLocalCopies() {
  const rows = await db.all("SELECT username, filename FROM file_data WHERE storage = 's3'");
  let removed = 0;
  for (const row of rows) {
    if (!isValidUsername(row.username)) continue;
    if (fs.existsSync(filePaths(row.username, row.filename).file)) {
      await removeLocal(row.username, row.filename);
      removed += 1;
    }
  }
  return removed;
}

module.exports = {
  activeDriver,
  configured,
  offload,
  offloadVersions,
  removeArtifacts,
  migrate,
  testConnection,
  counts,
  hasVariant,
  exists,
  openRead,
  readRemote,
  sendRemote,
  cleanupLocalCopies,
  contentTypeOf,
  IMMUTABLE,
};
