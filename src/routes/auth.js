'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../lib/logger');
const ephemeral = require('../lib/ephemeral');
const { HttpError, badRequest, forbidden, gone, tooManyRequests, unauthorized } = require('../lib/errors');
const { text, flag } = require('../lib/input');
const { renderPage } = require('../lib/render');
const { Throttle } = require('../lib/throttle');
const { randomToken, safeEqual } = require('../lib/secrets');
const { safeNext, isSecure, storedIp } = require('../lib/request');
const { requireApi, sameOriginOnly } = require('../middleware/auth');
const settings = require('../services/settingsService');
const sessions = require('../services/sessionService');
const users = require('../services/userService');
const tokens = require('../services/tokenService');
const totp = require('../services/totpService');
const passkeys = require('../services/passkeyService');
const oauth = require('../services/oauthService');
const identities = require('../services/identityService');
const invites = require('../services/inviteService');
const setup = require('../services/setupService');
const audit = require('../services/auditService');
const webhook = require('../services/webhookService');

const router = express.Router();
const log = logger.scope('auth');

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche von deiner Verbindung. Warte ein paar Minuten und versuche es dann erneut.' },
});

const guarded = [sameOriginOnly, credentialLimiter];

const accountThrottle = new Throttle({ limit: 8, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 });
setInterval(() => accountThrottle.prune(), 10 * 60 * 1000).unref();

const LOGIN_ERRORS = {
  oauth_denied: (label) => `Du hast die Anmeldung bei ${label} abgebrochen.`,
  oauth_expired: () => 'Die Anmeldung ist abgelaufen. Bitte versuche es erneut.',
  oauth_failed: (label) => `${label} hat die Anmeldung nicht bestätigt. Bitte versuche es erneut.`,
  oauth_disabled: (label) => `Die Anmeldung mit ${label} ist auf diesem Server nicht aktiviert.`,
  oauth_no_account: (label) =>
    `Mit diesem ${label}-Konto ist noch kein Benutzer verknüpft. Melde dich anders an und verknüpfe ${label} unter Konto › Sicherheit.`,
  oauth_not_member: () => 'Neue Konten über Discord gibt es nur für Mitglieder des Discord-Servers dieser Seite.',
  oauth_invite_required: () => 'Für ein neues Konto brauchst du eine Einladung. Öffne zuerst deinen Einladungslink.',
  oauth_registration_closed: () => 'Auf diesem Server können keine neuen Konten angelegt werden.',
  suspended: () => 'Dieses Konto ist gesperrt. Wende dich an einen Admin.',
  session: () => 'Deine Sitzung ist abgelaufen. Melde dich erneut an.',
};

function loginError(code, provider) {
  const message = LOGIN_ERRORS[code];
  return message ? message(oauth.isKnown(provider) ? oauth.labelOf(provider) : 'dem Dienst') : '';
}

const TICKET = 'mfa-ticket';
const TICKET_TTL_MS = 5 * 60 * 1000;
const MAX_TICKET_ATTEMPTS = 5;

const expired = () => gone('Die Anmeldung ist abgelaufen. Bitte starte sie neu.', { code: 'expired' });

async function issueTicket(userId, { method, remember, next }) {
  const id = randomToken(24);
  await ephemeral.put(TICKET, id, { userId, method, remember, next, attempts: 0 }, TICKET_TTL_MS);
  return id;
}

async function readTicket(id) {
  const ticket = await ephemeral.get(TICKET, id);
  if (!ticket) throw expired();
  return ticket;
}

async function secondFactor(userId) {
  const user = await users.findById(userId);
  const methods = ['totp', 'recovery'];
  if (settings.get('auth.passkeys') && (await passkeys.listForUser(userId)).length > 0) methods.push('passkey');
  return { methods, username: user ? user.username : '' };
}

function assertActive(row) {
  if (!row || row.status === 'active') return;
  const reason = row.suspended_reason ? ` Grund: ${row.suspended_reason}` : '';
  throw forbidden(`Dieses Konto ist gesperrt.${reason}`, { code: 'suspended' });
}

async function signIn(req, res, row, { method, remember, next }) {
  assertActive(row);
  if (row.totp_enabled_at) {
    const ticket = await issueTicket(row.id, { method, remember, next });
    return res.json({ mfa: { ticket, ...(await secondFactor(row.id)) } });
  }
  return res.json({ ok: true, redirect: await sessions.start(req, res, row, { method, remember, next }) });
}

