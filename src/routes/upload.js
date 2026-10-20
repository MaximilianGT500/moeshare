'use strict';

const express = require('express');
const multer = require('multer');
const { badRequest, tooLarge } = require('../lib/errors');
const { extensionOf, ensureUserDirs } = require('../lib/storage');
const { apiAuth } = require('../middleware/auth');
const files = require('../services/fileService');
const quota = require('../services/quotaService');
const uploads = require('../services/uploadService');
const webhook = require('../services/webhookService');

const router = express.Router();

const MULTIPART_OVERHEAD = 64 * 1024;

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
  const upload = multer({ storage, limits: limit ? { fileSize: limit, files: 1 } : { files: 1 } }).single('file');
  return new Promise((resolve, reject) => upload(req, res, (error) => (error ? reject(error) : resolve(req.file))));
}

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
  res.json(await uploads.accept(req.user.username, file.filename));
});

router.delete('/file/:filename', apiAuth, async (req, res) => {
  await files.remove(req.user.username, req.params.filename);
  webhook.notify('delete', 'Eine Datei wurde gelöscht', `Nutzername: **${req.user.username}**\nDatei: **${req.params.filename}**`);
  res.json({ success: true, message: 'Datei erfolgreich gelöscht' });
});

router.get('/files', apiAuth, async (req, res) => {
  res.json({ files: await files.namesFor(req.user.username) });
});

module.exports = router;
