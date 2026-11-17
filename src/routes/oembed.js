'use strict';

const express = require('express');
const db = require('../lib/db');
const { isSealedName } = require('../lib/sealed');
const albums = require('../services/albumService');
const domains = require('../services/domainService');
const embeds = require('../services/embedService');
const files = require('../services/fileService');
const frames = require('../services/frameService');
const hotlink = require('../services/hotlinkService');
const paths = require('../services/pathService');
const profiles = require('../services/profileService');
const protection = require('../services/protectionService');
const settings = require('../services/settingsService');

const router = express.Router();

const ANONYMOUS = { user: null, cookies: {}, get: () => '' };
const DEFAULT_WIDTH = 640;
const BAR = 41;

function decoded(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function hostKind(url) {
  const known = [settings.get('site.baseUrl'), ...settings.get('site.domains')].map((origin) => {
    try {
      return new URL(origin).host.toLowerCase();
    } catch {
      return null;
    }
  });
  if (known.includes(url.host.toLowerCase())) return { custom: null };
  const custom = domains.ownerOfHost(url.hostname.toLowerCase());
  return custom ? { custom } : null;
}

async function fileBySlug(slug, owner) {
  const record = await files.findBySlug(slug);
  if (!record || (owner && record.username !== owner)) return null;
  return record;
}

async function resolve(raw) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = hostKind(url);
  if (!host) return null;
  const owner = host.custom ? host.custom.username : null;
  const segments = url.pathname.split('/').filter(Boolean).map(decoded);
  if (segments.length === 2 && segments[0] === 'a') {
    const row = await albums.findByCode(segments[1]);
    if (!row || (host.custom && Number(row.user_id) !== host.custom.userId)) return null;
    return { kind: 'album', row };
  }
  if (segments.length === 2 && segments[0] === 'u') {
    const found = await profiles.findPublic(segments[1]);
    if (!found || (owner && found.row.username !== owner)) return null;
    return { kind: 'profile', found };
  }
  if (segments.length === 2 && segments[0] === 'view') {
    const record = await fileBySlug(segments[1], owner);
    return record ? { kind: 'file', record } : null;
  }
  if (segments.length === 2) {
    const person = await paths.resolve(segments[0]);
    if (!person || (owner && person.username !== owner)) return null;
    const record = await fileBySlug(segments[1], person.username);
    return record ? { kind: 'file', record } : null;
  }
  if (segments.length === 1 && host.custom) {
    const record = await fileBySlug(segments[0], owner);
    return record ? { kind: 'file', record } : null;
  }
  return null;
}

function bounds(req) {
  const maxwidth = Number.parseInt(req.query.maxwidth, 10);
  const maxheight = Number.parseInt(req.query.maxheight, 10);
  return {
    maxwidth: Number.isFinite(maxwidth) && maxwidth > 0 ? Math.min(maxwidth, 2000) : null,
    maxheight: Number.isFinite(maxheight) && maxheight > 0 ? Math.min(maxheight, 2000) : null,
  };
}