const methodsInfo = () => ({
  passkey: settings.get('auth.passkeys'),
  providers: oauth.enabled(),
  token: settings.get('auth.tokenLogin'),
  register: settings.get('auth.registration') === 'open',
  passkeyOrigin: new URL(settings.get('site.baseUrl')).origin,
});

const inviteInfo = (record) => ({ code: record.code, role: record.role, expiresAt: record.expiresAt, createdBy: record.createdBy });

router.get('/login', async (req, res) => {
  if (await setup.isOpen()) return res.redirect('/setup');

  const ticketId = text(req.query.mfa, 100);
  const ticket = ticketId ? await ephemeral.get(TICKET, ticketId) : null;
  const mfa = ticket ? { ticket: ticketId, ...(await secondFactor(ticket.userId)) } : null;
  if (req.user && !mfa) return res.redirect(safeNext(text(req.query.next)));

  return renderPage(res, {
    page: 'login',
    title: 'Anmelden',
    data: {
      mode: 'login',
      error: loginError(text(req.query.error, 40), text(req.query.provider, 20)),
      next: safeNext(text(req.query.next), ''),
      methods: methodsInfo(),
      mfa,
    },
  });
});

router.get('/register', async (req, res) => {
  if (await setup.isOpen()) return res.redirect('/setup');
  if (req.user) return res.redirect('/dashboard');

  const mode = settings.get('auth.registration');
  let invite = null;
  let error = '';
  const code = text(req.query.invite, 60);
  if (code) {
    try {
      invite = inviteInfo(await invites.requireUsable(code));
    } catch (problem) {
      error = problem.message;
    }
  }

  let pending = null;
  const pendingId = text(req.query.oauth, 60);
  if (pendingId) {
    const entry = await oauth.peekSignup(pendingId);
    if (entry && oauth.isKnown(entry.provider)) {
      pending = {
        id: pendingId,
        provider: entry.provider,
        label: oauth.labelOf(entry.provider),
        name: entry.profile.name,
        suggestion: oauth.suggestUsername(entry.profile),
      };
      const record = entry.invite && !invite ? await invites.get(entry.invite) : null;
      if (record) invite = inviteInfo(record);
    } else {
      error = loginError('oauth_expired');
    }
  }

  return renderPage(res, {
    page: 'login',
    title: 'Registrieren',
    data: {
      mode: 'register',
      error,
      next: '',
      methods: methodsInfo(),
      registration: {
        mode,
        allowed: Boolean(pending) || (mode === 'open' && !error) || Boolean(invite),
        invite,
        oauth: pending,
        providers: mode === 'closed' ? [] : oauth.registrationProviders(),
        passwordMinLength: settings.get('auth.passwordMinLength'),
      },
    },
  });
});

async function logout(req, res) {
  if (req.sessionToken) {
    await sessions.revokeToken(req.sessionToken).catch(() => {});
    if (req.user) audit.log('logout', { userId: req.user.id, req });
  }
  res.clearCookie(sessions.COOKIE, { path: '/' });
}

router.get('/logout', async (req, res) => {
  await logout(req, res);
  res.redirect('/login');
});

router.post('/api/auth/logout', async (req, res) => {
  await logout(req, res);
  res.json({ ok: true });
});

router.post('/api/auth/login', guarded, async (req, res) => {
  const username = text(req.body.username, 64).trim();
  const password = text(req.body.password, 300);
  if (!username || !password) throw badRequest('Gib Benutzername und Passwort ein.');

  const key = `user:${username.toLowerCase()}`;
  const locked = accountThrottle.lockedFor(key);
  if (locked) throw tooManyRequests(`Zu viele Fehlversuche für dieses Konto. Versuche es in ${Math.ceil(locked / 60000)} Minuten erneut.`);

  const row = await users.findByName(username);
  if (!(await users.verifyPassword(row, password))) {
    const lockedNow = accountThrottle.fail(key);
    if (row) {
      audit.log('login_failed', { userId: row.id, actorId: null, req, details: { method: 'password' } });
      if (lockedNow) {
        audit.log('account_locked', { userId: row.id, actorId: null, req });
        webhook.notify('security', 'Konto vorübergehend gesperrt', `Zu viele falsche Passwörter für **${row.username}**.`, 'error');
      }
    } else {
      log.warn('Anmeldung fehlgeschlagen', { user: username, ip: storedIp(req), reason: 'unbekannter Benutzer' });
    }
    throw unauthorized('Benutzername oder Passwort ist falsch.');
  }
  accountThrottle.reset(key);
  return signIn(req, res, row, { method: 'password', remember: flag(req.body.remember), next: text(req.body.next) });
});

