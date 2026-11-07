'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn, spawnSync } = require('child_process');
require('./fonts');
const sharp = require('sharp');
const config = require('../config');
const logger = require('./logger');
const { removeLocation } = require('./geotags');
const { filePaths, baseNameOf, extensionOf } = require('./storage');

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

const seconds = (h, m, s) => Number(h) * 3600 + Number(m) * 60 + Number(s);

function ffmpeg(args, { onProgress = null, duration = 0 } = {}) {
  if (!ffmpegPath) return Promise.reject(new Error('FFmpeg ist nicht verfügbar.'));
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-50000);
      if (onProgress && duration > 0) {
        const times = [...String(chunk).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
        const last = times[times.length - 1];
        if (last) onProgress(Math.min(1, seconds(last[1], last[2], last[3]) / duration));
      }
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function probe(file) {
  const { stderr } = await ffmpeg(['-i', file]);
  const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  return {
    duration: duration ? seconds(duration[1], duration[2], duration[3]) : 0,
    video: /Stream #\d+:\d+.*?Video:/.test(stderr),
    audio: /Stream #\d+:\d+.*?Audio:/.test(stderr),
  };
}

async function cutVideo(source, target, { start, end, audio = true, onProgress }) {
  const length = Math.max(0.05, end - start);
  const { code, stderr } = await ffmpeg(
    [
      '-y',
      '-ss',
      start.toFixed(3),
      '-i',
      source,
      '-t',
      length.toFixed(3),
      '-map',
      '0:v:0',
      ...(audio ? ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', '160k'] : ['-an']),
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      target,
    ],
    { onProgress, duration: length }
  );
  if (code !== 0) throw new Error(lastLine(stderr));
}

async function makeGif(source, target, { start, end, fps = 15, width = 480, onProgress }) {
  const length = Math.max(0.05, end - start);
  const filter = `[0:v]fps=${fps},${SQUARE_PIXELS},scale='min(${width},iw)':-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const { code, stderr } = await ffmpeg(
    ['-y', '-ss', start.toFixed(3), '-t', length.toFixed(3), '-i', source, '-filter_complex', filter, '-loop', '0', target],
    { onProgress, duration: length }
  );
  if (code !== 0) throw new Error(lastLine(stderr));
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

const SQUARE_PIXELS = "scale='trunc(iw*if(gt(sar,0),sar,1)/2)*2':'trunc(ih/2)*2',setsar=1";
const POSTER_FILTER = `${SQUARE_PIXELS},scale=480:-2`;
const WEB_FILTER = `${SQUARE_PIXELS},scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`;
const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p'];
const AAC = ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'];
const BROWSER_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
const BROWSER_PIXELS = new Set(['yuv420p', 'yuvj420p']);
const MP4_FAMILY = new Set(['.mp4', '.m4v', '.mov']);

function streamBlocks(stderr) {
  const lines = stderr.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)Stream #\d+:\d+/.exec(lines[i]);
    if (!match) continue;
    const block = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      const indent = /^(\s*)/.exec(lines[j])[1].length;
      if (indent <= match[1].length || /^\s*Stream #/.test(lines[j])) break;
      block.push(lines[j]);
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

function parseVideoInfo(stderr) {
  const blocks = streamBlocks(stderr);
  const video = blocks.find((block) => /Video:/.test(block.split('\n')[0]) && !/\(attached pic\)/.test(block.split('\n')[0]));
  const audio = blocks.find((block) => /Audio:/.test(block.split('\n')[0]));
  const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const info = {
    duration: duration ? seconds(duration[1], duration[2], duration[3]) : 0,
    width: 0,
    height: 0,
    rotation: 0,
    codec: null,
    profile: null,
    pixelFormat: null,
    audioCodec: audio ? ((/Audio: ([a-z0-9_]+)/i.exec(audio) || [])[1] || '').toLowerCase() || null : null,
  };
  if (!video) return info;
  const line = video.split('\n')[0];
  const head = /Video: ([a-z0-9_]+)(?: \(([^)]*)\))?(?: \([^)]*\))?, ([a-z0-9_]+)/i.exec(line);
  if (head) {
    info.codec = head[1].toLowerCase();
    info.profile = head[2] || null;
    info.pixelFormat = head[3].toLowerCase();
  }
  const size = /Video:.*?[\s,](\d{2,5})x(\d{2,5})\b/.exec(line);
  if (!size) return info;
  let [width, height] = [Number(size[1]), Number(size[2])];
  const sar = /SAR (\d+):(\d+)/.exec(line);
  if (sar && Number(sar[1]) > 0 && Number(sar[2]) > 0 && sar[1] !== sar[2]) {
    width = Math.max(2, Math.round((width * Number(sar[1])) / Number(sar[2]) / 2) * 2);
  }
  const rotation = /rotation of (-?\d+(?:\.\d+)?)\s*degrees/i.exec(video) || /rotate\s*:\s*(-?\d+)/i.exec(video);
  info.rotation = rotation ? Math.round(Number(rotation[1])) : 0;
  if (Math.abs(info.rotation) % 180 === 90) [width, height] = [height, width];
  info.width = width;
  info.height = height;
  return info;
}

async function videoInfo(file) {
  const { stderr } = await ffmpeg(['-i', file]);
  return parseVideoInfo(stderr);
}

async function videoSize(file) {
  const { width, height } = await videoInfo(file);
  return { width, height };
}

function browserReady(info, filename) {
  const ext = String(extensionOf(filename) || '').toLowerCase();
  const audioReady = !info.audioCodec || BROWSER_AUDIO.has(info.audioCodec);
  let videoReady = false;
  if (info.codec === 'h264') {
    videoReady = MP4_FAMILY.has(ext) && BROWSER_PIXELS.has(info.pixelFormat) && !/10|4:2:2|4:4:4/.test(info.profile || '');
  } else if (info.codec === 'vp8' || info.codec === 'vp9') {
    videoReady = ext === '.webm' && BROWSER_PIXELS.has(info.pixelFormat);
  }
  return { video: videoReady, audio: audioReady, ready: videoReady && audioReady };
}

async function brightness(file) {
  const { channels } = await sharp(file, { failOn: 'none' }).stats();
  const colour = channels.slice(0, 3);
  return {
    mean: colour.reduce((sum, channel) => sum + channel.mean, 0) / colour.length,
    spread: colour.reduce((sum, channel) => sum + channel.stdev, 0) / colour.length,
  };
}

function posterSeeks(duration) {
  if (!(duration > 0)) return [1, 0];
  const last = Math.max(0, duration - 0.1);
  const points = [Math.min(Math.max(duration * 0.1, 0.5), 8), duration * 0.33, duration * 0.5, duration * 0.75, 0];
  return [...new Set(points.map((point) => Number(Math.min(point, last).toFixed(2))))];
}

async function videoPoster(file, target, info = null) {
  const details = info || (await videoInfo(file));
  let best = null;
  const tried = [];
  try {
    for (const [index, seek] of posterSeeks(details.duration).entries()) {
      const candidate = `${target}.${index}.part.jpg`;
      tried.push(candidate);
      const { code } = await ffmpeg([
        '-y',
        '-ss',
        String(seek),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        POSTER_FILTER,
        '-q:v',
        '4',
        candidate,
      ]);
      if (code !== 0 || !fs.existsSync(candidate)) continue;
      const light = await brightness(candidate).catch(() => ({ mean: 0, spread: 0 }));
      const score = Math.min(light.mean, 120) + light.spread * 2;
      if (!best || score > best.score) best = { candidate, score };
      if (light.mean >= 45 && light.spread >= 10) break;
    }
    if (!best) throw new Error('Aus dem Video ließ sich kein Bild gewinnen.');
    await fsp.rename(best.candidate, target);
  } finally {
    await Promise.all(
      tried.filter((candidate) => !best || candidate !== best.candidate).map((candidate) => fsp.rm(candidate, { force: true }))
    );
  }
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
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    WEB_FILTER,
    ...H264,
    ...AAC,
    '-sn',
    '-dn',
    '-start_number',
    '0',
    '-hls_time',
    '6',
    '-hls_playlist_type',
    'vod',
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

async function removeWebArtifacts(username, filename) {
  const paths = filePaths(username, filename);
  await Promise.all([paths.web, paths.webStarted, `${paths.web}.part`].map((file) => fsp.rm(file, { force: true })));
}

async function convertToWeb(username, filename, info) {
  const paths = filePaths(username, filename);
  const ready = browserReady(info, filename);
  await fsp.mkdir(paths.webDir, { recursive: true });
  await fsp.writeFile(paths.webStarted, '');
  const temporary = `${paths.web}.part`;
  const video = ready.video && !info.rotation ? ['-c:v', 'copy'] : ['-vf', WEB_FILTER, ...H264];
  const { code, stderr } = await ffmpeg([
    '-y',
    '-i',
    paths.file,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    ...video,
    ...AAC,
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-sn',
    '-dn',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    temporary,
  ]);
  await fsp.rm(paths.webStarted, { force: true });
  if (code !== 0) {
    await removeWebArtifacts(username, filename);
    throw new Error(lastLine(stderr));
  }
  await fsp.rename(temporary, paths.web);
  log.info('Video für Browser aufbereitet', { user: username, file: filename, codec: info.codec });
}

const heavy = { queue: [], busy: false };

function pump() {
  if (heavy.busy) return;
  const next = heavy.queue.shift();
  if (!next) return;
  heavy.busy = true;
  Promise.resolve()
    .then(next.task)
    .then(next.resolve, next.reject)
    .finally(() => {
      heavy.busy = false;
      pump();
    });
}

const queued = (task) =>
  new Promise((resolve, reject) => {
    heavy.queue.push({ task, resolve, reject });
    pump();
  });

function needsWebVersion(info, filename, mode) {
  if (mode === 'off' || !info || !info.codec) return false;
  return !browserReady(info, filename).ready;
}

async function transcode(username, filename, { hls = false, web = 'auto', info = null } = {}) {
  const errors = [];
  if (!ffmpegPath) return { errors, web: false, hls: false };
  const paths = filePaths(username, filename);
  const details = info || (await videoInfo(paths.file).catch(() => null));
  const wantsWeb = needsWebVersion(details, filename, web);
  let madeWeb = false;
  let madeHls = false;
  if (wantsWeb) {
    try {
      await queued(() => convertToWeb(username, filename, details));
      madeWeb = true;
    } catch (error) {
      errors.push(`Browser-Fassung: ${error.message}`);
    }
  } else if (fs.existsSync(paths.web)) {
    await removeWebArtifacts(username, filename);
  }
  if (hls) {
    try {
      await queued(() => convertToHls(username, filename));
      madeHls = true;
    } catch (error) {
      errors.push(`HLS: ${error.message}`);
    }
  }
  return { errors, web: madeWeb, hls: madeHls };
}

const stripLocation = (file) => removeLocation(file);

async function analyze(username, filename, type, options) {
  const paths = filePaths(username, filename);
  const result = { dominantColor: '#ffffff', width: 0, height: 0 };
  const errors = [];
  let info = null;
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
    info = await attempt('Auflösung', () => videoInfo(paths.file));
    if (info) Object.assign(result, { width: info.width, height: info.height });
    const poster = options.preview && (await attempt('Vorschau', () => videoPoster(paths.file, paths.poster, info))) !== null;
    if (poster && options.dominantColor)
      result.dominantColor = (await attempt('Farbe', () => accentColor(paths.poster))) || result.dominantColor;
  }

  return { result, errors, info };
}

module.exports = {
  ffmpegAvailable: Boolean(ffmpegPath),
  ffmpegVersion: detected ? detected.version : null,
  probe,
  cutVideo,
  makeGif,
  analyze,
  transcode,
  videoInfo,
  videoPoster,
  parseVideoInfo,
  browserReady,
  needsWebVersion,
  stripLocation,
  removeHlsArtifacts,
  removeWebArtifacts,
};
