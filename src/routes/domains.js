'use strict';

const express = require('express');
const { text } = require('../lib/input');
const domains = require('../services/domainService');
const caddy = require('../services/caddyService');

const router = express.Router();

router.get(domains.PROBE_PATTERN, (req, res) => {
  res.json({ ok: true, instance: domains.instanceId() });
});

router.get('/api/domains/tls', (req, res) => {
  const domain = text(req.query.domain, 253);
  const reason = domains.certificateReason(domain);
  const allowed = reason === 'site' || reason === 'custom';
  if (domain) caddy.recordRequest(domain, allowed, reason).catch(() => {});
  if (allowed) return res.status(200).type('text/plain').send('ok');
  return res.status(404).type('text/plain').send('unknown');
});

module.exports = router;