router.post('/api/auth/login/token', guarded, async (req, res) => {
  if (!settings.get('auth.tokenLogin')) throw forbidden('Die Anmeldung mit Token ist deaktiviert.');
  const resolved = await tokens.resolve(text(req.body.token, 4096));
  if (!resolved) {
    log.warn('Anmeldung mit Token fehlgeschlagen', { ip: storedIp(req), reason: 'unbekanntes Token' });
    throw unauthorized('Dieses Token ist ungültig. Prüfe, ob du es vollständig eingefügt hast.');
  }
  const row = await users.findById(resolved.user.id);
  return signIn(req, res, row, { method: 'token', remember: flag(req.body.remember), next: text(req.body.next) });
});

async function finishSecondFactor(req, res, ticketId, ticket, extra = {}) {
  if (!(await ephemeral.take(TICKET, ticketId))) throw expired();
  const row = await users.findById(ticket.userId);
  if (!row) throw expired();
  assertActive(row);
  const redirect = await sessions.start(req, res, row, { method: ticket.method, remember: ticket.remember, next: ticket.next });
  res.json({ ok: true, redirect, ...extra });
}

router.post('/api/auth/mfa', guarded, async (req, res) => {
  const ticketId = text(req.body.ticket, 100);
  const ticket = await readTicket(ticketId);
  const result = await totp.verifySecondFactor(ticket.userId, text(req.body.code, 40));
  if (!result.ok) {
    const counted = await ephemeral.increment(TICKET, ticketId, 'attempts');
    audit.log('login_failed', { userId: ticket.userId, actorId: null, req, details: { method: 'totp' } });
    if (!counted || counted.attempts >= MAX_TICKET_ATTEMPTS) {
      await ephemeral.remove(TICKET, ticketId);
      throw gone('Zu viele falsche Codes. Melde dich bitte neu an.', { code: 'expired' });
    }
    throw unauthorized('Der Code stimmt nicht. Nimm den aktuellen Code aus deiner App.');
  }
  if (result.method !== 'recovery') return finishSecondFactor(req, res, ticketId, ticket);
  audit.log('recovery_code_used', { userId: ticket.userId, req, details: { left: result.recoveryCodesLeft } });
  return finishSecondFactor(req, res, ticketId, ticket, { recoveryCodesLeft: result.recoveryCodesLeft });
});

router.post('/api/auth/mfa/passkey/options', sameOriginOnly, async (req, res) => {
  const ticket = await readTicket(text(req.body.ticket, 100));
  res.json(await passkeys.authenticationOptions('mfa', ticket.userId));
});

router.post('/api/auth/mfa/passkey', guarded, async (req, res) => {
  const ticketId = text(req.body.ticket, 100);
  const ticket = await readTicket(ticketId);
  const result = await passkeys.authenticate({ flowId: text(req.body.flowId, 100), response: req.body.response, purpose: 'mfa' });
  if (result.userId !== ticket.userId) throw unauthorized('Dieser Passkey gehört zu einem anderen Konto.');
  return finishSecondFactor(req, res, ticketId, ticket);
});

const passkeysEnabled = (req, res, next) => {
  if (!settings.get('auth.passkeys')) throw forbidden('Passkeys sind auf diesem Server deaktiviert.');
  next();
};

router.post('/api/auth/passkey/options', sameOriginOnly, passkeysEnabled, async (req, res) => {
  res.json(await passkeys.authenticationOptions('login'));
});

router.post('/api/auth/passkey', guarded, passkeysEnabled, async (req, res) => {
  const result = await passkeys.authenticate({ flowId: text(req.body.flowId, 100), response: req.body.response, purpose: 'login' });
  const row = await users.findById(result.userId);
  if (!row) throw unauthorized('Dieser Passkey gehört zu keinem Konto mehr.');
  assertActive(row);
  const redirect = await sessions.start(req, res, row, { method: 'passkey', remember: flag(req.body.remember), next: text(req.body.next) });
  res.json({ ok: true, redirect });
});

const OAUTH_COOKIE = 'ms_oauth';
const OAUTH_INTENTS = ['login', 'link', 'signup', 'reauth'];

const providerFrom = (req) => (oauth.isKnown(req.params.provider) ? req.params.provider : null);
const loginFailure = (provider, code) => `/login?error=${code}&provider=${provider}`;
const accountNotice = (provider, notice) => `/account?oauth=${notice}&provider=${provider}#sicherheit`;

