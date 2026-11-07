'use strict';

const express = require('express');
const metrics = require('../services/metricsService');

const router = express.Router();

router.get('/metrics', async (req, res, next) => {
  if (!metrics.enabled()) return next();
  if (!metrics.authorized(req)) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).type('text/plain').send('Unauthorized\n');
  }
  res.set('Cache-Control', 'no-store');
  return res.type('text/plain; version=0.0.4; charset=utf-8').send(await metrics.render());
});

module.exports = router;
