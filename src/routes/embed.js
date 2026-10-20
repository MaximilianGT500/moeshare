'use strict';

const express = require('express');
const tpl = require('../lib/embedTemplate');
const { forbidden } = require('../lib/errors');
const { renderPage } = require('../lib/render');
const { requirePage, requireApi } = require('../middleware/auth');
const settings = require('../services/settingsService');
const embeds = require('../services/embedService');
const files = require('../services/fileService');
const audit = require('../services/auditService');
const viewer = require('../services/viewerService');

const router = express.Router();
const signedIn = requireApi();

async function builderData(user) {
  const [own, recent] = await Promise.all([embeds.userTemplate(user.id), files.listForUser(user.username, { page: 1, limit: 12 })]);
  return {
    own,
    defaultTemplate: settings.get('embed.default'),
    builtinTemplate: tpl.DEFAULT_TEMPLATE,
    allowCustom: settings.get('embed.allowUserTemplates'),
    samples: recent.files,
    siteTitle: settings.get('site.title'),
    dominantColors: settings.get('uploads.dominantColor'),
  };
}

router.get('/embed', requirePage(), async (req, res) => {
  const [embed, userStats, sudo] = await Promise.all([
    builderData(req.user),
    files.userStats(req.user.username),
    viewer.confirmMethods(req.user),
  ]);
  renderPage(res, { page: 'embed', title: 'Embed Builder', data: { user: viewer.summary(req.user), embed, userStats, sudo } });
});

router.put('/api/embed', signedIn, async (req, res) => {
  if (!settings.get('embed.allowUserTemplates')) {
    throw forbidden('Auf diesem Server gilt ein einheitliches Embed. Eigene Vorlagen sind abgeschaltet.');
  }
  await embeds.setUserTemplate(req.user.id, req.body.template);
  audit.log('embed_updated', { userId: req.user.id, req });
  res.json({ ok: true, template: await embeds.userTemplate(req.user.id) });
});

router.delete('/api/embed', signedIn, async (req, res) => {
  await embeds.setUserTemplate(req.user.id, null);
  res.json({ ok: true });
});

module.exports = router;
