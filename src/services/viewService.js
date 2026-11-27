'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { escapeHtml } = require('../lib/format');
const { displayPath } = require('../lib/slugs');
const { baseNameOf, filePaths } = require('../lib/storage');
const { isSealedName } = require('../lib/sealed');
const i18n = require('../lib/i18n');
const imaging = require('../lib/imaging');
const settings = require('./settingsService');
const files = require('./fileService');
const embeds = require('./embedService');
const storage = require('./storageService');
const designs = require('./designService');
const avatars = require('./avatarService');
const reactions = require('./reactionService');
const comments = require('./commentService');
const protection = require('./protectionService');
const frames = require('./frameService');
const profiles = require('./profileService');
const subtitles = require('./subtitleService');
const preferences = require('./preferenceService');
const exif = require('../lib/exif');

const TEXT_PREVIEW_BYTES = 512 * 1024;
const NOTEBOOK_PREVIEW_BYTES = 8 * 1024 * 1024;

function webState(record, type) {
  if (type !== 'video') return { ready: false, converting: false };
  const ready = storage.hasVariant(record, 'web');
  const converting = !ready && record.storage !== 's3' && fs.existsSync(filePaths(record.username, record.filename).webStarted);
  return { ready, converting };
}

function hlsState(record, type) {
  if (type !== 'video') return { ready: false, converting: false };
  const ready = storage.hasVariant(record, 'hls');
  const converting =
    !ready &&
    record.storage !== 's3' &&
    settings.get('uploads.hls') &&
    fs.existsSync(filePaths(record.username, record.filename).hlsStarted);
  return { ready, converting };
}

function lockedPage(record, access, { domain, locale }) {
  const urls = files.urlsFor(record, { domain });
  return {
    type: 'locked',
    title: record.password_hash ? 'Geschützte Datei' : 'Datei',
    head: embeds.metaTags(record, { enabled: false, themeColor: settings.get('site.uiColor') }, { domain, locale }),
    noscript: '<p style="font-family:system-ui,sans-serif;padding:24px">Diese Datei ist geschützt. Bitte aktiviere JavaScript.</p>',
    data: {
      locked: {
        state: access.state,
        slug: record.slug || record.filename,
        password: Boolean(record.password_hash),
        once: Boolean(record.max_views),
        expiresAt: record.expires_at ? Number(record.expires_at) : null,
      },
      urls: { view: urls.view },
      report: settings.get('reports.enabled') ? { kind: 'file', target: record.slug || record.filename } : null,
    },
  };
}

async function ownerProfile(username, domain) {
  const found = await profiles.findPublic(username);
  if (!found || found.profile.blocked) return null;
  return {
    name: found.profile.name || username,
    url: domain && domain !== settings.get('site.baseUrl') ? `${domain}/` : profiles.profileUrls(username).profile,
  };
}

async function commentHint(record, design) {
  if (!comments.enabled() || isSealedName(record.filename)) return null;
  const owner = await db.get('SELECT id FROM users WHERE username = ?', [record.username]);
  const allowed = comments.rights(
    {
      kind: 'f',
      id: record.id,
      ownerId: owner ? owner.id : null,
      override: record.comments === null || record.comments === undefined ? null : Number(record.comments),
      byDefault: !(design.show && design.show.comments === false),
    },
    null
  );
  return allowed.enabled ? { total: await comments.count('f', record.id) } : null;
}

