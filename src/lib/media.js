'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const sharp = require('sharp');
const config = require('../config');
const logger = require('./logger');
const { removeLocation } = require('./geotags');
const { filePaths, baseNameOf } = require('./storage');

const log = logger.scope('media');

function candidates() {
  if (config.ffmpegPath) return [config.ffmpegPath];
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, name));
}

const detected = (() => {
  for (const candidate of candidates()) {
    try {
      if (!fs.statSync(candidate).isFile()) continue;
      const probe = spawnSync(candidate, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
      if (probe.status !== 0) continue;
      const version = (/ffmpeg version (\S+)/.exec(probe.stdout || '') || [])[1] || null;
      return { path: candidate, version };
    } catch {}
  }
  log.warn('FFmpeg wurde nicht gefunden, Videovorschauen und Streaming sind aus', {
    hint: config.ffmpegPath
      ? `FFMPEG_PATH zeigt auf ${config.ffmpegPath}, dort liegt kein lauffähiges ffmpeg.`
      : 'Installiere ffmpeg oder setze FFMPEG_PATH.',
  });
  return null;
})();
const ffmpegPath = detected ? detected.path : null;

const lastLine = (text) => text.trim().split(/\r?\n/).pop() || 'Unbekannter Fehler';

function ffmpeg(args) {
  if (!ffmpegPath) return Promise.reject(new Error('FFmpeg ist nicht verfügbar.'));
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-50000);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function imagePreview(source, target) {
  await sharp(source, { failOn: 'none' }).rotate().webp({ quality: 50 }).toFile(target);
}

async function imageSize(file) {
  const { width = 0, height = 0, orientation = 1 } = await sharp(file, { failOn: 'none' }).metadata();
  return orientation >= 5 ? { width: height, height: width } : { width, height };
}

const toHsl = (r, g, b) => {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { saturation, lightness };
};

const hex = (value) => Math.round(value).toString(16).padStart(2, '0');

async function accentColor(file) {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .resize(64, 64, { fit: 'inside' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map();
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key) || [0, 0, 0, 0];
    bucket[0] += data[i];
    bucket[1] += data[i + 1];
    bucket[2] += data[i + 2];
    bucket[3] += 1;
    buckets.set(key, bucket);
  }

  const pixels = data.length / info.channels;
  const swatches = [...buckets.values()]
    .filter(([, , , count]) => count >= Math.max(2, pixels * 0.004))
    .map(([r, g, b, count]) => ({ rgb: [r / count, g / count, b / count], count, ...toHsl(r / count, g / count, b / count) }));
  const maxCount = Math.max(1, ...swatches.map((swatch) => swatch.count));

  const pick = (minSaturation, minLightness, maxLightness) =>
    swatches
      .filter((s) => s.saturation >= minSaturation && s.lightness >= minLightness && s.lightness <= maxLightness)
      .map((s) => ({
        ...s,
        score: 3 * (1 - Math.abs(s.saturation - 1)) + 6.5 * (1 - Math.abs(s.lightness - 0.5)) + 0.5 * (s.count / maxCount),
      }))
      .sort((a, b) => b.score - a.score)[0];

  const best = pick(0.35, 0.3, 0.7) || pick(0.2, 0.2, 0.8);
  return best ? `#${best.rgb.map(hex).join('')}` : '#ffffff';
}

async function videoSize(file) {
  const { stderr } = await ffmpeg(['-i', file]);
  const match = /Stream #\d+:\d+.*?Video:.*?[\s,](\d{2,5})x(\d{2,5})\b/.exec(stderr);
  if (!match) return { width: 0, height: 0 };
  const rotation = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(stderr);
  const quarterTurn = rotation && Math.abs(Math.round(Number(rotation[1]))) % 180 === 90;
  const [width, height] = [Number(match[1]), Number(match[2])];
  return quarterTurn ? { width: height, height: width } : { width, height };
}

async function videoPoster(file, target) {
  for (const seek of ['1', '0']) {
    const { code } = await ffmpeg(['-y', '-ss', seek, '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', target]);
    if (code === 0 && fs.existsSync(target)) return;
  }
  throw new Error('Aus dem Video ließ sich kein Bild gewinnen.');
}

async function removeHlsArtifacts(username, filename) {
  const { hlsDir } = filePaths(username, filename);
  const base = baseNameOf(filename);
  const entries = await fsp.readdir(hlsDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(base) || entry.endsWith(`-${base}`))
      .map((entry) => fsp.rm(path.join(hlsDir, entry), { force: true }))
  );
}

async function convertToHls(username, filename) {
  const paths = filePaths(username, filename);
  await fsp.mkdir(paths.hlsDir, { recursive: true });
  await fsp.writeFile(paths.hlsStarted, '');
  const { code, stderr } = await ffmpeg([
    '-y',
    '-i',
    paths.file,
    '-profile:v',
    'baseline',
    '-level',
    '3.0',
    '-start_number',
    '0',
    '-hls_time',
    '10',
    '-hls_list_size',
    '0',
    '-hls_segment_filename',
    path.join(paths.hlsDir, `${baseNameOf(filename)}_%d.ts`),
    '-f',
    'hls',
    paths.playlist,
  ]);
  await fsp.rm(paths.hlsStarted, { force: true });
  if (code !== 0) {
    await removeHlsArtifacts(username, filename);
    throw new Error(lastLine(stderr));
  }
  await fsp.writeFile(paths.hlsComplete, '');
  log.info('Video für Streaming umgewandelt', { user: username, file: filename });
}

const stripLocation = (file) => removeLocation(file);

async function analyze(username, filename, type, options) {
  const paths = filePaths(username, filename);
  const result = { dominantColor: '#ffffff', width: 0, height: 0 };
  const errors = [];
  const attempt = async (label, task) => {
    try {
      return await task();
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
      return null;
    }
  };

  if (type === 'image') {
    if (options.preview) await attempt('Vorschau', () => imagePreview(paths.file, paths.preview));
    Object.assign(result, await attempt('Auflösung', () => imageSize(paths.file)));
    if (options.dominantColor) result.dominantColor = (await attempt('Farbe', () => accentColor(paths.file))) || result.dominantColor;
  }

  if (type === 'video' && ffmpegPath) {
    Object.assign(result, await attempt('Auflösung', () => videoSize(paths.file)));
    const poster = options.preview && (await attempt('Vorschau', () => videoPoster(paths.file, paths.poster))) !== null;
    if (poster && options.dominantColor)
      result.dominantColor = (await attempt('Farbe', () => accentColor(paths.poster))) || result.dominantColor;
    if (options.hls) await attempt('HLS', () => convertToHls(username, filename));
  }

  return { result, errors };
}

module.exports = {
  ffmpegAvailable: Boolean(ffmpegPath),
  ffmpegVersion: detected ? detected.version : null,
  analyze,
  stripLocation,
  removeHlsArtifacts,
};
