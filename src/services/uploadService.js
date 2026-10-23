'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const { pipeline } = require('stream/promises');
const config = require('../config');
const logger = require('../lib/logger');
const media = require('../lib/media');
const { client: safeHttp } = require('../lib/safeFetch');
const { HttpError, badRequest, badGateway, tooLarge } = require('../lib/errors');
const { formatBytes } = require('../lib/format');
const { extensionOf, ensureUserDirs, filePaths } = require('../lib/storage');
const slugs = require('../lib/slugs');
const imaging = require('../lib/imaging');
const { hashFile } = require('../lib/hash');
const { resolveExpiry } = require('../lib/expiry');
const db = require('../lib/db');
const settings = require('./settingsService');
const files = require('./fileService');
const preferences = require('./preferenceService');
const protection = require('./protectionService');
const storage = require('./storageService');
const webhook = require('./webhookService');
const scans = require('./scanService');
const dedupe = require('./dedupeService');
const versions = require('./versionService');
const search = require('./searchService');
const watermarks = require('./watermarkService');

const log = logger.scope('upload');

const FETCH_FALLBACK_LIMIT = 100 * 1024 * 1024;

const CONTENT_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'audio/mp4': '.m4a',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/json': '.json',
  'text/plain': '.txt',
};

const newFilename = (ext) => `${crypto.randomUUID()}${ext}`;

const EXPIRY_LABELS = {
  '10m': '10 Minuten',
  '1h': '1 Stunde',
  '6h': '6 Stunden',
  '1d': '1 Tag',
  '3d': '3 Tage',
  '7d': '7 Tage',
  '30d': '30 Tage',
  '90d': '90 Tage',
  '365d': '1 Jahr',
};
const SYNTAX = /^[a-z0-9+#-]{1,32}$/;
const MAX_VIEWS = 1000;

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const truthy = (value) => value === true || ['1', 'true', 'yes', 'ja', 'on'].includes(String(value).trim().toLowerCase());
const falsy = (value) => value === false || ['0', 'false', 'no', 'nein', 'off'].includes(String(value).trim().toLowerCase());
const MAX_WARNING = 100;

function switchOf(value) {
  if (value === undefined || value === null || value === '') return null;
  if (truthy(value)) return true;
  if (falsy(value)) return false;
  return null;
}

function warningOf(value) {
  if (value === undefined || value === null || value === '') return null;
  if (falsy(value)) return null;
  if (truthy(value)) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_WARNING);
}

function rawOptions(req) {
  const body = req.body || {};
  const header = (name) => req.get(name);
  return {
    expires: first(body.expires, body.expiry, header('x-expires'), header('x-expiry')),
    password: first(body.password, header('x-password')),
    maxViews: first(body.maxViews, body.max_views, header('x-max-views')),
    once: first(body.once, header('x-once')),
    urlStyle: first(body.urlStyle, body.style, header('x-url-style')),
    domain: first(body.domain, header('x-domain')),
    title: first(body.title, header('x-title')),
    syntax: first(body.syntax, body.language, header('x-syntax')),
    tags: first(body.tags, header('x-tags')),
    album: first(body.album, header('x-album')),
    warning: first(body.warning, body.spoiler, header('x-warning'), header('x-spoiler')),
    optimize: first(body.optimize, header('x-optimize')),
    watermark: first(body.watermark, header('x-watermark')),
  };
}

async function albumFor(user, value) {
  return db.get(
    `SELECT a.id FROM albums a WHERE (a.code = ? OR a.id = ?) AND (a.user_id = ? OR EXISTS (
       SELECT 1 FROM album_members m WHERE m.album_id = a.id AND m.user_id = ?))`,
    [String(value), Number(value) || 0, user.id, user.id]
  );
}

