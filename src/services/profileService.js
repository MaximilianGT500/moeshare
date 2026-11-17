'use strict';

const crypto = require('crypto');
const db = require('../lib/db');
const cache = require('../lib/cache');
const { badRequest, forbidden } = require('../lib/errors');
const settings = require('./settingsService');
const files = require('./fileService');
const albums = require('./albumService');
const designs = require('./designService');
const avatars = require('./avatarService');
const domains = require('./domainService');
const icons = require('./profileIconService');

const MAX_NAME = 60;
const MAX_BIO = 500;
const MAX_LINKS = 30;
const MAX_LABEL = 60;
const PAGE_SIZE = 30;
const LINK_LAYOUTS = ['row', 'list'];
const MAX_TIME = 8.64e15;
const SCHEME = /^(?:https?:\/\/|mailto:|tel:)/i;
const BUILTIN_ICON = /^[gb]:[a-z0-9-]{1,40}$/;
const EMOJI =
  /^(?=.*(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3))[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F\u20E3]{1,16}$/u;

const DEFAULT_PROFILE = Object.freeze({
  enabled: false,
  name: '',
  bio: '',
  links: [],
  linkLayout: 'row',
  showAlbums: true,
  showFiles: true,
  contactCard: false,
});

function parse(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

const softText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function legacyId(link, index) {
  const digest = crypto
    .createHash('sha256')
    .update(`${index}:${link.url || ''}:${link.label || ''}`)
    .digest('hex');
  return Number.parseInt(digest.slice(0, 11), 16) + 1;
}

const isId = (value) => Number.isSafeInteger(value) && value > 0;

function timeOf(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 && number < MAX_TIME ? Math.round(number) : null;
}

function iconOf(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value === 'auto') return 'auto';
  if (BUILTIN_ICON.test(value)) return value;
  if (value.startsWith('c:') && icons.isKey(value.slice(2))) return value;
  if (value.startsWith('e:') && EMOJI.test(value.slice(2))) return value;
  return 'auto';
}

function cleanLink(link, index) {
  if (!link || typeof link !== 'object') return null;
  const id = isId(link.id) ? link.id : legacyId(link, index);
  const label = softText(link.label, MAX_LABEL);
  if (link.type === 'heading') return label ? { id, type: 'heading', label, hidden: link.hidden === true } : null;
  if (!label || typeof link.url !== 'string' || !SCHEME.test(link.url)) return null;
  return {
    id,
    type: 'link',
    label,
    url: link.url,
    icon: iconOf(link.icon),
    style: link.style === 'icon' ? 'icon' : 'button',
    highlight: link.highlight === true,
    hidden: link.hidden === true,
    from: timeOf(link.from),
    until: timeOf(link.until),
  };
}

function uniqueIds(links) {
  const seen = new Set();
  return links.map((link) => {
    let { id } = link;
    while (seen.has(id)) id += 1;
    seen.add(id);
    return id === link.id ? link : { ...link, id };
  });
}

function clean(stored) {
  const links = Array.isArray(stored.links) ? uniqueIds(stored.links.map(cleanLink).filter(Boolean).slice(0, MAX_LINKS)) : [];
  return {
    enabled: stored.enabled === true,
    name: softText(stored.name, MAX_NAME),
    bio: softText(stored.bio, MAX_BIO),
    links,
    linkLayout: LINK_LAYOUTS.includes(stored.linkLayout) ? stored.linkLayout : 'row',
    showAlbums: stored.showAlbums !== false,
    showFiles: stored.showFiles !== false,
    contactCard: stored.contactCard === true,
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

function normalizeUrl(raw) {
  const value = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return `mailto:${value}`;
  if (/^\+?[0-9][0-9 ()./-]{4,30}$/.test(value)) return `tel:${value.replace(/[^0-9+]/g, '')}`;
  if (/^[^\s/]+\.[^\s]+$/.test(value)) return `https://${value}`;
  return value;
}

function validUrl(raw, field) {
  let parsed;
  try {
    parsed = new URL(normalizeUrl(raw));
  } catch {
    throw badRequest('Bitte eine vollständige Adresse mit https:// eingeben.', { field });
  }
  const target = decodeURIComponent(parsed.pathname || '');
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  if (parsed.protocol === 'mailto:') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) throw badRequest('Das ist keine gültige E-Mail-Adresse.', { field });
    return parsed.href;
  }
  if (parsed.protocol === 'tel:') {
    if (!/^\+?[0-9]{3,20}$/.test(target.replace(/[ ()./-]/g, ''))) throw badRequest('Das ist keine gültige Telefonnummer.', { field });
    return `tel:${target.replace(/[^0-9+]/g, '')}`;
  }
  throw badRequest('Erlaubt sind Adressen mit https://, E-Mail-Adressen und Telefonnummern.', { field });
}

function validIcon(value, field, iconKeys) {
  if (value === undefined || value === 'auto') return 'auto';
  if (value === null || value === '') return null;
  if (typeof value === 'string') {
    if (BUILTIN_ICON.test(value)) return value;
    if (value.startsWith('e:') && EMOJI.test(value.slice(2))) return value;
    if (value.startsWith('c:') && iconKeys.has(value.slice(2))) return value;
  }
  throw badRequest('Dieses Symbol gibt es nicht.', { field });
}

