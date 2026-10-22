'use strict';

const express = require('express');
const { notFound } = require('../lib/errors');
const { text, integer } = require('../lib/input');
const { limiter } = require('../lib/limiter');
const { renderPage } = require('../lib/render');
const { requireApi, sameOriginOnly, assertRecentAuth } = require('../middleware/auth');
const reports = require('../services/reportService');
const audit = require('../services/auditService');
const settings = require('../services/settingsService');

const router = express.Router();
const admin = requireApi({ admin: true });

const reportLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Du hast in kurzer Zeit schon viele Meldungen geschickt. Versuche es später erneut.',
});

router.get('/report', (req, res) => {
  if (!reports.enabled()) return res.redirect('/');
  return renderPage(res, {
    page: 'report',
    title: 'Inhalt melden',
    head: '<meta name="robots" content="noindex" />',
    data: { report: { url: text(req.query.url, 500), reasons: reports.REASONS } },
  });
});

router.post('/api/reports', sameOriginOnly, reportLimiter, async (req, res) => {
  const body = req.body || {};
  if (typeof body.website === 'string' && body.website.trim()) return res.json({ ok: true });
  const result = await reports.create({
    kind: text(body.kind, 16),
    target: text(body.target, 255),
    url: text(body.url, 600),
    reason: text(body.reason, 32),
    message: text(body.message, 2100),
    contact: text(body.contact, 200),
  });
  return res.json({ ok: true, duplicate: Boolean(result.duplicate) });
});

router.get('/api/admin/reports', admin, async (req, res) => {
  res.json(await reports.list({ status: text(req.query.status, 10), page: req.query.page }));
});

router.post('/api/admin/reports/:id/resolve', admin, async (req, res) => {
  const action = text(req.body.action, 16);
  if (action === 'delete' || action === 'suspend') assertRecentAuth(req);
  const result = await reports.resolve(integer(req.params.id), req.user, { action, note: text(req.body.note, 500) });
  audit.log('report_resolved', { userId: null, actorId: req.user.id, req, details: { report: integer(req.params.id), action } });
  res.json(result);
});

router.post('/api/admin/moderation', admin, async (req, res) => {
  const kind = text(req.body.kind, 16);
  const action = text(req.body.action, 16);
  if (!['block', 'unblock'].includes(action)) throw notFound('Unbekannte Aktion.');
  await reports.moderate(kind, integer(req.body.id), action, { actor: req.user, reason: text(req.body.reason, 200) });
  audit.log(action === 'block' ? 'content_blocked' : 'content_unblocked', {
    userId: null,
    actorId: req.user.id,
    req,
    details: { kind, id: integer(req.body.id) },
  });
  res.json({ ok: true, open: settings.get('reports.enabled') ? await reports.openCount() : 0 });
});

module.exports = router;
