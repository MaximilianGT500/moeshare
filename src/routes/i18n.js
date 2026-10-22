'use strict';

const express = require('express');
const i18n = require('../lib/i18n');

const router = express.Router();

router.get('/i18n/:file', (req, res, next) => {
  const match = /^(\w+)\.js$/.exec(req.params.file);
  const script = match && i18n.clientScript(match[1]);
  if (!script) return next();
  res.set('Cache-Control', req.query.v === script.version ? 'public, max-age=31536000, immutable' : 'no-cache');
  return res.type('application/javascript').send(script.body);
});

module.exports = router;
