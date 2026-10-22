'use strict';

const express = require('express');
const { forbidden } = require('../lib/errors');
const { requirePage, requireApi } = require('../middleware/auth');
const settings = require('../services/settingsService');
const embeds = require('../services/embedService');
const audit = require('../services/auditService');

const router = express.Router();
const signedIn = requireApi();

router.get('/embed', requirePage(), (req, res) => res.redirect(302, '/design#embed'));

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