async function resolveOptions(user, raw = {}, { kind = 'file' } = {}) {
  const prefs = user.id ? await preferences.get(user.id) : {};
  const styles = kind === 'link' ? slugs.LINK_STYLES : slugs.STYLES;
  const fallbackStyle = kind === 'link' ? settings.get('links.urlStyle') : prefs.urlStyle || settings.get('uploads.urlStyle');
  const style = String(first(raw.urlStyle, fallbackStyle)).trim().toLowerCase();
  if (!styles.includes(style)) throw badRequest(`Unbekannter Adressstil. Möglich sind: ${styles.join(', ')}.`, { field: 'urlStyle' });

  const max = settings.get('uploads.maxExpiry');
  const expiry = resolveExpiry(raw.expires, { fallback: prefs.expiry || settings.get('uploads.defaultExpiry'), max });
  if (expiry.error === 'invalid') throw badRequest('Ungültige Ablaufzeit. Beispiele: 10m, 1h, 7d oder never.', { field: 'expires' });
  if (expiry.error === 'too_long')
    throw badRequest(`Länger als ${EXPIRY_LABELS[max] || max} darf hier nichts bleiben.`, { field: 'expires' });

  let maxViews = null;
  if (raw.once !== undefined && truthy(raw.once)) maxViews = 1;
  if (raw.maxViews !== undefined && raw.maxViews !== null && raw.maxViews !== '') {
    const count = Number(raw.maxViews);
    if (!Number.isInteger(count) || count < 0 || count > MAX_VIEWS)
      throw badRequest(`Erlaubt sind 1 bis ${MAX_VIEWS} Aufrufe.`, { field: 'maxViews' });
    maxViews = count || null;
  }

  const password = raw.password === undefined || raw.password === null ? '' : String(raw.password);
  if (password.length > protection.MAX_PASSWORD) throw badRequest('Das Passwort ist zu lang.', { field: 'password' });

  let domainChoice = prefs.domain || null;
  if (raw.domain) {
    domainChoice = files.resolveDomain(raw.domain, user.username);
    if (!domainChoice) throw badRequest('Diese Domain ist auf dem Server nicht eingetragen.', { field: 'domain' });
  }

  const syntax = raw.syntax ? String(raw.syntax).trim().toLowerCase() : null;
  if (syntax && !SYNTAX.test(syntax)) throw badRequest('Unbekannte Sprache für die Hervorhebung.', { field: 'syntax' });

  let album = null;
  if (raw.album !== undefined && raw.album !== null && raw.album !== '') {
    album = user.id ? await albumFor(user, raw.album) : null;
    if (!album) throw badRequest('Dieses Album gibt es nicht.', { field: 'album' });
  }

  const optimize = switchOf(raw.optimize);
  return {
    warning: warningOf(raw.warning),
    optimize: optimize === null ? (prefs.optimize === false ? false : null) : optimize,
    watermark: switchOf(raw.watermark),
    style,
    expiresAt: expiry.ms ? Date.now() + expiry.ms : null,
    passwordHash: password ? await protection.hashPassword(password) : null,
    maxViews,
    domain: files.pickDomain(domainChoice, user.username),
    title: raw.title ? String(raw.title).replace(/\s+/g, ' ').trim().slice(0, 255) || null : null,
    syntax,
    tags: raw.tags ? files.normalizeTags(raw.tags) : [],
    albumId: album ? album.id : null,
  };
}

function linksFor(record, domain = null) {
  const urls = files.urlsFor(record, { domain });
  const guarded = protection.isProtected(record) || (record.warning !== null && record.warning !== undefined);
  const previewed = !guarded && settings.get('uploads.preview') && files.typeOf(record.filename).type === 'image';
  return {
    success: true,
    file: guarded ? urls.view : urls.direct,
    view: urls.view,
    preview: previewed ? urls.preview : guarded ? urls.view : urls.direct,
    delete: urls.delete,
    id: record.id,
    filename: record.filename,
    slug: record.slug,
    expiresAt: record.expires_at ? Number(record.expires_at) : null,
    protected: { password: Boolean(record.password_hash), maxViews: record.max_views || null },
    warning: record.warning === null || record.warning === undefined ? null : record.warning,
  };
}

