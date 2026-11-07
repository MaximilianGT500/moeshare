'use strict';

const express = require('express');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { HttpError, badRequest, forbidden, notFound, unauthorized } = require('../lib/errors');
const { tr } = require('../lib/i18n');
const { integer, text } = require('../lib/input');
const { limiter } = require('../lib/limiter');
const { storedIp } = require('../lib/request');
const { requireApi, requireRecentAuth } = require('../middleware/auth');
const settings = require('../services/settingsService');
const users = require('../services/userService');
const audit = require('../services/auditService');
const links = require('../services/loginLinkService');
const integrations = require('../services/integrationService');

const router = express.Router();
const log = logger.scope('einmal-links');
const admin = requireApi({ admin: true });
const adminSudo = [admin, requireRecentAuth];

const assertEnabled = () => {
  if (!links.enabled()) throw forbidden('Einmal-Links sind auf diesem Server abgeschaltet.', { code: 'disabled' });
};

async function targetUser(id) {
  const row = await users.findById(integer(id));
  if (!row) throw notFound('Benutzer nicht gefunden.', { field: 'userId' });
  return row;
}

const wantsEmail = (value) => value === true || value === 'email';

async function deliver(req, link) {
  try {
    const sent = await links.sendToUser(link.id);
    audit.log('login_link_sent', { userId: link.user.id, actorId: req.user ? req.user.id : null, req, details: { link: link.id } });
    return { sent, mailError: null };
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return { sent: null, mailError: tr(req, error.message) };
  }
}

router.get('/api/admin/login-links', admin, async (req, res) => {
  const userId = integer(req.query.user);
  const [items, pending] = await Promise.all([links.list({ userId, limit: integer(req.query.limit) || 100 }), links.pendingCount()]);
  res.json({ links: items, pending });
});

router.post('/api/admin/login-links', adminSudo, async (req, res) => {
  assertEnabled();
  const user = await targetUser(req.body.userId);
  const { link, url } = await links.create({
    user,
    source: 'admin',
    actorId: req.user.id,
    minutes: req.body.minutes,
    redirect: req.body.redirect,
    note: req.body.note,
  });
  audit.log('login_link_created', { userId: user.id, actorId: req.user.id, req, details: { link: link.id, minutes: link.minutes } });
  const delivery = wantsEmail(req.body.email) ? await deliver(req, link) : { sent: null, mailError: null };
  res.json({ ok: true, link, url, ...delivery });
});

router.post('/api/admin/login-links/:id/approve', adminSudo, async (req, res) => {
  const { link, url } = await links.approve(req.params.id, req.user.id, { minutes: req.body.minutes });
  audit.log('login_link_approved', {
    userId: link.user.id,
    actorId: req.user.id,
    req,
    details: { link: link.id, integration: link.integration ? link.integration.name : undefined, minutes: link.minutes },
  });
  const delivery = wantsEmail(req.body.email) || link.delivery === 'email' ? await deliver(req, link) : { sent: null, mailError: null };
  res.json({ ok: true, link, url, ...delivery });
});

router.post('/api/admin/login-links/:id/deny', admin, async (req, res) => {
  const link = await links.deny(req.params.id, req.user.id);
  audit.log('login_link_denied', {
    userId: link.user.id,
    actorId: req.user.id,
    req,
    details: { link: link.id, integration: link.integration ? link.integration.name : undefined },
  });
  res.json({ ok: true, link });
});

router.post('/api/admin/login-links/:id/reveal', adminSudo, async (req, res) => {
  const url = await links.urlOf(req.params.id);
  if (!url) throw notFound('Dieser Einmal-Link ist nicht mehr gültig.');
  res.json({ url });
});

router.post('/api/admin/login-links/:id/send', adminSudo, async (req, res) => {
  const link = await links.find(req.params.id);
  const sent = await links.sendToUser(link.id);
  audit.log('login_link_sent', { userId: link.user.id, actorId: req.user.id, req, details: { link: link.id } });
  res.json({ ok: true, sent });
});

router.delete('/api/admin/login-links/:id', admin, async (req, res) => {
  const { link, changed } = await links.revoke(req.params.id);
  if (changed) audit.log('login_link_revoked', { userId: link.user.id, actorId: req.user.id, req, details: { link: link.id } });
  res.json({ ok: true, link });
});

router.get('/api/admin/integrations', admin, async (req, res) => {
  res.json({ integrations: await integrations.list() });
});

const integrationAudit = (req, change, integration) =>
  audit.log('integration_changed', { userId: null, actorId: req.user.id, req, details: { change, name: integration.name } });

router.post('/api/admin/integrations', adminSudo, async (req, res) => {
  const { key, integration } = await integrations.create(req.user.id, req.body || {});
  integrationAudit(req, 'created', integration);
  res.json({ ok: true, key, integration });
});

