'use strict';

const fsp = require('fs').promises;
const express = require('express');
const multer = require('multer');
const { badRequest, tooLarge } = require('../lib/errors');
const { formatBytes } = require('../lib/format');
const { limiter } = require('../lib/limiter');
const { renderPage } = require('../lib/render');
const { extensionOf, ensureUserDirs } = require('../lib/storage');
const { requireApi, sameOriginOnly } = require('../middleware/auth');
const phone = require('../services/phoneService');
const uploads = require('../services/uploadService');
const quota = require('../services/quotaService');
const audit = require('../services/auditService');

const router = express.Router();
const signedIn = requireApi();

const createLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 20, message: 'Zu viele neue QR-Codes. Warte ein paar Minuten.' });
const uploadLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  limit: 150,
  message: 'Zu viele Dateien in kurzer Zeit. Warte ein paar Minuten.',
});

const originalNameOf = (file) => (file.originalname ? String(file.originalname).replace(/[\\/]/g, '_').slice(0, 255) : null);

router.post('/api/phone-links', signedIn, createLimiter, async (req, res) => {
  const created = await phone.create(req.user, req.body || {});
  audit.log('phone_link_created', { userId: req.user.id, req, details: { album: created.album ? created.album.title : undefined } });
  res.status(201).json({ link: created });
});

router.get('/api/phone-links/:id', signedIn, async (req, res) => {
  res.json({ link: await phone.status(req.user, req.params.id) });
});

router.post('/api/phone-links/:id/extend', signedIn, async (req, res) => {
  res.json({ link: await phone.extend(req.user, req.params.id) });
});

router.delete('/api/phone-links/:id', signedIn, async (req, res) => {
  res.json({ link: await phone.close(req.user, req.params.id) });
});

router.get('/m/:code', async (req, res, next) => {
  if (req.customDomain) return next();
  const row = await phone.byCode(req.params.code);
  if (!row) return next();
  return renderPage(res, {
    page: 'phone',
    title: 'Vom Handy hochladen',
    head: '<meta name="robots" content="noindex" />\n<meta name="referrer" content="no-referrer" />',
    data: { phone: await phone.publicInfo(row) },
  });
});

router.get('/api/phone/:code', async (req, res) => {
  res.set('Referrer-Policy', 'no-referrer');
  res.json({ phone: await phone.publicInfo(await phone.byCode(req.params.code)) });
});

function receive(req, res, username, limit) {
  const storage = multer.diskStorage({
    destination(request, file, done) {
      try {
        done(null, ensureUserDirs(username).root);
      } catch (error) {
        done(error);
      }
    },
    filename(request, file, done) {
      done(null, uploads.newFilename(extensionOf(file.originalname)));
    },
  });
  const upload = multer({
    storage,
    defParamCharset: 'utf8',
    limits: { files: 1, fields: 2, fieldSize: 1024, ...(limit ? { fileSize: limit } : {}) },
  }).single('file');
  return new Promise((resolve, reject) => upload(req, res, (error) => (error ? reject(error) : resolve(req.file))));
}

router.post('/api/phone/:code/files', sameOriginOnly, uploadLimiter, async (req, res) => {
  res.set('Referrer-Policy', 'no-referrer');
  const row = await phone.byCode(req.params.code);
  phone.assertOpen(row);
  const owner = { id: Number(row.user_id), username: row.username };
  const limits = await quota.limitsFor(owner);
  if (limits.limit === 0) throw tooLarge(limits.message);
  let file = null;
  let stored = false;
  try {
    try {
      file = await receive(req, res, row.username, limits.limit);
    } catch (error) {
      if (error.code === 'LIMIT_FILE_SIZE') throw tooLarge(limits.message || `Die Datei ist größer als ${formatBytes(limits.limit)}.`);
      throw error;
    }
    if (!file) throw badRequest('Keine Datei hochgeladen!');
    const options = await uploads.resolveOptions(owner, row.album_id ? { album: String(row.album_id) } : {});
    const links = await uploads.accept(owner, file.filename, { via: 'phone', originalName: originalNameOf(file), options });
    stored = true;
    await phone.recordUpload(row, links, req);
    res.status(201).json({ ok: true, file: { id: links.id, name: originalNameOf(file) || links.filename } });
  } catch (error) {
    if (!stored && file) await fsp.rm(file.path, { force: true }).catch(() => {});
    throw error;
  }
});

module.exports = router;