router.get('/auth/:provider', async (req, res) => {
  const provider = providerFrom(req);
  if (!provider) return res.redirect('/login');
  const intent = OAUTH_INTENTS.includes(req.query.intent) ? req.query.intent : 'login';
  const forAccount = intent === 'link' || intent === 'reauth';
  if (forAccount && !req.user) return res.redirect('/login?error=session');
  try {
    const { url, state } = await oauth.begin(provider, {
      intent,
      userId: req.user ? req.user.id : null,
      invite: text(req.query.invite, 60) || null,
      remember: req.query.remember !== '0',
      next: text(req.query.next) || null,
    });
    res.cookie(OAUTH_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), maxAge: 10 * 60 * 1000, path: '/auth' });
    return res.redirect(url);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    const notice = error.code === 'disabled' ? 'disabled' : 'failed';
    if (notice === 'failed') log.warn(`Anmeldung mit ${oauth.labelOf(provider)} nicht möglich`, { error });
    return res.redirect(forAccount ? accountNotice(provider, notice) : loginFailure(provider, `oauth_${notice}`));
  }
});

async function accountFlow(req, res, provider, { flow, profile }) {
  if (!req.user || req.user.id !== flow.userId) return res.redirect('/login?error=session');
  if (flow.intent === 'link') {
    await identities.link(req.user.id, provider, profile, oauth.labelOf(provider));
    audit.log('identity_linked', { userId: req.user.id, req, details: { provider, name: profile.name } });
    return res.redirect(accountNotice(provider, 'linked'));
  }
  if ((await identities.subjectOf(req.user.id, provider)) !== profile.subject) return res.redirect(accountNotice(provider, 'mismatch'));
  await sessions.elevate(req.session.id);
  return res.redirect(safeNext(flow.next, '/account'));
}

async function signInFlow(req, res, provider, { flow, profile, membership }) {
  const row = await identities.findUser(provider, profile.subject);
  if (row) {
    if (row.status !== 'active') return res.redirect('/login?error=suspended');
    identities.touch(provider, profile.subject, profile.name).catch(() => {});
    if (row.totp_enabled_at) {
      const ticket = await issueTicket(row.id, { method: provider, remember: flow.remember, next: flow.next });
      return res.redirect(`/login?mfa=${ticket}`);
    }
    return res.redirect(await sessions.start(req, res, row, { method: provider, remember: flow.remember, next: flow.next }));
  }

  const mode = settings.get('auth.registration');
  if (!oauth.allowsRegistration(provider)) return res.redirect(loginFailure(provider, 'oauth_no_account'));
  if (mode === 'closed') return res.redirect(loginFailure(provider, 'oauth_registration_closed'));
  if (!oauth.meetsRequirements(provider, membership)) return res.redirect(loginFailure(provider, 'oauth_not_member'));

  const invite = flow.invite
    ? await invites.requireUsable(flow.invite).then(
        () => flow.invite,
        () => null
      )
    : null;
  if (mode === 'invite' && !invite && !oauth.membershipCountsAsInvite(provider)) {
    return res.redirect(loginFailure(provider, 'oauth_invite_required'));
  }
  const pendingId = await oauth.holdSignup({ provider, profile, invite, remember: flow.remember });
  return res.redirect(`/register?oauth=${pendingId}`);
}

router.get('/auth/:provider/callback', async (req, res) => {
  const provider = providerFrom(req);
  if (!provider) return res.redirect('/login');
  const state = text(req.query.state, 100);
  const cookieState = req.cookies[OAUTH_COOKIE] || '';
  res.clearCookie(OAUTH_COOKIE, { path: '/auth' });

  if (req.query.error) return res.redirect(loginFailure(provider, 'oauth_denied'));
  if (!state || !cookieState || !safeEqual(state, cookieState)) return res.redirect(loginFailure(provider, 'oauth_expired'));

  let result;
  try {
    result = await oauth.complete(provider, { code: text(req.query.code, 4000), state });
  } catch (error) {
    log.warn(`Anmeldung mit ${oauth.labelOf(provider)} fehlgeschlagen`, { error });
    return res.redirect(loginFailure(provider, error.code === 'expired' ? 'oauth_expired' : 'oauth_failed'));
  }

  try {
    const forAccount = result.flow.intent === 'link' || result.flow.intent === 'reauth';
    return await (forAccount ? accountFlow : signInFlow)(req, res, provider, result);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) return res.redirect(accountNotice(provider, 'taken'));
    log.error(`Anmeldung mit ${oauth.labelOf(provider)} fehlgeschlagen`, { id: req.id, error });
    return res.redirect(loginFailure(provider, 'oauth_failed'));
  }
});

