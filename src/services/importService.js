'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('../config');
const db = require('../lib/db');
const cache = require('../lib/cache');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const media = require('../lib/media');
const passwords = require('../lib/passwords');
const { badRequest, conflict } = require('../lib/errors');
const { formatBytes } = require('../lib/format');
const { hashFile } = require('../lib/hash');
const { ensureUserDirs, filePaths, isSafeFilename, extensionOf } = require('../lib/storage');
const { randomString, displayPath } = require('../lib/slugs');
const { openSource } = require('../lib/importers/common');
const settings = require('./settingsService');
const users = require('./userService');
const files = require('./fileService');
const storage = require('./storageService');
const dedupe = require('./dedupeService');
const search = require('./searchService');
const redirects = require('./redirectService');
const audit = require('./auditService');
const webhook = require('./webhookService');
const jobs = require('./jobService');

const log = logger.scope('import');

const IMPORTERS = {
  zipline: require('../lib/importers/zipline'),
  xbackbone: require('../lib/importers/xbackbone'),
  chibisafe: require('../lib/importers/chibisafe'),
};

const LOCK_MS = 12 * 60 * 60 * 1000;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,190}$/;
const ALBUM_CODE = /^[A-Za-z0-9]{6,32}$/;
const LINK_CODE = /^[A-Za-z0-9_-]{1,64}$/;
const ALLOWED_PREFIXES = { zipline: ['u'], xbackbone: ['download'], chibisafe: ['a', 's'] };

function cleanInput(input = {}) {
  const kind = String(input.kind || '').toLowerCase();
  if (!IMPORTERS[kind]) throw badRequest('Unbekannter Uploader. Möglich sind Zipline, XBackBone und Chibisafe.', { field: 'kind' });
  const database = typeof input.database === 'string' ? input.database.trim() : '';
  if (!database) throw badRequest('Gib die Datenbank des alten Uploaders an.', { field: 'database' });
  const dir = typeof input.files === 'string' ? input.files.trim() : '';
  if (!dir) throw badRequest('Gib den Ordner mit den hochgeladenen Dateien an.', { field: 'files' });
  const filesDir = path.resolve(config.paths.root, dir);
  if (!fs.existsSync(filesDir) || !fs.statSync(filesDir).isDirectory()) {
    throw badRequest('Diesen Ordner gibt es auf dem Server nicht.', { field: 'files' });
  }
  if (path.resolve(filesDir) === path.resolve(config.paths.uploads)) {
    throw badRequest('Das ist der Upload-Ordner von MoeShare. Gib den Ordner des alten Uploaders an.', { field: 'files' });
  }
  return {
    kind,
    database,
    filesDir,
    admins: input.admins !== false,
    merge: input.merge !== false,
    orphans: input.orphans === 'skip' ? 'skip' : 'admin',
  };
}

const sourceKey = (options) =>
  `${options.kind}:${crypto.createHash('sha256').update(`${options.database}|${options.filesDir}`).digest('hex').slice(0, 24)}`;

function safeJoin(base, relative) {
  if (typeof relative !== 'string' || !relative) return null;
  const target = path.resolve(base, relative);
  return target.startsWith(path.resolve(base) + path.sep) ? target : null;
}

async function readSource(options) {
  let source;
  try {
    source = await openSource(options.database);
  } catch (error) {
    throw badRequest(`Die Datenbank lässt sich nicht öffnen: ${error.message}`, { field: 'database' });
  }
  try {
    const importer = IMPORTERS[options.kind];
    if (!(await importer.detect(source))) {
      throw badRequest(`Das sieht nicht nach einer ${importer.label}-Datenbank aus.`, { field: 'database' });
    }
    return await importer.read(source);
  } catch (error) {
    if (error.status) throw error;
    throw badRequest(`Die Datenbank ließ sich nicht lesen: ${error.message}`, { field: 'database' });
  } finally {
    await source.close().catch(() => {});
  }
}

function cleanUsername(raw) {
  let name = String(raw || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 32)
    .replace(/[-_.]+$/, '');
  if (name.length < 2) name = `user-${name || randomString(4).toLowerCase()}`;
  return name.slice(0, 32);
}