function analyzeLater(record, type = files.typeOf(record.filename, record.syntax).type) {
  const { username, filename } = record;
  const options = {
    preview: settings.get('uploads.preview'),
    dominantColor: settings.get('uploads.dominantColor'),
    hls: settings.get('uploads.hls'),
  };
  const started = Date.now();
  media
    .analyze(username, filename, type, options)
    .then(async ({ result, errors }) => {
      await files.update(username, filename, result);
      if (storage.activeDriver() === 's3') {
        const fresh = await files.findById(record.id);
        if (fresh && fresh.filename === filename) {
          await storage.offloadVersions(fresh).catch((error) => log.warn('Ältere Versionen bleiben lokal', { file: filename, error }));
          await storage.offload(fresh).catch((error) => {
            log.error('Die Datei konnte nicht nach S3 übertragen werden, sie bleibt lokal', { user: username, file: filename, error });
            webhook.notify('processing', 'Speicher', `Datei: **${filename}**\nS3: ${error.message}`, 'error');
          });
        }
      }
      if (!errors.length) {
        log.debug('Verarbeitung abgeschlossen', { user: username, file: filename, ms: Date.now() - started });
        return webhook.notify('processing', 'Verarbeitung', `Datei: **${filename}**\nAlle Schritte erfolgreich abgeschlossen.`);
      }
      log.warn('Verarbeitung teilweise fehlgeschlagen', { user: username, file: filename, problems: errors.join('; ') });
      return webhook.notify('processing', 'Verarbeitung', `Datei: **${filename}**\nFehler: ${errors.join('\n')}`, 'error');
    })
    .catch((error) => {
      log.error('Verarbeitung fehlgeschlagen', { user: username, file: filename, error });
      webhook.notify('processing', 'Verarbeitung', `Datei: **${filename}**\nFehler: ${error.message}`, 'error');
    });
}

async function insertWithSlug(details, options) {
  const language = settings.get('site.language');
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = await slugs.unique(
      options.style || 'uuid',
      { filename: details.filename, original: details.originalName, extension: extensionOf(details.filename), language },
      files.slugTaken
    );
    try {
      return await files.insert({ ...details, slug });
    } catch (error) {
      if (!db.isUniqueViolation(error) || attempt === 5) throw error;
    }
  }
  return null;
}

async function imagePlan(user, chosen) {
  const prefs = user.id ? await preferences.get(user.id) : {};
  const wanted = chosen.optimize === true || (chosen.optimize !== false && prefs.optimize !== false);
  const optimize =
    settings.get('images.optimize') && wanted
      ? {
          format: settings.get('images.format'),
          quality: settings.get('images.quality'),
          maxDimension: settings.get('images.maxDimension'),
        }
      : null;
  const watermark = chosen.watermark === false ? null : await watermarks.forUser(user.id);
  const keepOriginal = versions.enabled() && ((optimize && settings.get('images.keepOriginal')) || (watermark && watermark.keepOriginal));
  return { optimize, watermark, keepOriginal: Boolean(keepOriginal) };
}

const renamed = (name, ext) => (name && extensionOf(name) ? `${name.slice(0, -extensionOf(name).length)}${ext}` : name);

async function prepare(user, filename, { chosen = {}, originalName = null, via = 'upload', process = true } = {}) {
  const username = user.username;
  const { file } = filePaths(username, filename);
  const { size } = await fsp.stat(file);
  const scanStatus = await scans.assertClean(file, { user, name: originalName || filename, size, via });
  const { type } = files.typeOf(filename, chosen.syntax);
  if (type === 'image' && settings.get('uploads.removeMetadata')) {
    await media
      .stripLocation(file)
      .catch((error) => log.warn('Standortdaten konnten nicht entfernt werden', { user: username, file: filename, error }));
  }
  const result = { filename, originalName, scanStatus, original: null };
  if (!process || type !== 'image' || !imaging.canProcess(extensionOf(filename))) return result;
  const plan = await imagePlan(user, chosen);
  if (!plan.optimize && !plan.watermark) return result;
  let processed = null;
  try {
    processed = await imaging.processImage(file, { ext: extensionOf(filename), optimize: plan.optimize, watermark: plan.watermark });
  } catch (error) {
    log.warn('Das Bild ließ sich nicht optimieren, es bleibt unverändert', { user: username, file: filename, error });
  }
  if (!processed) return result;
  const next = newFilename(processed.ext);
  await fsp.rename(processed.file, filePaths(username, next).file);
  if (plan.keepOriginal) {
    result.original = { filename, size, sha256: await hashFile(file), originalName };
  } else {
    await fsp.rm(file, { force: true });
  }
  log.debug(processed.watermarked ? 'Bild verarbeitet und mit Wasserzeichen versehen' : 'Bild optimiert', {
    user: username,
    file: next,
    before: formatBytes(processed.before),
    after: formatBytes(processed.after),
  });
  return { ...result, filename: next, originalName: renamed(originalName, processed.ext) };
}

async function discardPrepared(username, prepared) {
  await fsp.rm(filePaths(username, prepared.filename).file, { force: true });
  if (prepared.original) await fsp.rm(filePaths(username, prepared.original.filename).file, { force: true });
}