router.get('/api/auth/invite/:code', async (req, res) => {
  try {
    const invite = await invites.requireUsable(req.params.code);
    res.json({ valid: true, role: invite.role, expiresAt: invite.expiresAt });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    res.status(error.status).json({ valid: false, error: error.message });
  }
});

async function registerWithProvider(req, res, pendingId) {
  const entry = await oauth.peekSignup(pendingId);
  if (!entry || !oauth.isKnown(entry.provider)) throw gone(loginError('oauth_expired'));
  const label = oauth.labelOf(entry.provider);
  const invite = entry.invite ? await invites.requireUsable(entry.invite) : null;
  const row = await users.create({
    username: text(req.body.username, 64),
    password: text(req.body.password, 300),
    role: invite ? invite.role : 'mitglied',
    quotaBytes: invite ? invite.quotaBytes : null,
    maxFileBytes: invite ? invite.maxFileBytes : null,
    identity: { provider: entry.provider, subject: entry.profile.subject, name: entry.profile.name, label },
  });
  if (invite) await invites.consume(invite.code);
  await oauth.dropSignup(pendingId);
  audit.log('user_registered', {
    userId: row.id,
    req,
    details: { method: entry.provider, invite: invite ? invite.code.slice(0, 4) : null },
  });
  webhook.notify('user', 'Neuer Benutzer', `**${row.username}** hat sich mit ${label} registriert.`);
  res.json({ ok: true, redirect: await sessions.start(req, res, row, { method: entry.provider, remember: entry.remember }) });
}

router.post('/api/auth/register', guarded, async (req, res) => {
  const pendingId = text(req.body.oauth, 60);
  if (pendingId) return registerWithProvider(req, res, pendingId);

  const mode = settings.get('auth.registration');
  if (mode === 'closed') throw forbidden('Auf diesem Server können keine neuen Konten angelegt werden.');
  const code = text(req.body.invite, 60);
  if (!code && mode === 'invite') throw forbidden('Für ein neues Konto brauchst du eine Einladung.');
  const invite = code ? await invites.requireUsable(code) : null;

  const row = await users.create({
    username: text(req.body.username, 64),
    password: text(req.body.password, 300),
    role: invite ? invite.role : 'mitglied',
    quotaBytes: invite ? invite.quotaBytes : null,
    maxFileBytes: invite ? invite.maxFileBytes : null,
  });
  if (invite) await invites.consume(invite.code);
  audit.log('user_registered', { userId: row.id, req, details: { method: 'password', invite: invite ? invite.code.slice(0, 4) : null } });
  webhook.notify('user', 'Neuer Benutzer', `**${row.username}** hat sich registriert.`);
  return res.json({ ok: true, redirect: await sessions.start(req, res, row, { method: 'password', remember: flag(req.body.remember) }) });
});

const sudo = requireApi({ allowSetup: true });

router.post('/api/auth/reauth', sudo, credentialLimiter, async (req, res) => {
  const row = await users.findById(req.user.id);
  const password = text(req.body.password, 300);
  const code = text(req.body.code, 40);
  let ok = false;
  if (password) ok = await users.verifyPassword(row, password);
  else if (code && row.totp_enabled_at) ok = (await totp.verifySecondFactor(row.id, code)).ok;
  if (!ok) {
    audit.log('reauth_failed', { userId: row.id, req });
    throw unauthorized(password ? 'Das Passwort stimmt nicht.' : 'Der Code stimmt nicht.');
  }
  await sessions.elevate(req.session.id);
  res.json({ ok: true });
});

router.post('/api/auth/reauth/passkey/options', sudo, async (req, res) => {
  res.json(await passkeys.authenticationOptions('reauth', req.user.id));
});

router.post('/api/auth/reauth/passkey', sudo, credentialLimiter, async (req, res) => {
  const result = await passkeys.authenticate({ flowId: text(req.body.flowId, 100), response: req.body.response, purpose: 'reauth' });
  if (result.userId !== req.user.id) throw unauthorized('Dieser Passkey gehört zu einem anderen Konto.');
  await sessions.elevate(req.session.id);
  res.json({ ok: true });
});

module.exports = router;
