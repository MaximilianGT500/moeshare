'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { escapeHtml } = require('../lib/format');
const { displayPath } = require('../lib/slugs');
const { baseNameOf, filePaths } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');
const embeds = require('./embedService');
const storage = require('./storageService');
const designs = require('./designService');
const profiles = require('./profileService');

const TEXT_PREVIEW_BYTES = 512 * 1024;

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

async function fileView(record, { access = { state: 'open' }, domain = null } = {}) {
  const { username, filename } = record;
  const { type, isGif } = files.typeOf(filename, record.syntax);
  const urls = files.urlsFor(record, { domain });
  const local = `/uploads/${username}/${filename}`;
  const hls = hlsState(record, type);
  const dominant =
    typeof record.dominant_color === 'string' && record.dominant_color.toLowerCase() !== '#ffffff' ? record.dominant_color : null;
  const poster = `/uploads/${username}/preview/${baseNameOf(filename)}.jpg`;
  const slug = record.slug || filename;
  const [style, profile] = await Promise.all([designs.forOwner(username), ownerProfile(username, domain)]);
  return {
    file: {
      id: record.id,
      slug,
      filename,
      title: record.title || null,
      originalName: record.original_name || null,
      type,
      isGif,
      syntax: type === 'text' ? files.syntaxOf(record) || 'plaintext' : null,
      textBytes: type === 'text' ? Number(record.size_bytes) || 0 : null,
      textPreview: type === 'text' && (Number(record.size_bytes) || 0) <= TEXT_PREVIEW_BYTES,
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
      owner: Boolean(access.owner),
      blocked: record.blocked_at ? { reason: record.blocked_reason || '' } : null,
    },
    urls: {
      view: urls.view,
      direct: urls.direct,
      raw: local,
      download: `/download/${displayPath(slug)}`,
      display: type === 'image' && !isGif && storage.hasVariant(record, 'preview') ? `/uploads/${username}/preview/${filename}` : local,
      poster: type === 'video' && storage.hasVariant(record, 'poster') ? poster : null,
      hls: hls.ready ? `/uploads/${username}/m3u8/${path.basename(filePaths(username, filename).playlist)}` : null,
    },
    accent: type === 'image' ? dominant : null,
    hlsConverting: hls.converting,
    design: style.design,
    css: style.css,
    profile,
    report: settings.get('reports.enabled') ? { kind: 'file', target: slug } : null,
  };
}

async function viewPage(record, { access = { state: 'open' }, domain = null, locale = 'de_DE' } = {}) {
  if (access.state === 'locked' || access.state === 'once') return lockedPage(record, access, { domain, locale });
  const { type } = files.typeOf(record.filename, record.syntax);
  const embed = await embeds.embedFor(record);
  const label = record.title || record.original_name || record.filename;
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

async function sampleRecord(user) {
  const row = await db.get(
    `SELECT * FROM file_data WHERE username = ? AND ${files.LIVE} AND blocked_at IS NULL AND password_hash IS NULL AND max_views IS NULL
     ORDER BY CASE WHEN resolution_width > 0 THEN 0 ELSE 1 END, id DESC LIMIT 1`,
    [user.username]
  );
  return row && storage.exists(row) ? row : null;
}

module.exports = { viewPage, fileView, sampleRecord, TEXT_PREVIEW_BYTES };
