'use strict';

const logger = require('../lib/logger');
const { HttpError, forbidden, unauthorized } = require('../lib/errors');
const { isSameOrigin } = require('../lib/request');
const sessions = require('../services/sessionService');
const tokens = require('../services/tokenService');
const settings = require('../services/settingsService');
const i18n = require('../lib/i18n');

const log = logger.scope('auth');
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LEGACY_COOKIE = 'token';

async function loadSession(req, res, next) {
  if (req.customDomain) return next();
  if (req.cookies[LEGACY_COOKIE]) res.clearCookie(LEGACY_COOKIE, { path: '/' });

  const token = req.cookies[sessions.COOKIE];
  if (!token) return next();
  try {
    const resolved = await sessions.resolve(token);
    if (!resolved) {
      res.clearCookie(sessions.COOKIE, { path: '/' });
      return next();
    }
    req.user = resolved.user;
    req.session = resolved.session;
    req.sessionToken = token;
    if (resolved.session.refreshed && resolved.session.persistent) {
      res.cookie(sessions.COOKIE, token, sessions.cookieOptions(req, resolved.session));
    }
  } catch (error) {
    log.error('Die Sitzung konnte nicht geprüft werden', { id: req.id, error });
  }
  return next();
}

function requirePage({ admin = false } = {}) {
  return (req, res, next) => {
    if (!req.user) {
      const target = req.originalUrl && req.originalUrl !== '/dashboard' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
      return res.redirect(`/login${target}`);
    }
    const setup = sessions.pendingSetup(req.user);
    if (setup && !req.path.startsWith('/account')) return res.redirect(`/account?setup=${setup}`);
    if (admin && !req.user.isAdmin) return res.redirect('/dashboard');
    return next();
  };
}

function assertSameOrigin(req) {
  if (UNSAFE_METHODS.has(req.method) && !isSameOrigin(req))
    throw forbidden('Die Anfrage kam nicht von dieser Seite und wurde blockiert.', { code: 'csrf' });
}

function setupError(setup) {
  const message = setup === 'password' ? 'Lege zuerst ein neues Passwort fest.' : 'Richte zuerst die Zwei-Faktor-Anmeldung ein.';
  return new HttpError(403, message, { code: 'setup_required', extra: { setup } });
}

function sameOriginOnly(req, res, next) {
  assertSameOrigin(req);
  next();
}

function requireApi({ admin = false, allowSetup = false } = {}) {
  return (req, res, next) => {
    if (!req.user) throw unauthorized('Deine Sitzung ist abgelaufen. Melde dich erneut an.', { code: 'unauthenticated' });
    assertSameOrigin(req);
    const setup = sessions.pendingSetup(req.user);
    if (setup && !allowSetup) throw setupError(setup);
    if (admin && !req.user.isAdmin) throw forbidden('Das dürfen nur Admins.', { code: 'forbidden' });
    next();
  };
}

const bearer = (req) =>
  String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

async function apiAuth(req, res, next) {
  const token = bearer(req);
  if (token) {
    const resolved = await tokens.resolve(token);
    if (!resolved) throw unauthorized('Ungültiges Token!');
    if (resolved.user.status !== 'active') throw forbidden('Dieses Konto ist gesperrt.');
    req.user = resolved.user;
    req.language = i18n.detect(req, settings);
    res.set('Content-Language', req.language);
    return next();
  }
  if (!req.user) throw unauthorized('Authentifizierungstoken fehlt!');
  assertSameOrigin(req);
  const setup = sessions.pendingSetup(req.user);
  if (setup) throw setupError(setup);
  return next();
}

function assertRecentAuth(req) {
  if (!req.session || !req.session.elevated) throw forbidden('Bestätige zuerst, dass du es bist.', { code: 'reauth_required' });
}

function requireRecentAuth(req, res, next) {
  assertRecentAuth(req);
  next();
}

module.exports = { loadSession, requirePage, requireApi, sameOriginOnly, apiAuth, assertRecentAuth, requireRecentAuth };
