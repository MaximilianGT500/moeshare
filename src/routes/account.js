'use strict';

const express = require('express');
const { badRequest, conflict, forbidden, notFound, unauthorized } = require('../lib/errors');
const { text, integer } = require('../lib/input');
const { renderPage } = require('../lib/render');
const { requirePage, requireApi, assertRecentAuth, requireRecentAuth } = require('../middleware/auth');
const settings = require('../services/settingsService');
const sessions = require('../services/sessionService');
const users = require('../services/userService');
const tokens = require('../services/tokenService');
const totp = require('../services/totpService');
const passkeys = require('../services/passkeyService');
const oauth = require('../services/oauthService');
const identities = require('../services/identityService');
const audit = require('../services/auditService');
const files = require('../services/fileService');
const viewer = require('../services/viewerService');
const webhook = require('../services/webhookService');

const router = express.Router();

const signedIn = requireApi({ allowSetup: true });
const sudo = [signedIn, requireRecentAuth];

const OWN_ACTIVITY = [
  'login',
  'login_failed',
  'account_locked',
  'password_changed',
  'password_reset',
  'mfa_enabled',
  'mfa_disabled',
  'mfa_reset',
  'recovery_codes_regenerated',
  'recovery_code_used',
  'passkey_added',
  'passkey_removed',
  'discord_linked',
  'discord_unlinked',
  'identity_linked',
  'identity_unlinked',
  'token_created',
  'token_revoked',
  'sessions_revoked',
  'user_registered',
  'user_created',
  'user_updated',
];

const mfaRequired = (user) => {
  const enforce = settings.get('auth.enforceMfa');
  return enforce === 'all' || (enforce === 'admins' && user.isAdmin);
};

async function overview(req) {
  const row = await users.findById(req.user.id);
  const limits = users.effectiveLimits(row);
  const [usedBytes, passkeyList, recoveryLeft, sessionList, tokenList, activity, linked] = await Promise.all([
    users.usageBytes(row.username),
    passkeys.listForUser(row.id),
    row.totp_enabled_at ? totp.remainingRecoveryCodes(row.id) : 0,
    sessions.listForUser(row.id, req.session ? req.session.id : null),
    tokens.listForUser(row.id),
    audit.list({ userId: row.id, limit: 25, actions: OWN_ACTIVITY }),
    identities.listForUser(row.id),
  ]);
  const available = oauth.enabled();

  return {
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      isAdmin: row.role === 'admin',
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      passwordChangedAt: row.password_changed_at,
      hasPassword: Boolean(row.password),
      mustChangePassword: Boolean(row.must_change_password),
    },
    security: {
      totp: Boolean(row.totp_enabled_at),
      totpEnabledAt: row.totp_enabled_at,
      recoveryCodesLeft: recoveryLeft,
      mfaRequired: mfaRequired(req.user),
      passkeysEnabled: settings.get('auth.passkeys'),
      passkeyOrigin: new URL(settings.get('site.baseUrl')).origin,
      passkeys: passkeyList,
      identities: linked.map((identity) => ({
        ...identity,
        label: oauth.isKnown(identity.provider) ? oauth.labelOf(identity.provider) : identity.provider,
        enabled: oauth.isEnabled(identity.provider),
      })),
      providers: available,
      elevated: Boolean(req.session && req.session.elevated),
    },
    limits: { usedBytes, quotaBytes: limits.quotaBytes, maxFileBytes: limits.maxFileBytes },
    policy: { passwordMinLength: settings.get('auth.passwordMinLength') },
    sessions: sessionList,
    tokens: tokenList,
    activity,
    setup: sessions.pendingSetup(req.user),
  };
}

async function keepsSignIn(userId, removing) {
  const row = await users.findById(userId);
  const passkeyCount = (await passkeys.listForUser(userId)).length - (removing === 'passkey' ? 1 : 0);
  const otherIdentities = (await identities.listForUser(userId)).filter(
    ({ provider }) => provider !== removing && oauth.isEnabled(provider)
  );
  return Boolean(row.password) || (settings.get('auth.passkeys') && passkeyCount > 0) || otherIdentities.length > 0;
}

router.get('/account', requirePage(), async (req, res) => {
  const [account, userStats] = await Promise.all([overview(req), files.userStats(req.user.username)]);
  renderPage(res, { page: 'account', title: 'Konto', data: { user: viewer.summary(req.user), account, userStats } });
});

router.get('/api/account', signedIn, async (req, res) => {
  res.json(await overview(req));
});

router.post('/api/account/password', signedIn, async (req, res) => {
  const next = text(req.body.next, 300);
  const current = text(req.body.current, 300);
  const row = await users.findById(req.user.id);
  if (row.password && !row.must_change_password) {
    if (!current) throw badRequest('Gib dein aktuelles Passwort ein.', { field: 'current' });
    if (!(await users.verifyPassword(row, current))) {
      audit.log('reauth_failed', { userId: row.id, req });
      throw unauthorized('Das aktuelle Passwort stimmt nicht.', { field: 'current' });
    }
  } else if (!row.password) {
    assertRecentAuth(req);
  }
  if (current && current === next) throw badRequest('Das neue Passwort muss sich vom alten unterscheiden.', { field: 'next' });
  try {
    await users.setPassword(row.id, next);
  } catch (error) {
    if (error.field === 'password') error.field = 'next';
    throw error;
  }
  const endedSessions = await sessions.revokeAll(row.id, req.session.id);
  audit.log('password_changed', { userId: row.id, req, details: { endedSessions } });
  res.json({ ok: true, endedSessions });
});

