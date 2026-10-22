'use strict';

const settings = require('../services/settingsService');
const domains = require('../services/domainService');
const { tr } = require('../lib/i18n');

const PUBLIC_GET = [
  /^\/$/,
  /^\/view\/[^/]+$/,
  /^\/download\/[^/]+$/,
  /^\/oembed\/[^/]+$/,
  /^\/uploads\/[^/]+\/(?:preview\/|m3u8\/)?[^/]+$/,
  /^\/s\/[^/]+$/,
  /^\/a\/[^/]+$/,
  /^\/a\/[^/]+\/zip$/,
  /^\/u\/[^/]+$/,
  /^\/api\/profiles\/[^/]+\/files$/,
  /^\/report$/,
  /^\/impressum$/,
  /^\/datenschutz$/,
  /^\/favicon\.svg$/,
  /^\/healthz$/,
  /^\/\.well-known\/moeshare\/domain$/,
];

const PUBLIC_POST = [
  /^\/view\/[^/]+\/(?:unlock|open)$/,
  /^\/s\/[^/]+\/unlock$/,
  /^\/a\/[^/]+\/unlock$/,
  /^\/api\/reports$/,
  /^\/api\/language$/,
];

function allowed(req) {
  const list = req.method === 'GET' || req.method === 'HEAD' ? PUBLIC_GET : req.method === 'POST' ? PUBLIC_POST : [];
  return list.some((pattern) => pattern.test(req.path));
}

function customDomain(req, res, next) {
  const entry = domains.ownerOfHost(domains.hostOf(req));
  if (!entry) return next();
  req.customDomain = entry;
  req.user = null;
  req.session = null;
  if (allowed(req)) return next();
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.redirect(302, `${settings.get('site.baseUrl')}${req.originalUrl}`);
  }
  return res.status(404).json({ error: tr(req, 'Nicht gefunden') });
}

module.exports = { customDomain };
