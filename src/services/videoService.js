'use strict';

const fs = require('fs');
const sharp = require('sharp');
const db = require('../lib/db');
const logger = require('../lib/logger');
const media = require('../lib/media');
const { filePaths } = require('../lib/storage');
const { conflict, serviceUnavailable } = require('../lib/errors');
const settings = require('./settingsService');
const files = require('./fileService');
const jobs = require('./jobService');

const log = logger.scope('videos');

let current = null;

async function videoRecords() {
  const extensions = settings.get('uploads.formats.video');
  if (!extensions.length) return [];
  const rows = await db.all(
    `SELECT id, username, filename, syntax, resolution_width, resolution_height, dominant_color, storage FROM file_data
     WHERE deleted_at IS NULL AND (${extensions.map(() => "lower(filename) LIKE ? ESCAPE '!'").join(' OR ')}) ORDER BY id`,
    extensions.map((ext) => `%${db.escapeLike(ext.toLowerCase())}`)
  );
  return rows.filter((row) => files.typeOf(row.filename, row.syntax).type === 'video');
}

async function dimPoster(file) {
  if (!fs.existsSync(file)) return true;
  try {
    const { channels } = await sharp(file, { failOn: 'none' }).stats();
    return channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3 < 20;
  } catch {
    return true;
  }
}

async function repairOne(record) {
  const paths = filePaths(record.username, record.filename);
  const outcome = { size: false, poster: false, web: false, skipped: false };
  if (!fs.existsSync(paths.file)) return { ...outcome, skipped: true };
  const info = await media.videoInfo(paths.file);
  if (info.width && info.height && (Number(record.resolution_width) !== info.width || Number(record.resolution_height) !== info.height)) {
    await files.update(record.username, record.filename, {
      dominantColor: record.dominant_color || '#ffffff',
      width: info.width,
      height: info.height,
    });
    outcome.size = true;
  }
  if (settings.get('uploads.preview') && (await dimPoster(paths.poster))) {
    await media.videoPoster(paths.file, paths.poster, info);
    outcome.poster = true;
  }
  const mode = settings.get('uploads.webVideo');
  if (media.needsWebVersion(info, record.filename, mode) && !fs.existsSync(paths.web)) {
    const result = await media.transcode(record.username, record.filename, { web: mode, info });
    if (result.errors.length) throw new Error(result.errors.join('; '));
    outcome.web = result.web;
  }
  return outcome;
}

function start(actor) {
  if (!media.ffmpegAvailable) throw serviceUnavailable('Dafür braucht der Server FFmpeg.');
  if (current) throw conflict('Die Videos werden gerade schon aufbereitet.', { code: 'running', extra: { job: current.id } });
  const { job, ready } = jobs.start(actor, 'videos', async (progress) => {
    const records = await videoRecords();
    const result = { total: records.length, sizes: 0, posters: 0, web: 0, skipped: 0, failed: 0 };
    for (const [index, record] of records.entries()) {
      try {
        const outcome = await repairOne(record);
        if (outcome.size) result.sizes += 1;
        if (outcome.poster) result.posters += 1;
        if (outcome.web) result.web += 1;
        if (outcome.skipped) result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        log.warn('Video ließ sich nicht aufbereiten', { user: record.username, file: record.filename, error });
      }
      progress((index + 1) / Math.max(1, records.length), result);
    }
    log.info('Videos aufbereitet', result);
    return result;
  });
  current = job;
  ready.finally(() => {
    current = null;
  });
  return job;
}

const running = () => (current ? current.id : null);

module.exports = { start, running, repairOne, videoRecords };
