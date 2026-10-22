'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const cache = require('../lib/cache');
const db = require('../lib/db');
const { HttpError, notFound, gone, forbidden } = require('../lib/errors');
const { limiter } = require('../lib/limiter');
const { renderPage, renderMessage } = require('../lib/render');
const { isSafeFilename, isValidUsername, baseNameOf } = require('../lib/storage');
const { isCrawler } = require('../lib/crawlers');
const { sameOriginOnly } = require('../middleware/auth');
const { protectUpload } = require('../middleware/security');
const files = require('../services/fileService');
const embeds = require('../services/embedService');
const protection = require('../services/protectionService');
const storage = require('../services/storageService');
const domains = require('../services/domainService');
const stats = require('../services/statsService');
const { viewPage } = require('../services/viewService');

const router = express.Router();

const MISSING = 'Diese Datei gibt es nicht (mehr).';
const EXPIRED = 'Diese Datei ist abgelaufen und wurde gelöscht.';
const USED = 'Diese Datei ließ sich nur einmal abrufen und ist nicht mehr verfügbar.';
const BLOCKED = 'Diese Datei wurde von der Moderation gesperrt.';

const unlockLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });

async function existing(req, slug) {
  const record = await files.findBySlug(slug);
  if (!record || !storage.exists(record)) return null;
  return domains.servesOwner(req, record.username) ? record : null;
}

function refuse(res, access) {
  if (access.state === 'expired') return renderMessage(res, 410, EXPIRED, { title: 'Abgelaufen' });
  if (access.state === 'blocked') return renderMessage(res, 451, BLOCKED, { title: 'Inhalt gesperrt' });
  if (access.state === 'missing') return renderMessage(res, 404, MISSING);
  return renderMessage(res, 410, USED, { title: 'Nicht mehr verfügbar' });
}

const unavailable = (access) => ['expired', 'used', 'blocked', 'missing'].includes(access.state);

router.get('/view/:slug', async (req, res) => {
  const record = await existing(req, req.params.slug);
  if (!record) return renderMessage(res, 404, MISSING);
  const access = protection.fileAccess(req, record);
  if (unavailable(access)) return refuse(res, access);

  const domain = domains.requestOrigin(req);
  const page = await viewPage(record, { access, domain, locale: req.language === 'en' ? 'en_GB' : 'de_DE' });
  const crawler = isCrawler(req.get('user-agent'));
  if (access.state === 'open' && !access.owner) {
    if (crawler) stats.track(req, 'f', record.id, 'views');
    else if (!record.max_views) {
      files.incrementViews(record.id).catch(() => {});
      stats.track(req, 'f', record.id, 'views');
    }
  }
  if (
    access.state === 'open' &&
    crawler &&
    !protection.isProtected(record) &&
    !page.embed.enabled &&
    ['image', 'video'].includes(page.type)
  ) {
    return res.redirect(302, page.directUrl);
  }
  return renderPage(res, {
    page: 'view',
    title: page.type === 'locked' ? page.title : null,
    titleRaw: page.type === 'locked' ? null : page.title,
    head: page.head,
    data: page.data,
    noscript: page.noscript,
    scheme: page.data.design ? page.data.design.scheme : null,
  });
});

router.post('/view/:slug/unlock', sameOriginOnly, unlockLimiter, async (req, res) => {
  const record = await existing(req, req.params.slug);
  if (!record || !record.password_hash) throw notFound(MISSING);
  const access = protection.fileAccess(req, record);
  if (access.state === 'expired') throw gone(EXPIRED);
  if (access.state === 'blocked') throw new HttpError(451, BLOCKED);
  if (!(await protection.checkPassword(record.password_hash, typeof req.body.password === 'string' ? req.body.password : ''))) {
    throw forbidden('Das Passwort stimmt nicht.', { code: 'wrong_password', field: 'password' });
  }
  protection.grant(req, res, 'f', record.id);
  res.json({ ok: true });
});

router.post('/view/:slug/open', sameOriginOnly, unlockLimiter, async (req, res) => {
  const record = await existing(req, req.params.slug);
  if (!record) throw notFound(MISSING);
  const access = protection.fileAccess(req, record);
  if (access.state === 'expired') throw gone(EXPIRED);
  if (access.state === 'blocked') throw new HttpError(451, BLOCKED);
  if (access.state === 'locked') throw forbidden('Diese Datei ist mit einem Passwort geschützt.', { code: 'locked' });
  if (access.state === 'open') return res.json({ ok: true });
  if (access.state === 'used' || !(await files.consumeView(record, protection.GRANT_MS))) throw gone(USED, { code: 'used' });
  stats.track(req, 'f', record.id, 'views');
  protection.grant(req, res, 'g', record.id, protection.GRANT_MS);
  return res.json({ ok: true, until: Date.now() + protection.GRANT_MS });
});

router.get('/oembed/:slug', async (req, res) => {
  const record = await existing(req, req.params.slug);
  if (!record) throw notFound('Datei nicht gefunden');
  if (protection.isProtected(record) || record.blocked_at) return res.json({ version: '1.0', type: 'link' });
  return res.json(embeds.oembedFor(await embeds.embedFor(record)));
});

function downloadName(record) {
  if (record.original_name) return record.original_name;
  if (record.title) return `${record.title.replace(/[\\/:*?"<>|]+/g, '-')}${path.extname(record.filename)}`;
  return record.filename;
}