router.post('/api/account/totp/setup', sudo, async (req, res) => {
  if (req.user.totpEnabled) throw conflict('Die Zwei-Faktor-Anmeldung ist schon eingerichtet.');
  res.json(await totp.beginSetup(req.user));
});

router.post('/api/account/totp/enable', sudo, async (req, res) => {
  const recoveryCodes = await totp.enable(req.user.id, text(req.body.code, 20));
  audit.log('mfa_enabled', { userId: req.user.id, req });
  res.json({ ok: true, recoveryCodes });
});

router.post('/api/account/totp/disable', sudo, async (req, res) => {
  if (mfaRequired(req.user)) throw forbidden('Die Zwei-Faktor-Anmeldung ist auf diesem Server Pflicht und kann nicht abgeschaltet werden.');
  await totp.disable(req.user.id);
  audit.log('mfa_disabled', { userId: req.user.id, req });
  webhook.notify('security', '2FA abgeschaltet', `**${req.user.username}** hat die Zwei-Faktor-Anmeldung abgeschaltet.`, 'error');
  res.json({ ok: true });
});

router.post('/api/account/recovery-codes', sudo, async (req, res) => {
  if (!req.user.totpEnabled) throw conflict('Richte zuerst die Zwei-Faktor-Anmeldung ein.');
  const recoveryCodes = await totp.generateRecoveryCodes(req.user.id);
  audit.log('recovery_codes_regenerated', { userId: req.user.id, req });
  res.json({ recoveryCodes });
});

const passkeysEnabled = (req, res, next) => {
  if (!settings.get('auth.passkeys')) throw forbidden('Passkeys sind auf diesem Server deaktiviert.');
  next();
};

router.post('/api/account/passkeys/options', sudo, passkeysEnabled, async (req, res) => {
  res.json(await passkeys.registrationOptions(req.user));
});

router.post('/api/account/passkeys', sudo, passkeysEnabled, async (req, res) => {
  const passkey = await passkeys.register(req.user, {
    flowId: req.body.flowId,
    response: req.body.response,
    name: req.body.name,
    userAgent: req.get('user-agent'),
  });
  audit.log('passkey_added', { userId: req.user.id, req, details: { name: passkey.name } });
  res.json({ ok: true, passkey });
});

router.patch('/api/account/passkeys/:id', signedIn, async (req, res) => {
  await passkeys.rename(req.user.id, req.params.id, req.body.name);
  res.json({ ok: true });
});

router.delete('/api/account/passkeys/:id', sudo, async (req, res) => {
  if (!(await keepsSignIn(req.user.id, 'passkey')))
    throw conflict('Das ist deine letzte Anmeldemöglichkeit. Lege zuerst ein Passwort fest.');
  await passkeys.remove(req.user.id, req.params.id);
  audit.log('passkey_removed', { userId: req.user.id, req });
  res.json({ ok: true });
});

router.delete('/api/account/identities/:provider', sudo, async (req, res) => {
  const { provider } = req.params;
  const label = oauth.isKnown(provider) ? oauth.labelOf(provider) : provider;
  if (!(await keepsSignIn(req.user.id, provider)))
    throw conflict(`Ohne ${label} könntest du dich nicht mehr anmelden. Lege zuerst ein Passwort fest.`);
  if (!(await identities.unlink(req.user.id, provider))) throw notFound('Diese Verknüpfung gibt es nicht (mehr).');
  audit.log('identity_unlinked', { userId: req.user.id, req, details: { provider } });
  res.json({ ok: true });
});

router.delete('/api/account/sessions/:id', signedIn, async (req, res) => {
  if (req.params.id === req.session.id) throw badRequest('Die aktuelle Sitzung beendest du über „Abmelden“.');
  if (!(await sessions.revoke(req.user.id, req.params.id))) throw notFound('Diese Sitzung gibt es nicht (mehr).');
  audit.log('sessions_revoked', { userId: req.user.id, req, details: { count: 1 } });
  res.json({ ok: true });
});

router.post('/api/account/sessions/revoke-others', signedIn, async (req, res) => {
  const count = await sessions.revokeAll(req.user.id, req.session.id);
  audit.log('sessions_revoked', { userId: req.user.id, req, details: { count } });
  res.json({ ok: true, count });
});

router.post('/api/account/tokens', sudo, async (req, res) => {
  const { token, record } = await tokens.create(req.user.id, req.body.name);
  audit.log('token_created', { userId: req.user.id, req, details: { name: record.name } });
  res.json({ ok: true, token, record });
});

router.delete('/api/account/tokens/:id', signedIn, async (req, res) => {
  await tokens.revoke(req.user.id, integer(req.params.id));
  audit.log('token_revoked', { userId: req.user.id, req });
  res.json({ ok: true });
});

router.get('/api/account/activity', signedIn, async (req, res) => {
  const events = await audit.list({ userId: req.user.id, limit: 25, before: integer(req.query.before), actions: OWN_ACTIVITY });
  res.json({ events });
});

router.delete('/api/account', sudo, async (req, res) => {
  if (req.body.confirm !== req.user.username) throw badRequest('Tippe zur Bestätigung deinen Benutzernamen ein.', { field: 'confirm' });
  if (req.user.isAdmin && (await users.countActiveAdmins()) <= 1)
    throw conflict('Du bist der letzte Admin. Ernenne zuerst einen anderen Admin.');
  const removed = await users.remove(req.user.id);
  audit.log('account_deleted', { userId: null, actorId: null, req, details: { username: removed.username } });
  webhook.notify('user', 'Konto gelöscht', `**${removed.username}** hat das eigene Konto gelöscht.`);
  res.clearCookie(sessions.COOKIE, { path: '/' });
  res.json({ ok: true, redirect: '/login' });
});

module.exports = router;
