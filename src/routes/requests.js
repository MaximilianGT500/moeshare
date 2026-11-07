'use strict';

const fsp = require('fs').promises;
const express = require('express');
const multer = require('multer');
const { badRequest } = require('../lib/errors');
const { limiter } = require('../lib/limiter');
const { renderPage } = require('../lib/render');
const { extensionOf, ensureUserDirs } = require('../lib/storage');
const { requireApi, sameOriginOnly } = require('../middleware/auth');
const requests = require('../services/requestService');
const uploads = require('../services/uploadService');
const audit = require('../services/auditService');

const router = express.Router();
const signedIn = requireApi();

const uploadLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  message: 'Zu viele Dateien in kurzer Zeit. Warte ein paar Minuten.',
});
const unlockLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 20 });

const originalNameOf = (file) => (file.originalname ? String(file.originalname).replace(/[\\/]/g, '_').slice(0, 255) : null);

router.get('/api/upload-requests', signedIn, async (req, res) => {
  res.json({ enabled: requests.enabled(), types: requests.TYPES, requests: await requests.list(req.user) });
});

router.post('/api/upload-requests', signedIn, async (req, res) => {
  const created = await requests.create(req.user, req.body);
  audit.log('upload_request_created', { userId: req.user.id, req, details: { request: created.id, title: created.title } });
  res.status(201).json({ request: created });
});

router.get('/api/upload-requests/:id', signedIn, async (req, res) => {
  res.json(await requests.filesOf(req.user, req.params.id));
});

router.patch('/api/upload-requests/:id', signedIn, async (req, res) => {
  res.json({ request: await requests.update(req.user, req.params.id, req.body) });
});

router.delete('/api/upload-requests/:id', signedIn, async (req, res) => {
  const removed = await requests.remove(req.user, req.params.id);
  audit.log('upload_request_deleted', { userId: req.user.id, req, details: { request: removed.id, title: removed.title } });
  res.json({ ok: true });
});

router.get('/r/:code', async (req, res) => {
  const row = await requests.byCode(req.params.code);
  const info = await requests.publicInfo(req, row);
  renderPage(res, {
    page: 'request',
    titleRaw: info.title,
    head: '<meta name="robots" content="noindex" />',
    data: { request: info },
  });
});

router.get('/api/requests/:code', async (req, res) => {
  const row = await requests.byCode(req.params.code);
  res.json({ request: await requests.publicInfo(req, row) });
});

router.post('/r/:code/unlock', sameOriginOnly, unlockLimiter, async (req, res) => {
  const row = await requests.byCode(req.params.code);
  await requests.unlock(req, res, row, req.body && req.body.password);
  res.json({ ok: true });
});

function receive(req, res, row, limit) {
  const storage = multer.diskStorage({
    destination(request, file, done) {
      try {
        done(null, ensureUserDirs(row.username).root);
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
    limits: { files: 1, fields: 4, fieldSize: 4096, ...(limit ? { fileSize: limit } : {}) },
  }).single('file');
  return new Promise((resolve, reject) => upload(req, res, (error) => (error ? reject(error) : resolve(req.file))));
}

router.post('/r/:code/upload', sameOriginOnly, uploadLimiter, async (req, res) => {
  const row = await requests.byCode(req.params.code);
  requests.assertOpen(req, row);
  const limit = await requests.limitFor(row);
  if (limit === 0) throw requests.tooBig(0);
  await requests.reserve(row);
  let file = null;
  let stored = false;
  try {
    try {
      file = await receive(req, res, row, limit);
    } catch (error) {
      if (error.code === 'LIMIT_FILE_SIZE') throw requests.tooBig(limit);
      throw error;
    }
    if (!file) throw badRequest('Keine Datei hochgeladen!');
    requests.assertType(row, file.originalname || file.filename);
    const owner = { id: row.user_id, username: row.username };
    const originalName = originalNameOf(file);
    const result = await requests.accept(row, owner, file, {
      name: req.body && req.body.name,
      note: req.body && req.body.note,
      originalName,
      accept: async () => {
        const options = await uploads.resolveOptions(owner, {});
        const links = await uploads.accept(owner, file.filename, { via: 'request', originalName, options });
        stored = true;
        return links;
      },
    });
    res.status(201).json(result);
  } catch (error) {
    if (!stored) {
      await requests.release(row).catch(() => {});
      if (file) await fsp.rm(file.path, { force: true }).catch(() => {});
    }
    throw error;
  }
});

module.exports = router;