async function preview(input) {
  const options = cleanInput(input);
  const data = await readSource(options);
  let missing = 0;
  let bytes = 0;
  for (const file of data.files) {
    const target = safeJoin(options.filesDir, file.path);
    if (!target || !fs.existsSync(target)) missing += 1;
    else bytes += file.size || fs.statSync(target).size;
  }
  const accounts = [];
  for (const user of data.users) {
    const name = cleanUsername(user.username);
    const existing = await users.findByName(name);
    accounts.push({
      username: user.username,
      target: existing && options.merge ? existing.username : name,
      merge: Boolean(existing && options.merge),
      renamed: !existing && name !== user.username,
      admin: user.admin && options.admins,
      password: passwords.isSupported(user.password) ? 'kept' : 'new',
      active: user.active,
    });
  }
  const mapped = await db.count('SELECT COUNT(*) FROM import_map WHERE source = ?', [sourceKey(options)]);
  return {
    kind: options.kind,
    label: data.label,
    counts: {
      users: data.users.length,
      files: data.files.length,
      albums: data.albums.length,
      links: data.links.length,
      texts: data.pastes.length,
    },
    bytes,
    missing,
    alreadyImported: mapped,
    accounts: accounts.slice(0, 200),
    orphans: data.files.filter((file) => !file.ownerId).length,
  };
}

async function mapped(source, kind, sourceId) {
  const row = await db.get('SELECT target_id FROM import_map WHERE source = ? AND kind = ? AND source_id = ?', [
    source,
    kind,
    String(sourceId).slice(0, 120),
  ]);
  return row ? Number(row.target_id) : null;
}

const remember = (source, kind, sourceId, targetId) =>
  db.insertIgnore('import_map', { source, kind, source_id: String(sourceId).slice(0, 120), target_id: targetId, created_at: Date.now() });

async function freeUsername(name) {
  let candidate = name;
  for (let counter = 2; await users.findByName(candidate); counter++) candidate = `${name.slice(0, 28)}-${counter}`;
  return candidate;
}

async function importUser(context, user) {
  const { options, source, report } = context;
  const known = await mapped(source, 'user', user.sourceId);
  if (known) {
    const row = await users.findById(known);
    if (row) {
      report.users.skipped += 1;
      return row;
    }
  }
  const name = cleanUsername(user.username);
  const existing = await users.findByName(name);
  if (existing && options.merge) {
    await remember(source, 'user', user.sourceId, existing.id);
    report.users.merged += 1;
    return existing;
  }
  const username = await freeUsername(name);
  let hash = passwords.isSupported(user.password) ? passwords.normalize(user.password) : null;
  let temporary = null;
  if (!hash) {
    temporary = users.generatePassword();
    hash = await users.hashPassword(temporary);
  }
  const now = Date.now();
  const id = await db.insertRow('users', {
    username,
    password: hash,
    role: user.admin && options.admins ? 'admin' : 'mitglied',
    status: user.active ? 'active' : 'suspended',
    suspended_reason: user.active ? null : 'Beim Import übernommen',
    quota_bytes: user.quotaBytes && user.quotaBytes >= 1024 * 1024 ? user.quotaBytes : null,
    max_file_bytes: null,
    created_at: user.createdAt || now,
    password_changed_at: now,
    must_change_password: temporary ? 1 : 0,
  });
  ensureUserDirs(username);
  await remember(source, 'user', user.sourceId, id);
  report.users.created += 1;
  if (temporary) report.passwords.push({ username, password: temporary });
  if (username !== user.username) report.renamed.push({ from: user.username, to: username });
  return users.findById(id);
}

async function freeFilename(username, preferred, ext) {
  const candidate = preferred && isSafeFilename(preferred) && extensionOf(preferred) === ext ? preferred : null;
  if (candidate) {
    const taken =
      (await db.get('SELECT 1 AS found FROM file_data WHERE username = ? AND filename = ?', [username, candidate])) ||
      (await db.get('SELECT 1 AS found FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE f.username = ? AND v.filename = ?', [
        username,
        candidate,
      ])) ||
      fs.existsSync(filePaths(username, candidate).file);
    if (!taken) return candidate;
  }
  return `${crypto.randomUUID()}${ext}`;
}

