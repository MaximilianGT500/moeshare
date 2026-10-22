'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const { badRequest, forbidden, notFound, tooLarge } = require('../lib/errors');
const { greeting } = require('../lib/format');
const { tr } = require('../lib/i18n');
const { text } = require('../lib/input');
const { resolveExpiry } = require('../lib/expiry');
const { renderPage } = require('../lib/render');
const { requirePage, requireApi } = require('../middleware/auth');
const settings = require('../services/settingsService');
const files = require('../services/fileService');
const preferences = require('../services/preferenceService');
const protection = require('../services/protectionService');
const quota = require('../services/quotaService');
const uploads = require('../services/uploadService');
const viewer = require('../services/viewerService');
const webhook = require('../services/webhookService');
const stats = require('../services/statsService');
const storage = require('../services/storageService');
const zips = require('../services/zipService');

const router = express.Router();
const signedIn = requireApi();

const GALLERY_PAGE_SIZE = 40;

const quotaInfo = (limits) => ({ quotaBytes: limits.quotaBytes, usedBytes: limits.used });

function uploadOptions(prefs, user) {
  return {
    urlStyle: prefs.urlStyle || settings.get('uploads.urlStyle'),
    expiry: prefs.expiry || settings.get('uploads.defaultExpiry'),
    maxExpiry: settings.get('uploads.maxExpiry'),
    domain: prefs.domain || 'base',
    domains: files.originsFor(user.username),
    texts: settings.get('uploads.texts'),
    textMaxBytes: settings.get('uploads.textMaxBytes'),
    links: settings.get('links.enabled'),
    albums: settings.get('albums.enabled'),
    trash: files.trashEnabled(),
    trashDays: settings.get('trash.days'),
    zip: settings.get('zip.enabled'),
    stats: settings.get('stats.enabled'),
    profiles: settings.get('profiles.enabled'),
    editable: uploads.EDITABLE,
  };
}

const displayDomain = (prefs, username) => (prefs.domain && prefs.domain !== 'random' ? files.pickDomain(prefs.domain, username) : null);

router.get('/dashboard', requirePage(), async (req, res) => {
  const prefs = await preferences.get(req.user.id);
  const [userStats, list, limits, tags] = await Promise.all([
    files.userStats(req.user.username),
    files.listForUser(req.user.username, { page: 1, limit: GALLERY_PAGE_SIZE, domain: displayDomain(prefs, req.user.username) }),
    quota.limitsFor(req.user),
    files.tagsFor(req.user.username),
  ]);
  renderPage(res, {
    page: 'dashboard',
    title: 'Dashboard',
    data: {
      user: viewer.summary(req.user),
      greeting: tr(req, greeting()),
      stats: userStats,
      files: list,
      maxUploadBytes: limits.maxFileBytes || null,
      quota: quotaInfo(limits),
      urlFetch: settings.get('uploads.urlFetch'),
      options: uploadOptions(prefs, req.user),
      tags,
    },
  });
});

router.get('/api/files', signedIn, async (req, res) => {
  const prefs = await preferences.get(req.user.id);
  res.json(
    await files.listForUser(req.user.username, {
      page: req.query.page,
      limit: req.query.limit,
      search: text(req.query.search, 200),
      type: text(req.query.type, 10),
      sort: text(req.query.sort, 10) || 'newest',
      tag: text(req.query.tag, 40),
      album: req.query.album ? Number.parseInt(req.query.album, 10) || null : null,
      trash: req.query.trash === '1',
      domain: displayDomain(prefs, req.user.username),
    })
  );
});

function idList(raw) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return [...new Set(values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 500);
}

async function ownedRecords(user, ids, { deleted = false } = {}) {
  const records = [];
  for (const id of ids) {
    const record = await files.findById(id);
    if (record && record.username === user.username && Boolean(record.deleted_at) === deleted) records.push(record);
  }
  return records;
}

router.get('/api/files/zip', signedIn, async (req, res) => {
  if (!settings.get('zip.enabled')) throw notFound('Der ZIP-Download ist auf diesem Server abgeschaltet.');
  const records = await ownedRecords(req.user, idList(req.query.ids));
  if (!records.length) throw badRequest('Wähle mindestens eine Datei aus.');
  return zips.send(
    res,
    records,
    req.query.name ? text(req.query.name, 80) : `${req.user.username}-${new Date().toISOString().slice(0, 10)}`
  );
});

