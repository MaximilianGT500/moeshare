'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const { badRequest, conflict, forbidden, notFound } = require('../lib/errors');
const settings = require('./settingsService');
const files = require('./fileService');
const albums = require('./albumService');
const links = require('./linkService');
const profiles = require('./profileService');
const domains = require('./domainService');
const users = require('./userService');
const sessions = require('./sessionService');
const emails = require('./emailService');
const webhook = require('./webhookService');

const log = logger.scope('reports');

const REASONS = ['illegal', 'copyright', 'privacy', 'spam', 'abuse', 'other'];
const KINDS = ['file', 'album', 'link', 'profile'];
const ACTIONS = ['dismiss', 'block', 'unblock', 'delete', 'suspend'];
const MAX_MESSAGE = 2000;
const DUPLICATE_MS = 10 * 60 * 1000;
const PAGE_SIZE = 30;

const enabled = () => settings.get('reports.enabled');

const missing = () => notFound('Diesen Inhalt gibt es nicht (mehr).');

const ownHosts = () =>
  [settings.get('site.baseUrl'), ...settings.get('site.domains')].map((origin) => new URL(origin).hostname.toLowerCase());

function segments(pathname) {
  return pathname
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

function parseUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw badRequest('Das ist keine gültige Adresse.', { field: 'url' });
  }
  const host = url.hostname.toLowerCase();
  const custom = domains.ownerOfHost(host);
  if (!ownHosts().includes(host) && !custom) throw badRequest('Diese Adresse gehört nicht zu dieser Seite.', { field: 'url' });
  const parts = segments(url.pathname);
  if (!parts.length && custom) return { kind: 'profile', key: custom.username };
  const [first, ...rest] = parts;
  if ((first === 'view' || first === 'download') && rest.length) return { kind: 'file', key: rest.join('/') };
  if (first === 'uploads' && rest.length >= 2) return { kind: 'upload', key: { username: rest[0], filename: rest[rest.length - 1] } };
  if (first === 'a' && rest.length) return { kind: 'album', key: rest[0] };
  if (first === 's' && rest.length) return { kind: 'link', key: rest.join('/') };
  if (first === 'u' && rest.length) return { kind: 'profile', key: rest[0] };
  throw badRequest('Unter dieser Adresse liegt kein Inhalt, den du melden kannst.', { field: 'url' });
}

async function resolveTarget(kind, key) {
  if (kind === 'file' || kind === 'upload') {
    const record =
      kind === 'file'
        ? await files.findBySlug(String(key))
        : await db.get('SELECT * FROM file_data WHERE username = ? AND filename = ? AND deleted_at IS NULL', [key.username, key.filename]);
    if (!record) throw missing();
    const owner = await db.get('SELECT id FROM users WHERE username = ?', [record.username]);
    return { kind: 'file', target: record.slug || record.filename, targetId: Number(record.id), ownerId: owner ? Number(owner.id) : null };
  }
  if (kind === 'album') {
    const row = await albums.findByCode(String(key));
    if (!row || row.visibility === 'private') throw missing();
    return { kind, target: row.code, targetId: Number(row.id), ownerId: Number(row.user_id) };
  }
  if (kind === 'link') {
    const row = await links.find(String(key));
    if (!row) throw missing();
    return { kind, target: row.code, targetId: Number(row.id), ownerId: Number(row.user_id) };
  }
  if (kind === 'profile') {
    const found = await profiles.findPublic(String(key));
    if (!found) throw missing();
    return { kind, target: found.row.username, targetId: Number(found.row.id), ownerId: Number(found.row.id) };
  }
  throw badRequest('Unbekannte Art von Inhalt.', { field: 'kind' });
}

function cleanContact(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > 191 || !settings.EMAIL_PATTERN.test(text))
    throw badRequest('Das ist keine gültige E-Mail-Adresse.', { field: 'contact' });
  return text;
}