async function freeSlug(preferred, fallback) {
  if (preferred && SLUG.test(preferred) && !(await files.slugTaken(preferred))) return preferred;
  return fallback;
}

function nativePath(kind, target, variant) {
  if (kind === 'file') {
    const slug = displayPath(target.slug || target.filename);
    if (variant === 'download') return `/download/${slug}`;
    if (variant === 'direct') return `/uploads/${target.username}/${target.filename}`;
    return `/view/${slug}`;
  }
  if (kind === 'link') return `/s/${displayPath(target.code)}`;
  return `/a/${target.code}`;
}

async function addRedirects(context, kind, target, legacy = []) {
  const allowReserved = ALLOWED_PREFIXES[context.options.kind] || [];
  for (const entry of legacy) {
    const value = redirects.normalize(entry.path);
    if (!value || value === nativePath(kind, target, entry.variant || 'view')) continue;
    if (
      context.options.kind === 'zipline' &&
      value.startsWith('/u/') &&
      !value.slice(3).includes('.') &&
      (await users.findByName(value.slice(3)))
    )
      continue;
    if (value.startsWith('/a/') && (await db.get('SELECT 1 AS found FROM albums WHERE code = ?', [value.slice(3)]))) continue;
    if (value.startsWith('/s/') && (await db.get('SELECT 1 AS found FROM links WHERE code = ?', [value.slice(3)]))) continue;
    if (
      await redirects.add(value, kind, target.id, { variant: entry.variant || 'view', source: context.source.slice(0, 40), allowReserved })
    ) {
      context.report.redirects += 1;
    }
  }
}

async function analyze(record) {
  const type = files.typeOf(record.filename, record.syntax).type;
  if (type === 'text') await search.index(record);
  if (type === 'image' || type === 'video') {
    const { result } = await media.analyze(record.username, record.filename, type, {
      preview: settings.get('uploads.preview'),
      dominantColor: settings.get('uploads.dominantColor'),
      hls: false,
    });
    await files.update(record.username, record.filename, result);
  }
  if (storage.activeDriver() === 's3') {
    const fresh = await files.findById(record.id);
    if (fresh) await storage.offload(fresh, { graceMs: 0 });
  }
}

async function attach(albumIds, fileId, ownerId) {
  for (const albumId of albumIds) {
    const order = await db.count('SELECT COALESCE(MAX(sort_order), 0) FROM album_files WHERE album_id = ?', [albumId]);
    await db.insertIgnore('album_files', {
      album_id: albumId,
      file_id: fileId,
      sort_order: order + 1,
      added_at: Date.now(),
      added_by: ownerId,
    });
  }
}