router.get('/api/stats/overview', signedIn, async (req, res) => {
  const overview = await stats.overview(req.user.username, { days: req.query.days });
  const records = await Promise.all(overview.top.map((entry) => files.findById(entry.id)));
  const top = overview.top
    .map((entry, index) => ({ ...entry, file: records[index] ? files.toFile(records[index]) : null }))
    .filter((entry) => entry.file);
  res.json({ ...overview, top });
});

router.get('/api/trash', signedIn, async (req, res) => {
  res.json({
    ...(await files.listForUser(req.user.username, { page: req.query.page, limit: req.query.limit, trash: true })),
    summary: await files.trashSummary(req.user.username),
  });
});

async function trashedFile(req) {
  const record = await files.findOwned(req.user.username, req.params.id, { deleted: true });
  if (!record) throw notFound('Diese Datei liegt nicht (mehr) im Papierkorb.');
  return record;
}

router.post('/api/trash/:id/restore', signedIn, async (req, res) => {
  const restored = await files.restore(await trashedFile(req));
  const [file] = await files.withTags([restored]);
  res.json({ ok: true, file });
});

router.delete('/api/trash/:id', signedIn, async (req, res) => {
  const record = await trashedFile(req);
  await files.removeRecord(record, 'trash');
  res.json({ ok: true, summary: await files.trashSummary(req.user.username) });
});

router.delete('/api/trash', signedIn, async (req, res) => {
  const count = await files.emptyTrash(req.user.username);
  if (count) webhook.notify('delete', 'Papierkorb geleert', `Nutzername: **${req.user.username}**\nAnzahl: **${count}**`);
  res.json({ ok: true, count, summary: await files.trashSummary(req.user.username) });
});

router.get('/api/tags', signedIn, async (req, res) => {
  res.json({ tags: await files.tagsFor(req.user.username) });
});

async function ownedFile(req) {
  const record = await files.findOwned(req.user.username, req.params.id);
  if (!record) throw notFound('Diese Datei gibt es nicht (mehr).');
  return record;
}

router.get('/api/files/:id', signedIn, async (req, res) => {
  const [file] = await files.withTags([await ownedFile(req)]);
  res.json({ file });
});

router.get('/api/files/:id/stats', signedIn, async (req, res) => {
  const record = await ownedFile(req);
  res.json(await stats.series('f', record.id, { days: req.query.days }));
});

router.get('/api/files/:id/content', signedIn, async (req, res) => {
  const record = await ownedFile(req);
  const relative = `${record.username}/${record.filename}`;
  const local = path.join(config.paths.uploads, relative);
  if (record.storage === 's3' && !fs.existsSync(local)) {
    return storage.sendRemote(req, res, relative, { cacheControl: 'private, no-store', proxy: true });
  }
  if (!fs.existsSync(local)) throw notFound('Diese Datei gibt es nicht (mehr).');
  res.set('Cache-Control', 'private, no-store');
  return res.sendFile(local, { dotfiles: 'deny', cacheControl: false });
});

