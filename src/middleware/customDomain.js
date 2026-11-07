'use strict';

const settings = require('../services/settingsService');
const domains = require('../services/domainService');
const paths = require('../services/pathService');
const { tr } = require('../lib/i18n');

const PUBLIC_GET = [
  /^\/$/,
  /^\/view\/[^/]+$/,
  /^\/view\/[^/]+\/blur\.jpg$/,
  /^\/download\/[^/]+$/,
  /^\/oembed\/[^/]+$/,
  /^\/uploads\/[^/]+\/(?:preview\/|m3u8\/)?[^/]+$/,
  /^\/s\/[^/]+$/,
  /^\/a\/[^/]+$/,
  /^\/a\/[^/]+\/zip$/,
  /^\/u\/[^/]+$/,
  /^\/u\/[^/]+\/avatar$/,
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

function decoded(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function fileLink(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 1 || segments.length > 2 || pathname.endsWith('/')) return false;
  return !paths.isReserved(decoded(segments[0])) && !decoded(segments[0]).startsWith('.');
}

function allowed(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return PUBLIC_GET.some((pattern) => pattern.test(req.path)) || fileLink(req.path);
  if (req.method === 'POST') return PUBLIC_POST.some((pattern) => pattern.test(req.path));
  return false;
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

function ownDomainHeaders(req, res, next) {
  if (domains.ownerOfHost(domains.hostOf(req)) && res.get('Strict-Transport-Security')) {
    res.set('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
}

module.exports = { customDomain, ownDomainHeaders };
