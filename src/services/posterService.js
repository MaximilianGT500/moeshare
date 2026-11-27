'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const sharp = require('sharp');
const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const media = require('../lib/media');
const similarity = require('../lib/similarity');
const { badRequest, serviceUnavailable } = require('../lib/errors');
const { filePaths, userDirs, ensureUserDirs } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');
const storage = require('./storageService');

const fsp = fs.promises;
const log = logger.scope('poster');

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

async function localSource(record) {
  const { file } = filePaths(record.username, record.filename);
  if (fs.existsSync(file)) return { file, release: async () => {} };
  const dir = path.join(userDirs(record.username).root, '.partial');
  await fsp.mkdir(dir, { recursive: true });
  const temporary = path.join(dir, `poster-${crypto.randomBytes(6).toString('hex')}${path.extname(record.filename)}`);
  const { stream } = await storage.openRead(record);
  await pipeline(stream, fs.createWriteStream(temporary));
  return { file: temporary, release: () => fsp.rm(temporary, { force: true }) };
}

function assertVideo(record) {
  if (files.typeOf(record.filename, record.syntax).type !== 'video') throw badRequest('Ein Vorschaubild lässt sich nur für Videos wählen.');
}

async function finish(record, posterMs) {
  const target = filePaths(record.username, record.filename).poster;
  const colored = settings.get('uploads.dominantColor');
  const dominant = colored ? await media.accentColor(target).catch(() => null) : null;
  const colors = await media.palette(target).catch(() => null);
  const fields = { poster_ms: posterMs, palette: colors && colors.length ? colors.join(',') : '' };
  if (dominant) {
    fields.dominant_color = dominant;
    fields.color_family = similarity.familyOf(dominant);
  }
  await files.patch(record, fields);
  if (record.storage === 's3') await storage.storeVariant(record, 'poster');
  cache.clear();
  log.debug('Vorschaubild geändert', { user: record.username, file: record.filename, at: posterMs });
  return files.findById(record.id);
}

async function chooseFrame(record, seconds) {
  assertVideo(record);
  if (!media.ffmpegAvailable) throw serviceUnavailable('Für Vorschaubilder aus dem Video braucht der Server FFmpeg.');
  const at = Number(seconds);
  if (!Number.isFinite(at) || at < 0) throw badRequest('Ungültiger Zeitpunkt.', { field: 'at' });
  const source = await localSource(record);
  try {
    const info = await media.probe(source.file);
    if (info.duration && at > info.duration) throw badRequest('Der Zeitpunkt liegt hinter dem Ende des Videos.', { field: 'at' });
    ensureUserDirs(record.username);
    await media.posterAt(source.file, filePaths(record.username, record.filename).poster, at);
  } finally {
    await source.release().catch(() => {});
  }
  return finish(record, Math.round(at * 1000));
}

async function useImage(record, buffer) {
  assertVideo(record);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw badRequest('Es kam kein Bild an.', { field: 'image' });
  if (buffer.length > MAX_IMAGE_BYTES) throw badRequest('Das Bild ist zu groß. Erlaubt sind bis zu 15 MB.', { field: 'image' });
  const meta = await sharp(buffer, { failOn: 'none' })
    .metadata()
    .catch(() => null);
  if (!meta || !meta.width || !meta.height || !['jpeg', 'png', 'webp', 'avif', 'gif', 'heif', 'tiff'].includes(meta.format)) {
    throw badRequest('Das ist kein Bild, das sich verwenden lässt.', { field: 'image' });
  }
  if (meta.width * meta.height > MAX_PIXELS) throw badRequest('Das Bild hat zu viele Pixel.', { field: 'image' });
  ensureUserDirs(record.username);
  await media.posterFromImage(buffer, filePaths(record.username, record.filename).poster);
  return finish(record, -Date.now());
}

async function reset(record) {
  assertVideo(record);
  if (!media.ffmpegAvailable) throw serviceUnavailable('Für Vorschaubilder aus dem Video braucht der Server FFmpeg.');
  const source = await localSource(record);
  try {
    ensureUserDirs(record.username);
    await media.videoPoster(source.file, filePaths(record.username, record.filename).poster);
  } finally {
    await source.release().catch(() => {});
  }
  return finish(record, null);
}

async function forget(record) {
  await db.run('UPDATE file_data SET poster_ms = NULL WHERE id = ?', [record.id]);
}

module.exports = { chooseFrame, useImage, reset, forget, MAX_IMAGE_BYTES };
