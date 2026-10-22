'use strict';

const fsp = require('fs').promises;
const express = require('express');
const multer = require('multer');
const { badRequest, tooLarge, notFound } = require('../lib/errors');
const { tr } = require('../lib/i18n');
const { extensionOf, ensureUserDirs } = require('../lib/storage');
const { apiAuth, requireApi } = require('../middleware/auth');
const files = require('../services/fileService');
const quota = require('../services/quotaService');
const settings = require('../services/settingsService');
const uploads = require('../services/uploadService');
const links = require('../services/linkService');
const webhook = require('../services/webhookService');

const router = express.Router();

const MULTIPART_OVERHEAD = 64 * 1024;
const TEXT_HARD_LIMIT = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(req, file, done) {
    try {
      done(null, ensureUserDirs(req.user.username).root);
    } catch (error) {
      done(error);
    }
  },
  filename(req, file, done) {
    done(null, uploads.newFilename(extensionOf(file.originalname)));
  },
});

function receive(req, res, limit) {
  const upload = multer({ storage, defParamCharset: 'utf8', limits: limit ? { fileSize: limit, files: 1 } : { files: 1 } }).single('file');
  return new Promise((resolve, reject) => upload(req, res, (error) => (error ? reject(error) : resolve(req.file))));
}

const originalNameOf = (file) => (file.originalname ? String(file.originalname).replace(/[\\/]/g, '_').slice(0, 255) : null);

router.post('/upload', apiAuth, async (req, res) => {
  const limits = await quota.limitsFor(req.user);
  const declared = Number.parseInt(req.get('content-length'), 10);
  if (limits.remaining === 0 || (limits.limit && declared > limits.limit + MULTIPART_OVERHEAD)) throw tooLarge(limits.message);

  let file;
  try {
    file = await receive(req, res, limits.limit);
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') throw tooLarge(limits.message);
    throw error;
  }
  if (!file) throw badRequest('Keine Datei hochgeladen!');
  let options;
  try {
    options = await uploads.resolveOptions(req.user, uploads.rawOptions(req));
  } catch (error) {
    await fsp.rm(file.path, { force: true });
    throw error;
  }
  res.json(await uploads.accept(req.user, file.filename, { originalName: originalNameOf(file), options }));
});

function textBody(limitBytes) {
  const size = Math.min(TEXT_HARD_LIMIT, limitBytes || TEXT_HARD_LIMIT) + 64 * 1024;
  const json = express.json({ limit: size });
  const form = express.urlencoded({ extended: false, limit: size });
  const plain = express.text({ limit: size, type: ['text/plain', 'text/markdown'] });
  return (req, res, next) =>
    json(req, res, (error) => {
      if (error) return next(error.type === 'entity.too.large' ? tooLarge('Der Text ist zu lang.') : error);
      return form(req, res, (formError) => {
        if (formError) return next(formError.type === 'entity.too.large' ? tooLarge('Der Text ist zu lang.') : formError);
        return plain(req, res, (plainError) =>
          next(plainError && plainError.type === 'entity.too.large' ? tooLarge('Der Text ist zu lang.') : plainError)
        );
      });
    });
}

const textParser = (req, res, next) => textBody(settings.get('uploads.textMaxBytes'))(req, res, next);

async function createText(req, res) {
  const limits = await quota.limitsFor(req.user);
  if (limits.remaining === 0) throw tooLarge(limits.message);
  const body = typeof req.body === 'string' ? { content: req.body } : req.body || {};
  const content = typeof body.content === 'string' ? body.content : typeof body.text === 'string' ? body.text : '';
  res.json(await uploads.createText(req.user, content, uploads.rawOptions({ ...req, body, get: (name) => req.get(name) }), limits));
}

router.post('/api/texts', apiAuth, textParser, createText);
router.post('/upload/text', apiAuth, textParser, createText);

router.post('/api/shorten', apiAuth, async (req, res) => {
  if (!settings.get('links.enabled')) throw notFound('Der Link-Kürzer ist auf diesem Server abgeschaltet.');
  const raw = uploads.rawOptions(req);
  const target = req.body.url || req.body.link || req.get('x-url');
  res.json(await links.create(req.user, target, raw));
});

router.delete('/file/:filename', apiAuth, async (req, res) => {
  const { record, trashed } = await files.remove(req.user.username, req.params.filename, { actorId: req.user.id });
  webhook.notify(
    'delete',
    trashed ? 'Eine Datei wurde in den Papierkorb gelegt' : 'Eine Datei wurde gelöscht',
    `Nutzername: **${req.user.username}**\nDatei: **${record.filename}**`
  );
  res.json({
    success: true,
    trashed,
    message: tr(req, trashed ? 'Datei in den Papierkorb gelegt' : 'Datei erfolgreich gelöscht'),
  });
});

router.post('/api/files/:id/replace', requireApi(), async (req, res) => {
  const record = await files.findOwned(req.user.username, req.params.id);
  if (!record) throw notFound('Diese Datei gibt es nicht (mehr).');
  if (files.typeOf(record.filename, record.syntax).type !== 'image') throw badRequest('Nur Bilder lassen sich bearbeiten.');
  const limits = await quota.limitsFor(req.user);
  const allowance = limits.quotaBytes ? Math.max(0, limits.quotaBytes - limits.used + Number(record.size_bytes || 0)) : null;
  const limit = [limits.maxFileBytes, allowance].filter((value) => value !== null && value !== undefined);
  let file;
  try {
    file = await receive(req, res, limit.length ? Math.min(...limit) : null);
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') throw tooLarge(limits.message);
    throw error;
  }
  if (!file) throw badRequest('Keine Datei hochgeladen!');
  const updated = await uploads.replaceImage(req.user, record, file.filename);
  const [result] = await files.withTags([updated]);
  res.json({ ok: true, file: result });
});

router.get('/files', apiAuth, async (req, res) => {
  res.json({ files: await files.namesFor(req.user.username) });
});

module.exports = router;
