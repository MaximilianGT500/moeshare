'use strict';

const express = require('express');
const fs = require('fs');
const { notFound } = require('../lib/errors');
const { renderPage, renderMessage } = require('../lib/render');
const { filePaths, isSafeFilename } = require('../lib/storage');
const files = require('../services/fileService');
const embeds = require('../services/embedService');
const { viewPage } = require('../services/viewService');

const router = express.Router();

async function existingFile(filename) {
  const record = isSafeFilename(filename) ? await files.findByFilename(filename) : null;
  return record && fs.existsSync(filePaths(record.username, record.filename).file) ? record : null;
}

router.get('/view/:filename', async (req, res) => {
  const record = await existingFile(req.params.filename);
  if (!record) return renderMessage(res, 404, 'Diese Datei gibt es nicht (mehr).');

  const page = await viewPage(record);
  const crawler = embeds.isCrawler(req.get('user-agent'));
  if (crawler && !page.embed.enabled && ['image', 'video'].includes(page.type)) return res.redirect(302, page.directUrl);

  renderPage(res, { page: 'view', title: page.title, head: page.head, data: page.data, noscript: page.noscript });
  if (!crawler) files.incrementViews(record.filename).catch(() => {});
  return undefined;
});

router.get('/oembed/:filename', async (req, res) => {
  const record = await existingFile(req.params.filename);
  if (!record) throw notFound('Datei nicht gefunden');
  res.json(embeds.oembedFor(await embeds.embedFor(record)));
});

router.get('/download/:filename', async (req, res) => {
  const record = await existingFile(req.params.filename);
  if (!record) throw notFound('Datei nicht gefunden');
  res.download(filePaths(record.username, record.filename).file, record.filename);
});

router.get('/delete/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!isSafeFilename(filename)) return renderMessage(res, 404, 'Diese Datei gibt es nicht (mehr).');
  const target = `/dashboard#loeschen=${encodeURIComponent(filename)}`;
  return res.redirect(req.user ? target : `/login?next=${encodeURIComponent(target)}`);
});

module.exports = router;
