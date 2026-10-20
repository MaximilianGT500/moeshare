'use strict';

const express = require('express');
const { forbidden, tooLarge } = require('../lib/errors');
const { greeting } = require('../lib/format');
const { text } = require('../lib/input');
const { renderPage } = require('../lib/render');
const { requirePage, requireApi } = require('../middleware/auth');
const settings = require('../services/settingsService');
const files = require('../services/fileService');
const quota = require('../services/quotaService');
const uploads = require('../services/uploadService');
const viewer = require('../services/viewerService');

const router = express.Router();
const signedIn = requireApi();

const GALLERY_PAGE_SIZE = 40;

const quotaInfo = (limits) => ({ quotaBytes: limits.quotaBytes, usedBytes: limits.used });

router.get('/dashboard', requirePage(), async (req, res) => {
  const [stats, list, limits] = await Promise.all([
    files.userStats(req.user.username),
    files.listForUser(req.user.username, { page: 1, limit: GALLERY_PAGE_SIZE }),
    quota.limitsFor(req.user),
  ]);
  renderPage(res, {
    page: 'dashboard',
    title: 'Dashboard',
    data: {
      user: viewer.summary(req.user),
      greeting: greeting(),
      stats,
      files: list,
      maxUploadBytes: limits.maxFileBytes || null,
      quota: quotaInfo(limits),
      urlFetch: settings.get('uploads.urlFetch'),
    },
  });
});

router.get('/api/files', signedIn, async (req, res) => {
  res.json(
    await files.listForUser(req.user.username, {
      page: req.query.page,
      limit: req.query.limit,
      search: text(req.query.search, 200),
      type: text(req.query.type, 10),
      sort: text(req.query.sort, 10) || 'newest',
    })
  );
});

router.get('/api/stats-cards', signedIn, async (req, res) => {
  const [stats, limits] = await Promise.all([files.userStats(req.user.username), quota.limitsFor(req.user)]);
  res.json({ ...stats, quota: quotaInfo(limits) });
});

router.post('/api/fetch', signedIn, async (req, res) => {
  if (!settings.get('uploads.urlFetch')) throw forbidden('Das Hochladen per Link ist auf diesem Server abgeschaltet.');
  const limits = await quota.limitsFor(req.user);
  if (limits.remaining === 0) throw tooLarge(limits.message);
  res.json(await uploads.fetchRemote(req.user.username, req.body.url, limits));
});

module.exports = router;
