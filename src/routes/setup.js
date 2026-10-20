'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { badRequest } = require('../lib/errors');
const { text, flag } = require('../lib/input');
const { renderPage } = require('../lib/render');
const { isSecure } = require('../lib/request');
const { sameOriginOnly } = require('../middleware/auth');
const settings = require('../services/settingsService');
const setup = require('../services/setupService');
const sessions = require('../services/sessionService');
const tokens = require('../services/tokenService');
const audit = require('../services/auditService');
const webhook = require('../services/webhookService');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche. Warte ein paar Minuten und versuche es dann erneut.' },
});

const guarded = [sameOriginOnly, limiter];
const tokenOf = (req) => text(req.body.token, 100);

router.get('/setup', async (req, res) => {
  if (!(await setup.isOpen())) return res.redirect('/login');
  const token = text(req.query.token, 100);
  const valid = await setup.verify(token);
  if (!valid) await setup.prepare({ onlyIfMissing: true });
  return renderPage(res, {
    page: 'setup',
    title: 'Einrichtung',
    data: {
      setup: {
        token: valid ? token : '',
        tokenRejected: Boolean(token) && !valid,
        settings: valid ? setup.wizardSettings() : null,
        suggestedBaseUrl: `${isSecure(req) ? 'https' : 'http'}://${req.get('host')}`,
        checks: valid ? setup.checks() : null,
        passwordMinLength: settings.get('auth.passwordMinLength'),
      },
    },
  });
});

router.post('/api/setup/validate', guarded, async (req, res) => {
  await setup.validate({ token: tokenOf(req), account: req.body.account, patch: req.body.settings });
  res.json({ ok: true });
});

router.post('/api/setup/webhook-test', guarded, async (req, res) => {
  const url = text(req.body.url, 300).trim();
  await setup.validate({ token: tokenOf(req), patch: { 'webhook.url': url } });
  const problem = await webhook.test(url || undefined);
  if (problem) throw badRequest(problem, { field: 'webhook.url' });
  res.json({ ok: true });
});

router.post('/api/setup', guarded, async (req, res) => {
  const user = await setup.complete({ token: tokenOf(req), account: req.body.account, patch: req.body.settings });
  audit.log('user_created', { userId: user.id, req, details: { via: 'setup', role: 'admin' } });
  const redirect = await sessions.start(req, res, user, { method: 'setup', next: '/dashboard' });
  const created = flag(req.body.createToken, false) ? await tokens.create(user.id, 'ShareX') : null;
  if (created) audit.log('token_created', { userId: user.id, req, details: { name: created.record.name } });
  res.json({ ok: true, redirect, username: user.username, token: created ? created.token : null, baseUrl: settings.get('site.baseUrl') });
});

module.exports = router;
