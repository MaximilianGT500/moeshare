'use strict';

const express = require('express');
const { tr } = require('../lib/i18n');
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
const preferences = require('../services/preferenceService');
const domains = require('../services/domainService');
const emails = require('../services/emailService');
const mail = require('../services/mailService');
const watermarks = require('../services/watermarkService');
const exporter = require('../services/exportService');
const { STYLES } = require('../lib/slugs');
const { EXPIRY_CHOICES } = require('../lib/expiry');

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
  'email_changed',
  'email_removed',
  'domain_added',
  'domain_verified',
  'domain_removed',
  'domain_revoked',
  'design_updated',
  'album_shared',
  'album_left',
  'virus_found',
  'data_exported',
];

const mfaRequired = (user) => {
  const enforce = settings.get('auth.enforceMfa');
  return enforce === 'all' || (enforce === 'admins' && user.isAdmin);
};

const translateDomain = (req, item) => ({ ...item, error: item.error ? tr(req, item.error) : null });

async function domainInfo(req) {
  return {
    enabled: domains.enabled(),
    max: settings.get('domains.maxPerUser'),
    https: settings.get('domains.https'),
    items: (await domains.listForUser(req.user.id)).map((item) => translateDomain(req, item)),
  };
}

async function overview(req) {
  const row = await users.findById(req.user.id);
  const limits = users.effectiveLimits(row);
  const [usedBytes, passkeyList, recoveryLeft, sessionList, tokenList, activity, linked, email, domainState] = await Promise.all([
    users.usageBytes(row.username),
    passkeys.listForUser(row.id),
    row.totp_enabled_at ? totp.remainingRecoveryCodes(row.id) : 0,
    sessions.listForUser(row.id, req.session ? req.session.id : null),
    tokens.listForUser(row.id),
    audit.list({ userId: row.id, limit: 25, actions: OWN_ACTIVITY, language: req.language }),
    identities.listForUser(row.id),
    emails.state(row.id),
    domainInfo(req),
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
      passkeys: passkeyList.map((passkey) => ({ ...passkey, name: tr(req, passkey.name) })),
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
    sessions: sessionList.map((session) => ({ ...session, device: tr(req, session.device) })),
    tokens: tokenList,
    activity,
    setup: sessions.pendingSetup(req.user),
    preferences: await preferences.get(row.id),
    email,
    domains: domainState,
    choices: {
      languages: preferences.LANGUAGES,
      urlStyles: STYLES,
      expiries: EXPIRY_CHOICES,
      maxExpiry: settings.get('uploads.maxExpiry'),
      domains: files.originsFor(row.username),
      defaults: {
        language: settings.get('site.language'),
        urlStyle: settings.get('uploads.urlStyle'),
        expiry: settings.get('uploads.defaultExpiry'),
      },
      texts: settings.get('uploads.texts'),
      links: settings.get('links.enabled'),
      mail: mail.ready(),
      optimize: settings.get('images.optimize'),
      export: exporter.enabled(),
    },
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

router.patch('/api/account/preferences', signedIn, async (req, res) => {
  const updated = await preferences.update(req.user.id, req.body || {});
  if (updated.language)
    res.cookie('ms_lang', updated.language, { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.json({ preferences: updated });
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
  emails.notifySecurity(row.id, 'password_changed');
  res.json({ ok: true, endedSessions });
});

router.post('/api/account/totp/setup', sudo, async (req, res) => {
  if (req.user.totpEnabled) throw conflict('Die Zwei-Faktor-Anmeldung ist schon eingerichtet.');
  res.json(await totp.beginSetup(req.user));
});

router.post('/api/account/totp/enable', sudo, async (req, res) => {
  const recoveryCodes = await totp.enable(req.user.id, text(req.body.code, 20));
  audit.log('mfa_enabled', { userId: req.user.id, req });
  emails.notifySecurity(req.user.id, 'mfa_enabled');
  res.json({ ok: true, recoveryCodes });
});

router.post('/api/account/totp/disable', sudo, async (req, res) => {
  if (mfaRequired(req.user)) throw forbidden('Die Zwei-Faktor-Anmeldung ist auf diesem Server Pflicht und kann nicht abgeschaltet werden.');
  await totp.disable(req.user.id);
  audit.log('mfa_disabled', { userId: req.user.id, req });
  webhook.notify('security', '2FA abgeschaltet', `**${req.user.username}** hat die Zwei-Faktor-Anmeldung abgeschaltet.`, 'error');
  emails.notifySecurity(req.user.id, 'mfa_disabled');
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
    language: req.language,
  });
  audit.log('passkey_added', { userId: req.user.id, req, details: { name: passkey.name } });
  emails.notifySecurity(req.user.id, 'passkey_added', { name: passkey.name });
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

router.post('/api/account/email', sudo, async (req, res) => {
  res.json({ ok: true, email: await emails.startVerification(req.user, req.body.email, req.language) });
});

router.delete('/api/account/email', sudo, async (req, res) => {
  await emails.remove(req.user.id);
  audit.log('email_removed', { userId: req.user.id, req });
  res.json({ ok: true, email: await emails.state(req.user.id) });
});

router.get('/account/email', async (req, res) => {
  try {
    const entry = await emails.confirm(text(req.query.token, 200));
    audit.log('email_changed', { userId: entry.userId, req, details: { email: emails.maskEmail(entry.email) } });
    return res.redirect('/account?email=bestaetigt#einstellungen');
  } catch (error) {
    return res.redirect(`/account?email=${error.status === 409 ? 'vergeben' : 'abgelaufen'}#einstellungen`);
  }
});

const domainsEnabled = (req, res, next) => {
  if (!domains.enabled()) throw forbidden('Eigene Domains sind auf diesem Server abgeschaltet.');
  next();
};

router.get('/api/account/domains', signedIn, async (req, res) => res.json(await domainInfo(req)));

router.post('/api/account/domains', signedIn, domainsEnabled, async (req, res) => {
  const domain = await domains.add(req.user, req.body.domain);
  audit.log('domain_added', { userId: req.user.id, req, details: { domain: domain.domain } });
  res.json({ ok: true, domain: translateDomain(req, domain), domains: await domainInfo(req) });
});

router.post('/api/account/domains/:id/verify', signedIn, domainsEnabled, async (req, res) => {
  const result = await domains.verify(req.user, req.params.id);
  if (result.newlyVerified) audit.log('domain_verified', { userId: req.user.id, req, details: { domain: result.domain } });
  res.json({ ok: true, result: translateDomain(req, result), domains: await domainInfo(req) });
});

router.delete('/api/account/domains/:id', signedIn, async (req, res) => {
  const removed = await domains.remove(req.user, req.params.id);
  audit.log('domain_removed', { userId: req.user.id, req, details: { domain: removed.domain } });
  res.json({ ok: true, domains: await domainInfo(req) });
});

router.get('/api/account/activity', signedIn, async (req, res) => {
  const events = await audit.list({
    userId: req.user.id,
    limit: 25,
    before: integer(req.query.before),
    actions: OWN_ACTIVITY,
    language: req.language,
  });
  res.json({ events });
});

const watermarkJson = express.json({ limit: '6mb' });

router.get('/api/account/watermark', signedIn, async (req, res) => {
  res.json({ watermark: watermarks.present(await watermarks.get(req.user.id)) });
});

router.put('/api/account/watermark', watermarkJson, signedIn, async (req, res) => {
  const saved = await watermarks.save(req.user.id, req.body || {});
  res.json({ ok: true, watermark: watermarks.present(saved) });
});

router.delete('/api/account/watermark', signedIn, async (req, res) => {
  await watermarks.reset(req.user.id);
  res.json({ ok: true, watermark: watermarks.present(await watermarks.get(req.user.id)) });
});

router.post('/api/account/watermark/preview', watermarkJson, signedIn, async (req, res) => {
  const image = await watermarks.preview(req.user, req.body && Object.keys(req.body).length ? req.body : null);
  res.set('Cache-Control', 'private, no-store');
  res.type('image/jpeg').send(image);
});

router.get('/api/account/export', sudo, async (req, res) => {
  if (!exporter.enabled()) throw notFound('Der Datenexport ist auf diesem Server abgeschaltet.');
  if (req.query.probe) return res.json({ ok: true });
  audit.log('data_exported', { userId: req.user.id, req, details: { files: req.query.files !== '0' } });
  return exporter.send(res, req.user, { includeFiles: req.query.files !== '0', language: req.language });
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