async function fileView(record, { access = { state: 'open' }, domain = null } = {}) {
  const { username, filename } = record;
  const { type, isGif } = files.typeOf(filename, record.syntax);
  const urls = files.urlsFor(record, { domain });
  const local = `/uploads/${username}/${filename}`;
  const hls = hlsState(record, type);
  const web = webState(record, type);
  const dominant =
    typeof record.dominant_color === 'string' && record.dominant_color.toLowerCase() !== '#ffffff' ? record.dominant_color : null;
  const posterVersion = record.poster_ms !== null && record.poster_ms !== undefined ? `?v=${Math.abs(Number(record.poster_ms))}` : '';
  const poster = `/uploads/${username}/preview/${baseNameOf(filename)}.jpg${posterVersion}`;
  const slug = record.slug || filename;
  const camera = type === 'image' ? exif.stored(record.exif) : null;
  const [style, profile, avatar, tracks, visible] = await Promise.all([
    designs.forOwner(username),
    ownerProfile(username, domain),
    avatars.urlOf(username),
    type === 'video' ? subtitles.list(record.id) : [],
    camera ? preferences.cameraVisible(username) : new Set(),
  ]);
  const cameraPublic = visible.has(username);
  return {
    file: {
      id: record.id,
      slug,
      filename,
      title: record.title || null,
      description: record.description || null,
      alt: record.alt_text || null,
      originalName: record.original_name || null,
      type,
      isGif,
      syntax: type === 'text' ? files.syntaxOf(record) || 'plaintext' : null,
      textBytes: type === 'text' ? Number(record.size_bytes) || 0 : null,
      textPreview:
        type === 'text' &&
        (Number(record.size_bytes) || 0) <= (/\.ipynb$/i.test(record.filename) ? NOTEBOOK_PREVIEW_BYTES : TEXT_PREVIEW_BYTES),
      width: record.resolution_width || 0,
      height: record.resolution_height || 0,
      sizeBytes: record.size_bytes || 0,
      views: record.views || 0,
      date: record.creation_date || '',
      createdAt: record.created_at ? Number(record.created_at) : null,
      expiresAt: record.expires_at ? Number(record.expires_at) : null,
      once: Boolean(record.max_views),
      protected: Boolean(record.password_hash),
      username,
      avatar,
      owner: Boolean(access.owner),
      blocked: record.blocked_at ? { reason: record.blocked_reason || '' } : null,
      warning: record.warning === null || record.warning === undefined ? null : record.warning,
      version: Number(record.version) || 1,
      sealed: isSealedName(filename),
      camera: camera && (cameraPublic || access.owner) ? camera : null,
      cameraPublic,
      waveform: type === 'audio' ? files.peaksOf(record.waveform) : null,
      audio: type === 'audio' ? files.audioOf(record.audio_meta) : null,
      palette: type === 'image' || type === 'video' ? files.paletteOf(record.palette) : null,
    },
    urls: {
      view: urls.view,
      direct: urls.direct,
      raw: local,
      download: `/download/${displayPath(slug)}`,
      display: type === 'image' && !isGif && storage.hasVariant(record, 'preview') ? `/uploads/${username}/preview/${filename}` : local,
      poster: (type === 'video' || type === 'audio') && storage.hasVariant(record, 'poster') ? poster : null,
      hls: hls.ready ? `/uploads/${username}/m3u8/${path.basename(filePaths(username, filename).playlist)}` : null,
      playback: web.ready ? `/uploads/${username}/web/${path.basename(filePaths(username, filename).web)}` : null,
    },
    accent: type === 'image' ? dominant : null,
    hlsConverting: hls.converting,
    webConverting: web.converting,
    subtitles: tracks.map(({ id, language, label, default: preferred, url }) => ({ id, language, label, default: preferred, url })),
    design: style.design,
    css: style.css,
    profile,
    report: settings.get('reports.enabled') ? { kind: 'file', target: slug } : null,
    reactions: reactions.enabled() && !record.max_views && !isSealedName(filename) ? await reactions.counts('f', record.id) : null,
    comments: await commentHint(record, style.design),
    frame:
      frames.enabled() && !record.password_hash && !record.max_views && !isSealedName(filename)
        ? `${domain || settings.get('site.baseUrl')}/frame/${encodeURIComponent(slug)}`
        : null,
  };
}

async function viewPage(record, { access = { state: 'open' }, domain = null, locale = 'de_DE' } = {}) {
  if (access.state === 'locked' || access.state === 'once') return lockedPage(record, access, { domain, locale });
  const { type } = files.typeOf(record.filename, record.syntax);
  const embed = await embeds.embedFor(record);
  const label =
    record.title ||
    (isSealedName(record.filename) ? i18n.translate(locale === 'en_GB' ? 'en' : 'de', 'Verschlüsselte Datei') : null) ||
    record.original_name ||
    record.filename;
  const local = `/uploads/${record.username}/${record.filename}`;
  return {
    type,
    embed,
    directUrl: files.urlsFor(record, { domain }).direct,
    title: label,
    head: embeds.metaTags(record, embed, { domain, locale }),
    noscript: `<p style="font-family:system-ui,sans-serif;padding:24px"><a href="${escapeHtml(local)}">${escapeHtml(label)} öffnen</a></p>`,
    data: await fileView(record, { access, domain }),
  };
}

const blurCache = new Map();
const BLUR_CACHE = 64;

async function blurSource(record, type) {
  const paths = filePaths(record.username, record.filename);
  const relativeBase = `${record.username}/preview/`;
  if (type === 'video') {
    if (fs.existsSync(paths.poster)) return paths.poster;
    if (record.storage === 's3' && storage.hasVariant(record, 'poster'))
      return storage.readRemote(`${relativeBase}${baseNameOf(record.filename)}.jpg`);
    return null;
  }
  if (fs.existsSync(paths.preview)) return paths.preview;
  if (fs.existsSync(paths.file)) return paths.file;
  if (record.storage === 's3') return storage.readRemote(`${record.username}/${record.filename}`);
  return null;
}

async function blurredPreview(record) {
  const key = `${record.id}:${record.filename}`;
  if (blurCache.has(key)) return blurCache.get(key);
  const { type } = files.typeOf(record.filename, record.syntax);
  if (type !== 'image' && type !== 'video') return null;
  const source = await blurSource(record, type);
  if (!source) return null;
  const buffer = await imaging.blurred(source);
  blurCache.set(key, buffer);
  if (blurCache.size > BLUR_CACHE) blurCache.delete(blurCache.keys().next().value);
  return buffer;
}

async function sampleRecord(user) {
  const row = await db.get(
    `SELECT * FROM file_data WHERE username = ? AND ${files.LIVE} AND blocked_at IS NULL AND password_hash IS NULL AND max_views IS NULL
     ORDER BY CASE WHEN resolution_width > 0 THEN 0 ELSE 1 END, id DESC LIMIT 1`,
    [user.username]
  );
  return row && storage.exists(row) ? row : null;
}

module.exports = { viewPage, fileView, sampleRecord, blurredPreview, TEXT_PREVIEW_BYTES };
