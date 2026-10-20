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
const settings = require('./settingsService');
const files = require('./fileService');
const webhook = require('./webhookService');

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

function linksFor(username, filename) {
  const urls = files.urlsFor(username, filename);
  const previewed = settings.get('uploads.preview') && files.typeOf(filename).type === 'image';
  return { success: true, file: urls.direct, view: urls.view, preview: previewed ? urls.preview : urls.direct, delete: urls.delete };
}

function analyzeLater(username, filename, type) {
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

async function accept(username, filename, { via = 'upload' } = {}) {
  const { file } = filePaths(username, filename);
  const { type } = files.typeOf(filename);
  if (type === 'image' && settings.get('uploads.removeMetadata')) {
    await media
      .stripLocation(file)
      .catch((error) => log.warn('Standortdaten konnten nicht entfernt werden', { user: username, file: filename, error }));
  }
  const { size, birthtime } = await fsp.stat(file);
  await files.insert({ username, filename, sizeBytes: size, createdAt: birthtime });
  log.info('Datei hochgeladen', { user: username, file: filename, size: formatBytes(size), via: via === 'upload' ? undefined : via });
  analyzeLater(username, filename, type);
  const links = linksFor(username, filename);
  webhook.notify(
    'upload',
    'Neue Datei hochgeladen',
    `Dateiname: **${filename}**\nURL: **${links.view}**\nBenutzername: **${username}**\nGröße: **${formatBytes(size)}**`
  );
  return links;
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

async function fetchRemote(username, value, { limit, message }) {
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
    return await accept(username, filename, { via: 'link' });
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

module.exports = { newFilename, accept, fetchRemote };