async function create(input = {}) {
  if (!enabled()) throw forbidden('Meldungen sind auf diesem Server abgeschaltet.');
  const reason = REASONS.includes(input.reason) ? input.reason : null;
  if (!reason) throw badRequest('Wähle einen Grund aus.', { field: 'reason' });
  const message = typeof input.message === 'string' ? input.message.replace(/\r\n?/g, '\n').trim() : '';
  if (message.length > MAX_MESSAGE) throw badRequest(`Maximal ${MAX_MESSAGE} Zeichen.`, { field: 'message' });
  if ((reason === 'other' || reason === 'copyright') && message.length < 10) {
    throw badRequest('Beschreibe kurz, worum es geht.', { field: 'message' });
  }
  const contact = cleanContact(input.contact);
  const located = input.url ? parseUrl(input.url) : { kind: KINDS.includes(input.kind) ? input.kind : null, key: input.target };
  if (!located.kind || !located.key) throw badRequest('Es fehlt, was du melden möchtest.', { field: 'url' });
  const target = await resolveTarget(located.kind, located.key);
  const recent = await db.get(
    "SELECT id FROM reports WHERE kind = ? AND target_id = ? AND reason = ? AND status = 'open' AND created_at > ? AND COALESCE(message, '') = ?",
    [target.kind, target.targetId, reason, Date.now() - DUPLICATE_MS, message]
  );
  if (recent) return { ok: true, duplicate: true };
  const id = await db.insertRow('reports', {
    kind: target.kind,
    target: String(target.target).slice(0, 191),
    target_id: target.targetId,
    owner_id: target.ownerId,
    reason,
    message: message || null,
    contact,
    created_at: Date.now(),
    status: 'open',
  });
  const details = await describe(target.kind, target.targetId);
  log.info('Neue Meldung', { id, kind: target.kind, reason });
  webhook.notify(
    'report',
    'Neue Meldung',
    `Grund: **${emails.REASON_LABELS[reason]}**\nInhalt: ${details.url || target.target}${details.owner ? `\nBesitzer: **${details.owner}**` : ''}`,
    'error'
  );
  emails.notifyReport({ reason, target: target.target, url: details.url, message });
  return { ok: true, id };
}

async function describe(kind, id) {
  if (kind === 'file') {
    const record = await files.findById(id);
    if (!record) return { exists: false };
    const file = files.toFile(record);
    return {
      exists: true,
      label: file.title || file.originalName || file.filename,
      url: file.urls.view,
      preview: !record.password_hash && (file.type === 'image' || file.type === 'video') ? file.urls.preview : null,
      type: file.type,
      owner: record.username,
      blocked: Boolean(record.blocked_at),
      deleted: Boolean(record.deleted_at),
    };
  }
  if (kind === 'album') {
    const row = await db.get('SELECT a.*, u.username FROM albums a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?', [id]);
    if (!row) return { exists: false };
    return {
      exists: true,
      label: row.title,
      url: `${settings.get('site.baseUrl')}/a/${row.code}`,
      owner: row.username,
      blocked: Boolean(row.blocked_at),
    };
  }
  if (kind === 'link') {
    const row = await db.get('SELECT l.*, u.username FROM links l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = ?', [id]);
    if (!row) return { exists: false };
    return {
      exists: true,
      label: row.title || row.code,
      url: links.urlsFor(row).short,
      destination: row.url,
      owner: row.username,
      blocked: Boolean(row.blocked_at),
    };
  }
  if (kind === 'profile') {
    const row = await db.get('SELECT id, username, profile FROM users WHERE id = ?', [id]);
    if (!row) return { exists: false };
    const profile = await profiles.get(row.id);
    return {
      exists: true,
      label: profile.name || row.username,
      url: profiles.profileUrls(row.username).profile,
      owner: row.username,
      blocked: Boolean(profile.blocked),
    };
  }
  return { exists: false };
}

function present(row, target, similar) {
  return {
    id: Number(row.id),
    kind: row.kind,
    target: row.target,
    targetId: row.target_id ? Number(row.target_id) : null,
    reason: row.reason,
    message: row.message || '',
    contact: row.contact || null,
    createdAt: Number(row.created_at),
    status: row.status,
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : null,
    action: row.action || null,
    note: row.note || '',
    similar,
    details: target,
  };
}

