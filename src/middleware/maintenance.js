'use strict';

const settings = require('../services/settingsService');
const { renderPage } = require('../lib/render');
const { tr } = require('../lib/i18n');

const ALWAYS = [
  /^\/login(?:\/|$)/,
  /^\/auth\//,
  /^\/api\/auth\//,
  /^\/api\/language$/,
  /^\/logout$/,
  /^\/healthz$/,
  /^\/metrics$/,
  /^\/impressum$/,
  /^\/datenschutz$/,
  /^\/favicon\.svg$/,
  /^\/favicon\.ico$/,
  /^\/api\/domains\/tls$/,
  /^\/\.well-known\//,
  /^\/setup(?:\/|$)/,
  /^\/api\/setup(?:\/|$)/,
];

const BLOCKED_WITH_VIEWS = [
  /^\/dashboard(?:\/|$)/,
  /^\/account(?:\/|$)/,
  /^\/design(?:\/|$)/,
  /^\/embed(?:\/|$)/,
  /^\/register(?:\/|$)/,
  /^\/r\//,
  /^\/admin(?:\/|$)/,
  /^\/upload(?:\/|$)/,
  /^\/file\//,
  /^\/delete\//,
  /^\/api\//,
];

const PUBLIC_API = [/^\/api\/profiles\/[^/]+\/files$/, /^\/api\/reports$/, /^\/api\/home$/];

function blocked(req) {
  if (ALWAYS.some((pattern) => pattern.test(req.path))) return false;
  if (!settings.get('maintenance.allowViews')) return true;
  if (PUBLIC_API.some((pattern) => pattern.test(req.path))) return false;
  if (/^\/(?:view|s|a)\/[^/]+\/unlock$/.test(req.path) || /^\/view\/[^/]+\/open$/.test(req.path)) return false;
  return BLOCKED_WITH_VIEWS.some((pattern) => pattern.test(req.path));
}

const wantsJson = (req) => req.path.startsWith('/api/') || req.method !== 'GET' || !String(req.get('accept') || '').includes('text/html');

function maintenance(req, res, next) {
  if (!settings.get('maintenance.enabled')) return next();
  if (req.user && req.user.isAdmin) return next();
  if (!blocked(req)) return next();
  const message = settings.get('maintenance.message') || 'Wir arbeiten gerade am Server. In Kürze ist alles wieder da.';
  res.set('Retry-After', '600');
  if (wantsJson(req)) return res.status(503).json({ error: tr(req, message), code: 'maintenance' });
  return renderPage(res, {
    page: 'notfound',
    title: 'Wartung',
    status: 503,
    data: { maintenance: true, message: tr(req, message), signedIn: Boolean(req.user) },
  });
}

module.exports = { maintenance };
