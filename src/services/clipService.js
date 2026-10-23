'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const media = require('../lib/media');
const { badRequest, tooLarge } = require('../lib/errors');
const { filePaths, userDirs } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');
const storage = require('./storageService');
const quota = require('./quotaService');
const uploads = require('./uploadService');
const jobs = require('./jobService');

const MAX_GIF_SECONDS = 30;
const MIN_LENGTH = 0.2;

function number(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw badRequest('Ungültige Zeitangabe.', { field });
  return parsed;
}

function integer(value, fallback, min, max, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw badRequest(`Erlaubt sind ${min} bis ${max}.`, { field });
  return parsed;
}

function validate(input = {}) {
  const format = input.format === 'gif' ? 'gif' : 'mp4';
  const start = number(input.start, 'start');
  const end = number(input.end, 'end');
  if (end - start < MIN_LENGTH) throw badRequest('Der Ausschnitt ist zu kurz.', { field: 'end' });
  if (format === 'gif' && end - start > MAX_GIF_SECONDS) {
    throw badRequest(`Ein GIF darf höchstens ${MAX_GIF_SECONDS} Sekunden lang sein.`, { field: 'end' });
  }
  return {
    format,
    start,
    end,
    target: format === 'mp4' && input.target === 'version' ? 'version' : 'new',
    audio: input.audio !== false,
    fps: integer(input.fps, 15, 5, 30, 'fps'),
    width: integer(input.width, 480, 120, 1280, 'width'),
  };
}

async function localSource(record) {
  const { file } = filePaths(record.username, record.filename);
  if (fs.existsSync(file)) return { file, release: async () => {} };
  const dir = path.join(userDirs(record.username).root, '.partial');
  await fsp.mkdir(dir, { recursive: true });
  const temporary = path.join(dir, `clip-${crypto.randomBytes(6).toString('hex')}${path.extname(record.filename)}`);
  const { stream } = await storage.openRead(record);
  await pipeline(stream, fs.createWriteStream(temporary));
  return { file: temporary, release: () => fsp.rm(temporary, { force: true }) };
}

async function run(user, record, plan, progress) {
  const source = await localSource(record);
  const ext = plan.format === 'gif' ? '.gif' : '.mp4';
  const filename = uploads.newFilename(ext);
  const out = filePaths(user.username, filename).file;
  try {
    const info = await media.probe(source.file);
    const end = info.duration ? Math.min(plan.end, info.duration) : plan.end;
    if (end - plan.start < MIN_LENGTH) throw badRequest('Der Ausschnitt liegt außerhalb des Videos.', { field: 'start' });
    if (plan.format === 'gif')
      await media.makeGif(source.file, out, { start: plan.start, end, fps: plan.fps, width: plan.width, onProgress: progress });
    else await media.cutVideo(source.file, out, { start: plan.start, end, audio: plan.audio && info.audio, onProgress: progress });
  } catch (error) {
    await fsp.rm(out, { force: true });
    throw error;
  } finally {
    await source.release();
  }
  const { size } = await fsp.stat(out);
  const limits = await quota.limitsFor(user);
  if ((limits.limit && size > limits.limit) || limits.remaining === 0) {
    await fsp.rm(out, { force: true });
    throw tooLarge(limits.message);
  }
  const base = String(record.original_name || record.title || record.filename).replace(/\.[^.]+$/, '');
  if (plan.target === 'version') {
    const updated = await uploads.addVersion(user, record, filename, {
      originalName: `${base}.mp4`,
      note: 'trimmed',
      process: false,
      via: 'clip',
    });
    const [file] = await files.withTags([updated]);
    return { kind: 'version', file };
  }
  const label = settings.get('site.language') === 'en' ? 'clip' : 'Ausschnitt';
  const options = { ...(await uploads.resolveOptions(user, {})), warning: record.warning === undefined ? null : record.warning };
  const links = await uploads.accept(user, filename, {
    via: 'clip',
    originalName: plan.format === 'gif' ? `${base}.gif` : `${base} (${label}).mp4`,
    options,
  });
  const [file] = await files.withTags([await files.findById(links.id)]);
  return { kind: 'file', links, file };
}

async function start(user, record, input) {
  if (files.typeOf(record.filename, record.syntax).type !== 'video') throw badRequest('Nur Videos lassen sich kürzen.');
  if (!media.ffmpegAvailable) throw badRequest('Dafür braucht der Server FFmpeg.');
  const plan = validate(input);
  const limits = await quota.limitsFor(user);
  if (limits.remaining === 0) throw tooLarge(limits.message);
  return jobs.start(user, plan.format === 'gif' ? 'gif' : 'clip', (progress) => run(user, record, plan, progress)).job;
}

module.exports = { start };