async function storeFile(context, owner, item, { sourcePath = null, content = null }) {
  const ext = content !== null ? '.txt' : extensionOf(item.name || item.path) || extensionOf(item.originalName) || '';
  const filename = content !== null ? `${crypto.randomUUID()}.txt` : await freeFilename(owner.username, item.name, ext);
  ensureUserDirs(owner.username);
  const target = filePaths(owner.username, filename).file;
  if (content !== null) await fsp.writeFile(target, content, 'utf8');
  else await fsp.copyFile(sourcePath, target, fs.constants.COPYFILE_EXCL);
  try {
    const { size } = await fsp.stat(target);
    const sha256 = await hashFile(target);
    const link = await dedupe.linkUpload(owner.username, target, sha256, size);
    const slug = await freeSlug(item.slug || item.name, filename);
    const hash = item.passwordHash && passwords.isSupported(item.passwordHash) ? passwords.normalize(item.passwordHash) : null;
    if (item.passwordHash && !hash) context.report.warnings.add('passwords');
    const syntax = content !== null ? item.syntax || 'auto' : null;
    const record = await files.insert({
      username: owner.username,
      filename,
      slug,
      sizeBytes: size,
      createdAt: new Date(item.createdAt || Date.now()),
      expiresAt: item.expiresAt || null,
      passwordHash: hash,
      maxViews: item.maxViews || null,
      originalName: item.originalName || null,
      title: item.title || null,
      syntax: syntax && /^[a-z0-9+#-]{1,32}$/.test(syntax) ? syntax : content !== null ? 'auto' : null,
      sha256,
      deduped: link.linked,
      warning: item.warning === undefined ? null : item.warning,
    });
    if (item.views) await db.run('UPDATE file_data SET views = ? WHERE id = ?', [item.views, record.id]);
    if (item.tags && item.tags.length) await files.setTags(record, item.tags);
    return record;
  } catch (error) {
    await fsp.rm(target, { force: true });
    throw error;
  }
}

async function importFiles(context, list, albumMap, kind) {
  const { options, source, report, owners, actor } = context;
  for (const item of list) {
    context.step();
    const bucket = kind === 'paste' ? report.texts : report.files;
    if (await mapped(source, kind, item.sourceId)) {
      bucket.skipped += 1;
      continue;
    }
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      bucket.skipped += 1;
      continue;
    }
    const owner = owners.get(item.ownerId) || (options.orphans === 'admin' ? actor : null);
    if (!owner) {
      bucket.skipped += 1;
      continue;
    }
    let sourcePath = null;
    if (kind === 'file') {
      sourcePath = safeJoin(options.filesDir, item.path);
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        bucket.missing += 1;
        continue;
      }
    }
    try {
      const record = await storeFile(context, owner, item, kind === 'paste' ? { content: item.content } : { sourcePath });
      await remember(source, kind, item.sourceId, record.id);
      await attach((item.albums || []).map((id) => albumMap.get(id)).filter(Boolean), record.id, owner.id);
      await addRedirects(context, 'file', record, item.legacy);
      bucket.imported += 1;
      bucket.bytes = (bucket.bytes || 0) + Number(record.size_bytes);
      await analyze(record).catch((error) => log.debug('Vorschau für importierte Datei fehlgeschlagen', { file: record.filename, error }));
    } catch (error) {
      bucket.failed += 1;
      log.warn('Eine Datei ließ sich nicht übernehmen', { file: item.path || item.slug, error });
    }
  }
}

async function importAlbums(context, list) {
  const { source, report, owners, options, actor } = context;
  const map = new Map();
  for (const album of list) {
    context.step();
    const known = await mapped(source, 'album', album.sourceId);
    if (known) {
      map.set(album.sourceId, known);
      report.albums.skipped += 1;
      continue;
    }
    const owner = owners.get(album.ownerId) || (options.orphans === 'admin' ? actor : null);
    if (!owner) {
      report.albums.skipped += 1;
      continue;
    }
    let code =
      album.code && ALBUM_CODE.test(album.code) && !(await db.get('SELECT 1 AS found FROM albums WHERE code = ?', [album.code]))
        ? album.code
        : null;
    while (!code) {
      const candidate = randomString(10);
      if (!(await db.get('SELECT 1 AS found FROM albums WHERE code = ?', [candidate]))) code = candidate;
    }
    const now = Date.now();
    const id = await db.insertRow('albums', {
      code,
      user_id: owner.id,
      title:
        String(album.title || 'Album')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120) || 'Album',
      description: album.description ? String(album.description).slice(0, 2000) : null,
      visibility: ['private', 'link', 'public'].includes(album.visibility) ? album.visibility : 'link',
      password_hash: null,
      cover_file_id: null,
      created_at: album.createdAt || now,
      updated_at: now,
    });
    map.set(album.sourceId, id);
    await remember(source, 'album', album.sourceId, id);
    await addRedirects(context, 'album', { id, code }, album.legacy);
    report.albums.imported += 1;
  }
  return map;
}

function validUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}