async function accept(user, filename, { via = 'upload', originalName = null, options = null } = {}) {
  const account = typeof user === 'string' ? await db.get('SELECT id, username FROM users WHERE username = ?', [user]) : user;
  const actor = account || { username: user };
  const username = actor.username;
  const chosen = options || (await resolveOptions(actor, {}));
  let prepared;
  try {
    prepared = await prepare(actor, filename, { chosen, originalName, via });
  } catch (error) {
    await fsp.rm(filePaths(username, filename).file, { force: true });
    throw error;
  }
  let record;
  let twin = null;
  try {
    const { file } = filePaths(username, prepared.filename);
    const sha256 = await hashFile(file);
    const { size } = await fsp.stat(file);
    const link = await dedupe.linkUpload(username, file, sha256, size);
    twin = link.twin;
    record = await insertWithSlug(
      {
        username,
        filename: prepared.filename,
        sizeBytes: size,
        createdAt: new Date(),
        expiresAt: chosen.expiresAt,
        passwordHash: chosen.passwordHash,
        maxViews: chosen.maxViews,
        originalName: prepared.originalName,
        title: chosen.title,
        syntax: chosen.syntax,
        sha256,
        deduped: link.linked,
        warning: chosen.warning,
        scanStatus: prepared.scanStatus,
        version: prepared.original ? 2 : 1,
      },
      chosen
    );
  } catch (error) {
    await discardPrepared(username, prepared);
    throw error;
  }
  if (prepared.original) await versions.keepOriginal(record, prepared.original);
  if (chosen.tags && chosen.tags.length) await files.setTags(record, chosen.tags);
  if (chosen.albumId) {
    const order = await db.count('SELECT COALESCE(MAX(sort_order), 0) FROM album_files WHERE album_id = ?', [chosen.albumId]);
    await db.insertIgnore('album_files', {
      album_id: chosen.albumId,
      file_id: record.id,
      sort_order: order + 1,
      added_at: Date.now(),
      added_by: actor.id || null,
    });
    await db.run('UPDATE albums SET updated_at = ? WHERE id = ?', [Date.now(), chosen.albumId]);
  }
  const { type } = files.typeOf(record.filename, record.syntax);
  log.info('Datei hochgeladen', {
    user: username,
    file: record.filename,
    size: formatBytes(record.size_bytes),
    via: via === 'upload' ? undefined : via,
    duplicate: Number(record.deduped) ? true : undefined,
  });
  if (type === 'text') search.indexLater(record);
  analyzeLater(record, type);
  const links = linksFor(record, chosen.domain);
  if (twin)
    links.duplicateOf = {
      id: twin.id,
      slug: twin.slug || twin.filename,
      view: files.urlsFor(twin).view,
      stored: Boolean(Number(record.deduped)),
    };
  webhook.notify(
    'upload',
    'Neue Datei hochgeladen',
    `Dateiname: **${record.filename}**\nURL: **${links.view}**\nBenutzername: **${username}**\nGröße: **${formatBytes(record.size_bytes)}**`
  );
  return links;
}

async function addVersion(user, record, filename, { originalName = null, note = null, process = true, via = 'version' } = {}) {
  let prepared;
  try {
    prepared = await prepare(user, filename, {
      chosen: { syntax: record.syntax, optimize: null, watermark: null },
      originalName,
      via,
      process,
    });
  } catch (error) {
    await fsp.rm(filePaths(user.username, filename).file, { force: true });
    throw error;
  }
  if (prepared.original) await fsp.rm(filePaths(user.username, prepared.original.filename).file, { force: true });
  let updated;
  try {
    updated = await versions.replace(record, prepared.filename, {
      originalName: prepared.originalName === null ? undefined : prepared.originalName,
      note,
      scanStatus: prepared.scanStatus,
    });
  } catch (error) {
    await fsp.rm(filePaths(user.username, prepared.filename).file, { force: true });
    throw error;
  }
  const { type } = files.typeOf(updated.filename, updated.syntax);
  if (type === 'text') search.indexLater(updated);
  else await search.remove(updated.id);
  analyzeLater(updated, type);
  webhook.notify(
    'upload',
    versions.enabled() ? 'Neue Version hochgeladen' : 'Datei ersetzt',
    `Datei: **${updated.filename}**\nVorher: **${record.filename}**\nBenutzername: **${user.username}**`
  );
  return updated;
}

const EDITABLE = ['.jpg', '.jpeg', '.png', '.webp'];