async function list({ status = 'open', page = 1 } = {}) {
  const open = status !== 'closed';
  const where = open ? "status = 'open'" : "status <> 'open'";
  const total = await db.count(`SELECT COUNT(*) FROM reports WHERE ${where}`);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
  const rows = await db.all(`SELECT * FROM reports WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [
    PAGE_SIZE,
    (current - 1) * PAGE_SIZE,
  ]);
  const groups = await db.all("SELECT kind, target_id, COUNT(*) AS reports FROM reports WHERE status = 'open' GROUP BY kind, target_id");
  const counts = new Map(groups.map((group) => [`${group.kind}:${group.target_id}`, Number(group.reports)]));
  const described = new Map();
  const items = [];
  for (const row of rows) {
    const key = `${row.kind}:${row.target_id}`;
    if (!described.has(key)) described.set(key, await describe(row.kind, Number(row.target_id)));
    items.push(present(row, described.get(key), counts.get(key) || 0));
  }
  return { reports: items, total, page: current, pages, hasNext: current < pages, open: await openCount() };
}

const openCount = () => db.count("SELECT COUNT(*) FROM reports WHERE status = 'open'");

async function setBlocked(kind, id, reason) {
  const blockedAt = reason === null ? null : Date.now();
  const text = reason === null ? null : String(reason || '').slice(0, 200) || null;
  if (kind === 'file') await db.run('UPDATE file_data SET blocked_at = ?, blocked_reason = ? WHERE id = ?', [blockedAt, text, id]);
  else if (kind === 'album') await db.run('UPDATE albums SET blocked_at = ?, blocked_reason = ? WHERE id = ?', [blockedAt, text, id]);
  else if (kind === 'link') await db.run('UPDATE links SET blocked_at = ?, blocked_reason = ? WHERE id = ?', [blockedAt, text, id]);
  else if (kind === 'profile') await profiles.setBlocked(id, reason === null ? null : text || '');
  cache.clear();
}

async function ownerOf(kind, id) {
  if (kind === 'file') {
    const record = await files.findById(id);
    if (!record) return null;
    const owner = await db.get('SELECT id FROM users WHERE username = ?', [record.username]);
    return owner ? Number(owner.id) : null;
  }
  if (kind === 'album') return Number(((await db.get('SELECT user_id FROM albums WHERE id = ?', [id])) || {}).user_id) || null;
  if (kind === 'link') return Number(((await db.get('SELECT user_id FROM links WHERE id = ?', [id])) || {}).user_id) || null;
  if (kind === 'profile') return Number(id) || null;
  return null;
}

async function removeContent(kind, id) {
  if (kind === 'file') {
    const record = await files.findById(id);
    if (record) await files.removeRecord(record);
    return Boolean(record);
  }
  if (kind === 'album') {
    const row = await db.get('SELECT * FROM albums WHERE id = ?', [id]);
    if (!row) return false;
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM album_files WHERE album_id = ?', [row.id]);
      await tx.run("DELETE FROM stats_daily WHERE kind = 'a' AND ref_id = ?", [row.id]);
      await tx.run("DELETE FROM stats_sources WHERE kind = 'a' AND ref_id = ?", [row.id]);
      await tx.run('DELETE FROM albums WHERE id = ?', [row.id]);
    });
    return true;
  }
  if (kind === 'link') {
    const row = await db.get('SELECT * FROM links WHERE id = ?', [id]);
    if (row) await links.purge(row);
    return Boolean(row);
  }
  if (kind === 'profile') {
    await setBlocked('profile', id, 'Von der Moderation entfernt');
    return true;
  }
  return false;
}

async function moderate(kind, id, action, { actor, reason = '' } = {}) {
  if (!KINDS.includes(kind)) throw badRequest('Unbekannte Art von Inhalt.');
  if (!ACTIONS.includes(action)) throw badRequest('Unbekannte Aktion.');
  const targetId = Number(id);
  if (action === 'block') await setBlocked(kind, targetId, reason || 'Von der Moderation gesperrt');
  else if (action === 'unblock') await setBlocked(kind, targetId, null);
  else if (action === 'delete') await removeContent(kind, targetId);
  else if (action === 'suspend') {
    const ownerId = await ownerOf(kind, targetId);
    if (!ownerId) throw notFound('Zu diesem Inhalt gibt es kein Konto mehr.');
    const owner = await users.findById(ownerId);
    if (owner && owner.role === 'admin') throw badRequest('Admins lassen sich hier nicht sperren.');
    if (owner && owner.status === 'active') {
      await users.update(
        ownerId,
        { status: 'suspended', suspendedReason: reason || 'Gesperrt nach einer Meldung' },
        { actorId: actor ? actor.id : null }
      );
      await sessions.revokeAll(ownerId);
      await domains.refresh();
    }
  }
  log.info('Moderation', { kind, id: targetId, action, by: actor ? actor.username : undefined });
}

async function resolve(id, actor, { action, note = '' } = {}) {
  const row = Number.isSafeInteger(Number(id)) ? await db.get('SELECT * FROM reports WHERE id = ?', [Number(id)]) : null;
  if (!row) throw notFound('Diese Meldung gibt es nicht (mehr).');
  if (!ACTIONS.includes(action)) throw badRequest('Unbekannte Aktion.');
  if (row.status !== 'open' && action !== 'unblock') throw conflict('Diese Meldung ist schon erledigt.');
  const text = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  if (action !== 'dismiss')
    await moderate(row.kind, Number(row.target_id), action, { actor, reason: text || emails.REASON_LABELS[row.reason] });
  if (row.status === 'open') {
    await db.run(
      "UPDATE reports SET status = ?, resolved_at = ?, resolved_by = ?, action = ?, note = ? WHERE kind = ? AND target_id = ? AND status = 'open'",
      [action === 'dismiss' ? 'dismissed' : 'resolved', Date.now(), actor.id, action, text || null, row.kind, row.target_id]
    );
  }
  return { ok: true, open: await openCount() };
}

module.exports = { REASONS, KINDS, ACTIONS, enabled, parseUrl, create, list, describe, openCount, moderate, resolve };