function validTime(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const time = timeOf(value);
  if (time === null) throw badRequest('Ungültiger Zeitpunkt.', { field });
  return time;
}

function flag(value, field) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw badRequest('Erwartet wird an oder aus.', { field });
  return value;
}

function validLinks(value, iconKeys) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('Erwartet wird eine Liste.', { field: 'links' });
  if (value.length > MAX_LINKS) throw badRequest(`Höchstens ${MAX_LINKS} Einträge.`, { field: 'links' });
  const ids = new Set();
  return value.map((link, index) => {
    const field = (name) => `links.${index}.${name}`;
    if (!link || typeof link !== 'object') throw badRequest('Ungültiger Eintrag.', { field: `links.${index}` });
    let id = isId(link.id) && !ids.has(link.id) ? link.id : crypto.randomInt(1, 2 ** 47);
    while (ids.has(id)) id = crypto.randomInt(1, 2 ** 47);
    ids.add(id);
    const label = text(link.label, field('label'), MAX_LABEL);
    if (link.type === 'heading') {
      if (!label) throw badRequest('Die Überschrift braucht einen Text.', { field: field('label') });
      return { id, type: 'heading', label, hidden: flag(link.hidden, field('hidden')) };
    }
    if (link.type !== undefined && link.type !== 'link') throw badRequest('Ungültiger Eintrag.', { field: field('type') });
    if (!label) throw badRequest('Jeder Link braucht eine Beschriftung.', { field: field('label') });
    const url = text(link.url, field('url'), 300);
    if (!url) throw badRequest('Bitte eine vollständige Adresse mit https:// eingeben.', { field: field('url') });
    if (link.style !== undefined && link.style !== 'button' && link.style !== 'icon') {
      throw badRequest('Ungültige Darstellung.', { field: field('style') });
    }
    const from = validTime(link.from, field('from'));
    const until = validTime(link.until, field('until'));
    if (from && until && until <= from) throw badRequest('Das Ende muss nach dem Beginn liegen.', { field: field('until') });
    return {
      id,
      type: 'link',
      label,
      url: validUrl(url, field('url')),
      icon: validIcon(link.icon, field('icon'), iconKeys),
      style: link.style === 'icon' ? 'icon' : 'button',
      highlight: flag(link.highlight, field('highlight')),
      hidden: flag(link.hidden, field('hidden')),
      from,
      until,
    };
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
  if (patch.links !== undefined) next.links = validLinks(patch.links, await icons.keysOf(user.id));
  if (patch.linkLayout !== undefined) {
    if (!LINK_LAYOUTS.includes(patch.linkLayout)) throw badRequest('Ungültige Darstellung.', { field: 'linkLayout' });
    next.linkLayout = patch.linkLayout;
  }
  for (const key of ['showAlbums', 'showFiles', 'contactCard']) {
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
  const row = await db.get('SELECT id, username, role, status, profile, created_at, avatar FROM users WHERE lower(username) = lower(?)', [
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

const isLive = (link, now) =>
  !link.hidden && (link.type !== 'link' || ((!link.from || now >= link.from) && (!link.until || now < link.until)));

function publicLinks(links, username, { now = Date.now() } = {}) {
  const custom = icons.enabled();
  const visible = links
    .filter((link) => isLive(link, now))
    .map((link) => {
      if (link.type === 'heading') return { id: link.id, type: 'heading', label: link.label };
      const own = typeof link.icon === 'string' && link.icon.startsWith('c:');
      return {
        id: link.id,
        type: 'link',
        label: link.label,
        url: link.url,
        icon: own && !custom ? 'auto' : link.icon,
        iconUrl: own && custom ? icons.urlFor(username, link.icon.slice(2)) : null,
        style: link.style,
        highlight: link.highlight,
      };
    });
  return visible.filter((entry, index) => {
    if (entry.type !== 'heading') return true;
    const next = visible.slice(index + 1).find((item) => item.type === 'heading' || item.style === 'button');
    return Boolean(next && next.type === 'link');
  });
}

async function removeIcon(user, key) {
  await icons.remove(user, key);
  const row = await readRow(user.id);
  const stored = parse(row && row.profile);
  if (!Array.isArray(stored.links)) return;
  let changed = false;
  stored.links = stored.links.map((link) => {
    if (!link || link.icon !== `c:${key}`) return link;
    changed = true;
    return { ...link, icon: 'auto' };
  });
  if (!changed) return;
  await db.run('UPDATE users SET profile = ? WHERE id = ?', [JSON.stringify(stored), user.id]);
  cache.clear();
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
      links: publicLinks(profile.links, row.username),
      linkLayout: profile.linkLayout,
      contactCard: profile.contactCard ? `/u/${encodeURIComponent(row.username)}/contact.vcf` : null,
      since: row.created_at ? Number(row.created_at) : null,
      url: domain ? `${domain}/` : profileUrls(row.username).profile,
      avatar: avatars.urlFor(row),
    },
    albums: albumList,
    files: fileList,
    design: style.design,
    css: style.css,
  };
}

module.exports = {
  DEFAULT_PROFILE,
  PAGE_SIZE,
  MAX_LINKS,
  get,
  update,
  setBlocked,
  profileUrls,
  findPublic,
  publicData,
  publicLinks,
  filesPage,
  removeIcon,
};