function fit(width, height, { maxwidth, maxheight }) {
  let scale = 1;
  if (maxwidth && width > maxwidth) scale = Math.min(scale, maxwidth / width);
  if (maxheight && height > maxheight) scale = Math.min(scale, maxheight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function iframe(src, width, height, title) {
  return `<iframe src="${escapeAttr(src)}" width="${width}" height="${height}" style="border:0;border-radius:12px;max-width:100%" loading="lazy" allowfullscreen title="${escapeAttr(title)}"></iframe>`;
}

function base(title, author, provider = null) {
  const site = settings.get('site.baseUrl');
  return {
    version: '1.0',
    provider_name: (provider && provider.name) || settings.get('site.title'),
    provider_url: (provider && provider.url) || `${site}/`,
    title,
    ...(author && author.name ? { author_name: author.name } : {}),
    ...(author && author.url ? { author_url: author.url } : {}),
    cache_age: 3600,
  };
}

async function authorOf(username) {
  const found = await profiles.findPublic(username);
  if (!found || found.profile.blocked) return { name: username, url: null };
  return { name: found.profile.name || username, url: `${settings.get('site.baseUrl')}/u/${encodeURIComponent(found.row.username)}` };
}

async function fileEmbed(record, limits) {
  const access = protection.fileAccess(ANONYMOUS, record);
  if (access.state !== 'open' || isSealedName(record.filename) || typeof record.warning === 'string') return null;
  const file = files.toFile(record);
  const urls = files.urlsFor(record);
  const embed = await embeds.embedFor(record);
  const name = (embed.enabled && embed.title) || file.title || file.originalName || file.filename;
  const author = embed.enabled && embed.author ? { name: embed.author, url: embed.authorUrl || null } : await authorOf(record.username);
  const provider = embed.enabled && embed.siteName ? { name: embed.siteName, url: embed.siteUrl || null } : null;
  const width = Number(record.resolution_width) || 0;
  const height = Number(record.resolution_height) || 0;
  const visual = file.type === 'image' || file.type === 'video';
  const thumb = width && height ? fit(width, height, { maxwidth: 640, maxheight: 640 }) : null;
  const thumbFields =
    visual && urls.preview
      ? { thumbnail_url: urls.preview, ...(thumb ? { thumbnail_width: thumb.width, thumbnail_height: thumb.height } : {}) }
      : {};
  if (file.type === 'image' && !hotlink.enabled() && width && height) {
    return { ...base(name, author, provider), type: 'photo', url: urls.direct, ...fit(width, height, limits), ...thumbFields };
  }
  if (!frames.enabled()) return { ...base(name, author, provider), type: 'link', ...thumbFields };
  const frameWidth = Math.min(DEFAULT_WIDTH, limits.maxwidth || DEFAULT_WIDTH);
  let frameHeight = 240;
  if (file.type === 'audio') frameHeight = 130;
  else if (visual)
    frameHeight = Math.min(900, (width && height ? Math.round((frameWidth * height) / width) : Math.round(frameWidth * 0.5625)) + BAR);
  if (limits.maxheight) frameHeight = Math.min(frameHeight, limits.maxheight);
  const src = `${settings.get('site.baseUrl')}/frame/${encodeURIComponent(record.slug || record.filename)}`;
  return {
    ...base(name, author, provider),
    type: file.type === 'video' || file.type === 'audio' ? 'video' : 'rich',
    html: iframe(src, frameWidth, frameHeight, name),
    width: frameWidth,
    height: frameHeight,
    ...thumbFields,
  };
}

async function albumEmbed(row, limits) {
  if (!frames.enabled() || !settings.get('albums.enabled')) return null;
  if (row.visibility === 'private' || row.blocked_at || row.password_hash) return null;
  const owner = await db.get('SELECT username FROM users WHERE id = ?', [row.user_id]);
  const width = Math.min(DEFAULT_WIDTH, limits.maxwidth || DEFAULT_WIDTH);
  const height = Math.min(Math.round(width * 0.75), limits.maxheight || Infinity);
  const src = `${settings.get('site.baseUrl')}/frame/a/${encodeURIComponent(row.code)}`;
  return {
    ...base(row.title, owner ? await authorOf(owner.username) : null),
    type: 'rich',
    html: iframe(src, width, height, row.title),
    width,
    height,
  };
}

async function profileEmbed(found, limits) {
  if (!frames.enabled() || found.profile.blocked) return null;
  const width = Math.min(400, limits.maxwidth || 400);
  const height = Math.min(520, limits.maxheight || 520);
  const name = found.profile.name || found.row.username;
  const src = `${settings.get('site.baseUrl')}/frame/u/${encodeURIComponent(found.row.username)}`;
  return {
    ...base(name, { name, url: `${settings.get('site.baseUrl')}/u/${encodeURIComponent(found.row.username)}` }),
    type: 'rich',
    html: iframe(src, width, height, name),
    width,
    height,
  };
}

router.get('/oembed', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  const format = String(req.query.format || 'json').toLowerCase();
  if (format !== 'json') return res.status(501).json({ error: 'Nur JSON wird unterstützt.' });
  const target = await resolve(req.query.url);
  const limits = bounds(req);
  let result = null;
  if (target && target.kind === 'file') result = await fileEmbed(target.record, limits);
  if (target && target.kind === 'album') result = await albumEmbed(target.row, limits);
  if (target && target.kind === 'profile') result = await profileEmbed(target.found, limits);
  if (!result) return res.status(404).json({ error: 'Dafür gibt es nichts zum Einbetten.' });
  res.set('Cache-Control', 'public, max-age=600');
  return res.json(result);
});

module.exports = router;