router.patch('/api/admin/integrations/:id', adminSudo, async (req, res) => {
  const { after } = await integrations.update(req.params.id, req.body || {});
  integrationAudit(req, 'updated', after);
  res.json({ ok: true, integration: after });
});

router.post('/api/admin/integrations/:id/rotate', adminSudo, async (req, res) => {
  const { key, integration } = await integrations.rotate(req.params.id);
  integrationAudit(req, 'rotated', integration);
  res.json({ ok: true, key, integration });
});

router.delete('/api/admin/integrations/:id', adminSudo, async (req, res) => {
  const integration = await integrations.remove(req.params.id);
  integrationAudit(req, 'removed', integration);
  res.json({ ok: true });
});

const apiLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

async function integrationAuth(req, res, next) {
  const key = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!key) throw unauthorized('Der Schlüssel der Integration fehlt. Schick ihn im Header „Authorization: Bearer …“.');
  const integration = await integrations.resolve(key);
  if (!integration) {
    log.warn('Unbekannter Integrationsschlüssel', { ip: storedIp(req) });
    throw unauthorized('Dieser Schlüssel ist ungültig oder die Integration ist abgeschaltet.');
  }
  assertEnabled();
  req.integration = integration;
  return next();
}

const integrationApi = [apiLimiter, integrationAuth];

async function findTarget(body) {
  if (body.userId !== undefined && body.userId !== null && body.userId !== '') return users.findById(integer(body.userId));
  const email = text(body.email, 191).trim().toLowerCase();
  if (email) return db.get('SELECT * FROM users WHERE email = ? AND email_verified_at IS NOT NULL', [email]);
  const name = text(body.user ?? body.username, 64).trim();
  if (name) return users.findByName(name);
  throw badRequest('Gib an, für wen der Link ist: user (Benutzername), email oder userId.', { field: 'user' });
}

const present = (link, url = null) => ({
  id: link.id,
  status: link.status,
  user: link.user,
  minutes: link.minutes,
  note: link.note || null,
  redirect: link.redirect || null,
  createdAt: link.createdAt,
  expiresAt: link.expiresAt,
  decidedAt: link.decidedAt,
  usedAt: link.usedAt,
  ...(url ? { url } : {}),
});

router.get('/api/integrations/info', integrationApi, (req, res) => {
  const integration = req.integration;
  const max = Math.min(settings.get('auth.loginLinkMaxMinutes'), integration.maxMinutes || Infinity);
  res.json({
    name: integration.name,
    mode: integration.mode,
    allowAdmins: integration.allowAdmins,
    defaultMinutes: Math.min(settings.get('auth.loginLinkMinutes'), max),
    maxMinutes: max,
    pendingHours: links.PENDING_MS / 3600000,
  });
});

router.post('/api/integrations/login-links', integrationApi, async (req, res) => {
  const integration = req.integration;
  const body = req.body || {};
  const user = await findTarget(body);
  if (!user) throw notFound('Diesen Benutzer gibt es nicht.', { field: 'user' });
  if (user.role === 'admin' && !integration.allowAdmins) {
    throw forbidden('Diese Integration darf keine Einmal-Links für Admins anfordern.', { field: 'user' });
  }
  const pending = integration.mode === 'approval';
  const email = text(body.deliver, 20) === 'email';
  const { link, url } = await links.create({
    user,
    source: 'api',
    integration,
    requestedBy: integration.name,
    minutes: body.minutes,
    redirect: body.redirect,
    note: body.note,
    pending,
    delivery: email ? 'email' : null,
  });
  audit.log(pending ? 'login_link_requested' : 'login_link_created', {
    userId: user.id,
    actorId: null,
    req,
    details: { link: link.id, integration: integration.name, minutes: link.minutes },
  });
  if (pending) {
    links.notifyPending(link);
    return res.status(202).json(present(link));
  }
  const delivery = email ? await deliver(req, link) : null;
  return res.status(201).json({ ...present(link, url), ...(delivery ? { delivery } : {}) });
});

async function ownLink(req) {
  const link = await links.find(req.params.id).catch(() => null);
  if (!link || !link.integration || link.integration.id !== req.integration.id) throw notFound('Diesen Einmal-Link gibt es nicht (mehr).');
  return link;
}

router.get('/api/integrations/login-links/:id', integrationApi, async (req, res) => {
  const link = await ownLink(req);
  res.json(present(link, link.status === 'ready' ? await links.urlOf(link.id) : null));
});

router.delete('/api/integrations/login-links/:id', integrationApi, async (req, res) => {
  const current = await ownLink(req);
  const { link, changed } = await links.revoke(current.id, { integrationId: req.integration.id });
  if (changed) {
    audit.log('login_link_revoked', {
      userId: link.user.id,
      actorId: null,
      req,
      details: { link: link.id, integration: req.integration.name },
    });
  }
  res.json(present(link));
});

module.exports = router;