async function importLinks(context, list) {
  const { source, report, owners, options, actor } = context;
  for (const link of list) {
    context.step();
    if (await mapped(source, 'link', link.sourceId)) {
      report.links.skipped += 1;
      continue;
    }
    const owner = owners.get(link.ownerId) || (options.orphans === 'admin' ? actor : null);
    const url = validUrl(link.url);
    if (!owner || !url || !link.enabled) {
      report.links.skipped += 1;
      continue;
    }
    let code =
      link.code &&
      LINK_CODE.test(link.code) &&
      !(await db.get('SELECT 1 AS found FROM links WHERE code = ?', [link.code])) &&
      !redirects.has(`/s/${link.code}`)
        ? link.code
        : null;
    while (!code) {
      const candidate = randomString(7);
      if (!(await db.get('SELECT 1 AS found FROM links WHERE code = ?', [candidate]))) code = candidate;
    }
    const hash = link.passwordHash && passwords.isSupported(link.passwordHash) ? passwords.normalize(link.passwordHash) : null;
    const id = await db.insertRow('links', {
      code,
      url,
      user_id: owner.id,
      title: link.title ? String(link.title).slice(0, 255) : null,
      created_at: link.createdAt || Date.now(),
      expires_at: null,
      password_hash: hash,
      max_clicks: link.maxClicks || null,
      clicks: link.clicks || 0,
    });
    await remember(source, 'link', link.sourceId, id);
    await addRedirects(context, 'link', { id, code }, link.legacy);
    report.links.imported += 1;
  }
}

function emptyReport() {
  const bucket = () => ({ imported: 0, skipped: 0, missing: 0, failed: 0, bytes: 0 });
  return {
    users: { created: 0, merged: 0, skipped: 0 },
    files: bucket(),
    texts: bucket(),
    albums: { imported: 0, skipped: 0 },
    links: { imported: 0, skipped: 0 },
    redirects: 0,
    passwords: [],
    renamed: [],
    warnings: new Set(),
  };
}

async function run(actor, input, onProgress = () => {}) {
  const options = cleanInput(input);
  const lock = await ephemeral.acquire('import', LOCK_MS);
  if (!lock) throw conflict('Es läuft schon ein Import.');
  const started = Date.now();
  try {
    const data = await readSource(options);
    const report = emptyReport();
    const total = Math.max(1, data.users.length + data.albums.length + data.files.length + data.pastes.length + data.links.length);
    let done = 0;
    let shown = 0;
    const context = {
      options,
      source: sourceKey(options),
      report,
      actor,
      owners: new Map(),
      step: () => {
        done += 1;
        if (Date.now() - shown < 1000 && done < total) return;
        shown = Date.now();
        onProgress(done / total, summarize(report));
      },
    };
    log.info(`Import aus ${data.label} beginnt`, {
      users: data.users.length,
      files: data.files.length,
      albums: data.albums.length,
      links: data.links.length,
    });
    webhook.notify(
      'import',
      'Import gestartet',
      `Quelle: **${data.label}**\nDateien: **${data.files.length}**\nKonten: **${data.users.length}**`
    );
    for (const user of data.users) {
      context.step();
      context.owners.set(user.sourceId, await importUser(context, user));
    }
    const albumMap = await importAlbums(context, data.albums);
    await importFiles(context, data.files, albumMap, 'file');
    await importFiles(context, data.pastes, albumMap, 'paste');
    await importLinks(context, data.links);
    await redirects.load();
    cache.clear();
    const result = { ...summarize(report), label: data.label, ms: Date.now() - started };
    audit.log('import_finished', {
      userId: null,
      actorId: actor.id,
      details: { source: data.label, files: report.files.imported, users: report.users.created },
    });
    log.info(`Import aus ${data.label} abgeschlossen`, {
      files: report.files.imported,
      missing: report.files.missing,
      users: report.users.created,
      size: formatBytes(report.files.bytes),
    });
    webhook.notify(
      'import',
      'Import abgeschlossen',
      `Quelle: **${data.label}**\nDateien: **${report.files.imported}**\nKonten: **${report.users.created}**\nFehlend: **${report.files.missing}**`
    );
    return result;
  } finally {
    await ephemeral.release('import', lock);
  }
}

function summarize(report) {
  return { ...report, warnings: [...report.warnings] };
}

function start(actor, input) {
  cleanInput(input);
  return jobs.start(actor, 'import', (progress) => run(actor, input, progress)).job;
}

module.exports = { IMPORTERS, preview, run, start };