router.get('/download/:slug', async (req, res) => {
  const record = await existing(req, req.params.slug);
  if (!record) throw notFound('Datei nicht gefunden');
  const access = protection.fileAccess(req, record);
  if (unavailable(access)) return refuse(res, access);
  if (access.state !== 'open') return res.redirect(302, `/view/${encodeURIComponent(record.slug || record.filename)}`);
  if (!access.owner) stats.track(req, 'f', record.id, 'downloads');
  const relative = `${record.username}/${record.filename}`;
  const local = path.join(config.paths.uploads, relative);
  if (record.storage === 's3' && !fs.existsSync(local)) {
    return storage.sendRemote(req, res, relative, { cacheControl: 'private, no-store', downloadName: downloadName(record) });
  }
  return res.download(local, downloadName(record));
});

router.get('/delete/:slug', async (req, res) => {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(`/delete/${encodeURIComponent(req.params.slug)}`)}`);
  const record = await files.findBySlug(req.params.slug);
  const target = `/dashboard#loeschen=${encodeURIComponent(record ? record.filename : req.params.slug)}`;
  return res.redirect(target);
});

const FOLDERS = { original: '', preview: 'preview/', hls: 'm3u8/' };

function stemsOf(name) {
  const stem = name.replace(/\.[^.]+$/, '');
  const stems = [stem];
  const segment = /^(.*)_\d+$/.exec(stem);
  if (segment) stems.push(segment[1]);
  for (let cut = stem; /\d$/.test(cut) && cut.length > 1;) {
    cut = cut.slice(0, -1);
    stems.push(cut);
  }
  return [...new Set(stems)];
}

async function lookupOwner(user, kind, name) {
  const exact = await db.get('SELECT * FROM file_data WHERE username = ? AND filename = ?', [user, name]);
  if (exact || kind === 'original') return exact || null;
  for (const stem of stemsOf(name)) {
    const row = await db.get("SELECT * FROM file_data WHERE username = ? AND filename LIKE ? ESCAPE '!' ORDER BY id LIMIT 1", [
      user,
      `${db.escapeLike(stem)}.%`,
    ]);
    if (row && baseNameOf(row.filename) === stem) return row;
  }
  return null;
}

const ownerOf = (user, kind, name) => cache.remember(`owner:${kind}:${user}/${name}`, 10000, () => lookupOwner(user, kind, name));

async function replacedName(user, name) {
  if (!name.includes('.')) return null;
  const row = await db.get('SELECT filename FROM file_data WHERE username = ? AND slug = ? AND filename <> ? AND deleted_at IS NULL', [
    user,
    name,
    name,
  ]);
  return row ? row.filename : null;
}

function countsAsDirect(req) {
  if (req.method !== 'GET' || stats.isInternal(req)) return false;
  const range = req.get('range');
  return !range || /^bytes=0-/.test(range);
}

function serveUpload(kind) {
  return async (req, res) => {
    const { user, name } = req.params;
    if (!isValidUsername(user) || !isSafeFilename(name)) throw notFound('Datei nicht gefunden');
    if (!domains.servesOwner(req, user)) throw notFound('Datei nicht gefunden');
    const record = await ownerOf(user, kind, name);
    if (!record) {
      const current = kind === 'original' ? await replacedName(user, name) : null;
      if (!current) throw notFound('Datei nicht gefunden');
      res.set('Cache-Control', 'no-cache');
      return res.redirect(302, `/uploads/${encodeURIComponent(user)}/${encodeURIComponent(current)}`);
    }
    const access = protection.fileAccess(req, record);
    if (access.state === 'expired') throw gone(EXPIRED);
    if (access.state === 'missing') throw notFound('Datei nicht gefunden');
    if (access.state === 'blocked') throw new HttpError(451, BLOCKED);
    if (access.state !== 'open') throw forbidden('Diese Datei ist geschützt. Öffne sie über ihre Ansichtsseite.', { code: 'protected' });

    const guarded = protection.isProtected(record) || Boolean(record.expires_at) || Boolean(record.deleted_at);
    const cacheControl = guarded ? 'private, no-store' : name.endsWith('.m3u8') ? 'no-cache' : storage.IMMUTABLE;
    const relative = `${user}/${FOLDERS[kind]}${name}`;
    const file = path.join(config.paths.uploads, relative);
    if (kind === 'original' && !access.owner && countsAsDirect(req)) stats.track(req, 'f', record.id, 'direct');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    protectUpload(res, name);
    if (record.storage === 's3' && !fs.existsSync(file)) return storage.sendRemote(req, res, relative, { cacheControl });
    if (!fs.existsSync(file)) {
      const original = path.join(config.paths.uploads, user, record.filename);
      if (kind !== 'preview' || name !== record.filename || !fs.existsSync(original)) throw notFound('Datei nicht gefunden');
      res.setHeader('Cache-Control', guarded ? 'private, no-store' : 'no-cache');
      return res.sendFile(original, { cacheControl: false, dotfiles: 'deny' });
    }
    res.setHeader('Cache-Control', cacheControl);
    if (name.endsWith('.m3u8')) res.type('application/vnd.apple.mpegurl');
    return res.sendFile(file, { cacheControl: false, dotfiles: 'deny' });
  };
}

router.get('/uploads/:user/preview/:name', serveUpload('preview'));
router.get('/uploads/:user/m3u8/:name', serveUpload('hls'));
router.get('/uploads/:user/:name', serveUpload('original'));

module.exports = router;