async function replaceImage(user, record, filename) {
  if (!EDITABLE.includes(extensionOf(filename))) {
    await fsp.rm(filePaths(user.username, filename).file, { force: true });
    throw badRequest('Gespeichert werden können nur PNG-, JPEG- und WebP-Bilder.');
  }
  const updated = await addVersion(user, record, filename, { note: 'edited', process: false, via: 'editor' });
  log.info('Bild bearbeitet', {
    user: user.username,
    file: updated.filename,
    previous: record.filename,
    size: formatBytes(updated.size_bytes),
  });
  return updated;
}

async function createText(user, content, raw, { limit, message } = {}) {
  if (!settings.get('uploads.texts')) throw badRequest('Text-Uploads sind auf diesem Server abgeschaltet.');
  const text = typeof content === 'string' ? content.replace(/\r\n?/g, '\n') : '';
  if (!text.trim()) throw badRequest('Der Text ist leer.', { field: 'content' });
  const bytes = Buffer.byteLength(text, 'utf8');
  const maxText = settings.get('uploads.textMaxBytes');
  if (maxText && bytes > maxText) throw tooLarge(`Der Text ist zu lang. Erlaubt sind höchstens ${formatBytes(maxText)}.`);
  if (limit && bytes > limit) throw tooLarge(message);
  const options = await resolveOptions(user, { ...raw, syntax: raw.syntax || 'auto' });
  ensureUserDirs(user.username);
  const filename = newFilename('.txt');
  const target = filePaths(user.username, filename).file;
  await fsp.writeFile(target, text, 'utf8');
  try {
    return await accept(user, filename, { via: 'text', originalName: options.title ? `${options.title}.txt` : null, options });
  } catch (error) {
    await fsp.rm(target, { force: true });
    throw error;
  }
}

function extensionFor(contentType, url) {
  const known =
    CONTENT_TYPES[
      String(contentType || '')
        .split(';')[0]
        .trim()
        .toLowerCase()
    ];
  return known || extensionOf(new URL(url).pathname) || '.bin';
}

function parseRemoteUrl(value) {
  let url;
  try {
    url = new URL(typeof value === 'string' ? value.trim() : '');
  } catch {
    throw badRequest('Das ist keine gültige Adresse.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Nur http- und https-Adressen sind erlaubt.');
  return url.href;
}

async function fetchRemote(user, value, { limit, message }, raw = {}) {
  const username = user.username;
  const options = await resolveOptions(user, raw);
  const url = parseRemoteUrl(value);
  const maxBytes = limit || FETCH_FALLBACK_LIMIT;
  const tooBig = () => tooLarge(limit ? message : 'Die Datei überschreitet das Größenlimit.');
  let target = null;

  try {
    const response = await safeHttp({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: 15000,
      maxContentLength: maxBytes,
      maxRedirects: 5,
      headers: { 'User-Agent': `MoeShare/${config.version}` },
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const declared = Number.parseInt(response.headers['content-length'], 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      response.data.destroy();
      throw tooBig();
    }

    ensureUserDirs(username);
    const filename = newFilename(extensionFor(response.headers['content-type'], url));
    target = filePaths(username, filename).file;
    let received = 0;
    response.data.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) response.data.destroy(Object.assign(new Error('Zu groß'), { code: 'ETOOLARGE' }));
    });
    await pipeline(response.data, fs.createWriteStream(target));
    return await accept(user, filename, {
      via: 'link',
      originalName: decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || null,
      options,
    });
  } catch (error) {
    if (target) await fsp.rm(target, { force: true });
    if (error instanceof HttpError) throw error;
    const status = error.response ? error.response.status : 0;
    if (error.code === 'EPRIVATE' || error.cause?.code === 'EPRIVATE')
      throw badRequest('Adressen im internen Netz können nicht abgerufen werden.');
    if (error.code === 'ETOOLARGE' || error.code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED' || status === 413) throw tooBig();
    log.warn('Abruf per Link fehlgeschlagen', { user: username, url: new URL(url).host, error });
    if (status >= 400) throw badRequest(`Der Abruf ist fehlgeschlagen (HTTP ${status}).`);
    throw badGateway('Die Adresse konnte nicht abgerufen werden.');
  }
}

module.exports = {
  EDITABLE,
  newFilename,
  rawOptions,
  resolveOptions,
  linksFor,
  analyzeLater,
  accept,
  addVersion,
  replaceImage,
  createText,
  fetchRemote,
};