router.patch('/api/files/:id', signedIn, async (req, res) => {
  const record = await ownedFile(req);
  const body = req.body || {};
  const fields = {};
  if (body.title !== undefined) fields.title = body.title ? String(body.title).replace(/\s+/g, ' ').trim().slice(0, 255) || null : null;
  if (body.expires !== undefined) {
    const expiry = resolveExpiry(body.expires, { max: settings.get('uploads.maxExpiry') });
    if (expiry.error)
      throw badRequest(expiry.error === 'too_long' ? 'So lange darf hier nichts bleiben.' : 'Ungültige Ablaufzeit.', { field: 'expires' });
    fields.expires_at = expiry.ms ? Date.now() + expiry.ms : null;
  }
  if (body.password !== undefined) {
    const hashed = body.password ? await protection.hashPassword(body.password) : null;
    if (hashed && hashed.error) throw badRequest('Das Passwort ist zu lang.', { field: 'password' });
    fields.password_hash = hashed;
  }
  if (body.maxViews !== undefined) {
    const count = body.maxViews === null || body.maxViews === '' ? 0 : Number(body.maxViews);
    if (!Number.isInteger(count) || count < 0 || count > 1000) throw badRequest('Erlaubt sind 1 bis 1000 Aufrufe.', { field: 'maxViews' });
    fields.max_views = count || null;
  }
  if (body.syntax !== undefined) {
    const syntax = body.syntax ? String(body.syntax).trim().toLowerCase() : null;
    if (syntax && !/^[a-z0-9+#-]{1,32}$/.test(syntax)) throw badRequest('Unbekannte Sprache.', { field: 'syntax' });
    fields.syntax = syntax;
  }
  if (body.listed !== undefined) {
    if (typeof body.listed !== 'boolean') throw badRequest('Erwartet wird an oder aus.', { field: 'listed' });
    fields.listed = body.listed ? 1 : 0;
  }
  let updated = await files.patch(record, fields);
  if (body.tags !== undefined) {
    await files.setTags(updated, body.tags);
    updated = await files.findById(record.id);
  }
  const [file] = await files.withTags([updated]);
  res.json({ file });
});

const BULK_ACTIONS = ['delete', 'tag', 'untag', 'expire', 'protect', 'unprotect', 'list', 'unlist', 'restore', 'purge'];
const TRASH_ACTIONS = ['restore', 'purge'];

router.post('/api/files/bulk', signedIn, async (req, res) => {
  const { action, ids } = req.body || {};
  if (!BULK_ACTIONS.includes(action)) throw badRequest('Unbekannte Aktion.');
  const wanted = idList(ids);
  if (!wanted.length) throw badRequest('Wähle mindestens eine Datei aus.');
  const records = await ownedRecords(req.user, wanted, { deleted: TRASH_ACTIONS.includes(action) });
  let expiresAt;
  if (action === 'expire') {
    const expiry = resolveExpiry(req.body.expires, { max: settings.get('uploads.maxExpiry') });
    if (expiry.error) throw badRequest('Ungültige Ablaufzeit.', { field: 'expires' });
    expiresAt = expiry.ms ? Date.now() + expiry.ms : null;
  }
  let passwordHash = null;
  if (action === 'protect') {
    passwordHash = await protection.hashPassword(req.body.password);
    if (!passwordHash || passwordHash.error) throw badRequest('Gib ein Passwort ein.', { field: 'password' });
  }
  let trashed = false;
  for (const record of records) {
    if (action === 'delete') trashed = (await files.discard(record, { actorId: req.user.id })).trashed || trashed;
    else if (action === 'restore') await files.restore(record);
    else if (action === 'purge') await files.removeRecord(record, 'trash');
    else if (action === 'list') await files.patch(record, { listed: 1 });
    else if (action === 'unlist') await files.patch(record, { listed: 0 });
    else if (action === 'tag') await files.addTags(record, req.body.tags);
    else if (action === 'untag') await files.removeTags(record, req.body.tags);
    else if (action === 'expire') await files.patch(record, { expires_at: expiresAt });
    else if (action === 'protect') await files.patch(record, { password_hash: passwordHash });
    else if (action === 'unprotect') await files.patch(record, { password_hash: null, max_views: null });
  }
  if (action === 'delete' && records.length) {
    webhook.notify(
      'delete',
      trashed ? 'Dateien in den Papierkorb gelegt' : 'Dateien gelöscht',
      `Nutzername: **${req.user.username}**\nAnzahl: **${records.length}**`
    );
  }
  res.json({ ok: true, count: records.length, trashed });
});

router.get('/api/stats-cards', signedIn, async (req, res) => {
  const [userStats, limits] = await Promise.all([files.userStats(req.user.username), quota.limitsFor(req.user)]);
  res.json({ ...userStats, quota: quotaInfo(limits) });
});

router.post('/api/fetch', signedIn, async (req, res) => {
  if (!settings.get('uploads.urlFetch')) throw forbidden('Das Hochladen per Link ist auf diesem Server abgeschaltet.');
  const limits = await quota.limitsFor(req.user);
  if (limits.remaining === 0) throw tooLarge(limits.message);
  res.json(await uploads.fetchRemote(req.user, req.body.url, limits, uploads.rawOptions(req)));
});

module.exports = router;
