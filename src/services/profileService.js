'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const { badRequest, forbidden } = require('../lib/errors');
const settings = require('./settingsService');
const files = require('./fileService');
const albums = require('./albumService');
const designs = require('./designService');
const domains = require('./domainService');

const MAX_NAME = 60;
const MAX_BIO = 500;
const MAX_LINKS = 6;
const MAX_LABEL = 40;
const PAGE_SIZE = 30;

const DEFAULT_PROFILE = Object.freeze({ enabled: false, name: '', bio: '', links: [], showAlbums: true, showFiles: true });

function parse(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

const softText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function clean(stored) {
  const links = Array.isArray(stored.links)
    ? stored.links
        .filter((link) => link && typeof link.label === 'string' && typeof link.url === 'string' && /^https?:\/\//.test(link.url))
        .slice(0, MAX_LINKS)
        .map((link) => ({ label: link.label.slice(0, MAX_LABEL), url: link.url }))
    : [];
  return {
    enabled: stored.enabled === true,
    name: softText(stored.name, MAX_NAME),
    bio: softText(stored.bio, MAX_BIO),
    links,
    showAlbums: stored.showAlbums !== false,
    showFiles: stored.showFiles !== false,
    blocked: stored.blocked ? { at: Number(stored.blocked.at) || Date.now(), reason: softText(stored.blocked.reason, 200) } : null,
  };
}

function text(value, field, max, { multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw badRequest('Ungültiger Text.', { field });
  let result = value.replace(/\r\n?/g, '\n');
  result = multiline ? result.replace(/\n{3,}/g, '\n\n') : result.replace(/\s+/g, ' ');
  result = result.trim();
  if (result.length > max) throw badRequest(`Maximal ${max} Zeichen.`, { field });
  return result;
}

function validLinks(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('Erwartet wird eine Liste.', { field: 'links' });
  if (value.length > MAX_LINKS) throw badRequest(`Höchstens ${MAX_LINKS} Links.`, { field: 'links' });
  return value.map((link, index) => {
    const label = text(link && link.label, `links.${index}.label`, MAX_LABEL);
    const url = text(link && link.url, `links.${index}.url`, 300);
    if (!label) throw badRequest('Jeder Link braucht eine Beschriftung.', { field: `links.${index}.label` });
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw badRequest('Bitte eine vollständige Adresse mit https:// eingeben.', { field: `links.${index}.url` });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw badRequest('Nur http- und https-Adressen sind erlaubt.', { field: `links.${index}.url` });
    }
    return { label, url: parsed.href };
  });
}

async function readRow(userId) {
  return db.get('SELECT id, username, profile FROM users WHERE id = ?', [userId]);
}

async function get(userId) {
  const row = await readRow(userId);
  return clean(parse(row && row.profile));
}

async function update(user, patch = {}) {
  if (!settings.get('profiles.enabled')) throw forbidden('Profilseiten sind auf diesem Server abgeschaltet.');
  const row = await readRow(user.id);
  const stored = parse(row && row.profile);
  const current = clean(stored);
  const next = { ...current };
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') throw badRequest('Erwartet wird an oder aus.', { field: 'enabled' });
    next.enabled = patch.enabled;
  }
  if (patch.name !== undefined) next.name = text(patch.name, 'name', MAX_NAME);
  if (patch.bio !== undefined) next.bio = text(patch.bio, 'bio', MAX_BIO, { multiline: true });
  if (patch.links !== undefined) next.links = validLinks(patch.links);
  for (const key of ['showAlbums', 'showFiles']) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== 'boolean') throw badRequest('Erwartet wird an oder aus.', { field: key });
    next[key] = patch[key];
  }
  const saved = { ...next, blocked: stored.blocked || null };
  await db.run('UPDATE users SET profile = ? WHERE id = ?', [JSON.stringify(saved), user.id]);
  cache.clear();
  return get(user.id);
}

async function setBlocked(userId, reason) {
  const row = await readRow(userId);
  if (!row) return false;
  const stored = parse(row.profile);
  stored.blocked = reason === null ? null : { at: Date.now(), reason: String(reason || '').slice(0, 200) };
  await db.run('UPDATE users SET profile = ? WHERE id = ?', [JSON.stringify(stored), userId]);
  cache.clear();
  return true;
}

function profileUrls(username) {
  const base = `${settings.get('site.baseUrl')}/u/${encodeURIComponent(username)}`;
  const own = domains.originsFor(username);
  return { profile: base, domains: own.map((origin) => `${origin}/`) };
}

async function findPublic(username) {
  if (!settings.get('profiles.enabled') || typeof username !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(username)) return null;
  const row = await db.get('SELECT id, username, role, status, profile, created_at FROM users WHERE lower(username) = lower(?)', [
    username,
  ]);
  if (!row || row.status !== 'active') return null;
  const profile = clean(parse(row.profile));
  if (!profile.enabled) return null;
  return { row, profile };
}

function publicFiles(list) {
  return { items: list.files.map(albums.publicFile), page: list.page, hasNext: list.hasNext, total: list.total };
}

async function filesPage(username, page, domain) {
  const list = await files.listListed(username, { page, limit: PAGE_SIZE, domain });
  return publicFiles(list);
}

async function publicData(found, { domain = null } = {}) {
  const { row, profile } = found;
  const [albumList, fileList, style] = await Promise.all([
    profile.showAlbums ? albums.publicAlbums(row.id, { domain }) : [],
    profile.showFiles ? filesPage(row.username, 1, domain) : null,
    designs.forOwner(row.username),
  ]);
  return {
    profile: {
      id: Number(row.id),
      username: row.username,
      name: profile.name || row.username,
      bio: profile.bio,
      links: profile.links,
      since: row.created_at ? Number(row.created_at) : null,
      url: domain ? `${domain}/` : profileUrls(row.username).profile,
    },
    albums: albumList,
    files: fileList,
    design: style.design,
    css: style.css,
  };
}

module.exports = { DEFAULT_PROFILE, PAGE_SIZE, get, update, setBlocked, profileUrls, findPublic, publicData, filesPage };
