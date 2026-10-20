'use strict';

const express = require('express');
const config = require('../config');
const errorReports = require('../lib/errorReports');
const logger = require('../lib/logger');
const { badRequest, conflict, notFound } = require('../lib/errors');
const { greeting } = require('../lib/format');
const { integer, text } = require('../lib/input');
const { renderPage } = require('../lib/render');
const { isValidUsername } = require('../lib/storage');
const { systemInfo } = require('../lib/system');
const { requirePage, requireApi, assertRecentAuth, requireRecentAuth } = require('../middleware/auth');
const settings = require('../services/settingsService');
const sessions = require('../services/sessionService');
const users = require('../services/userService');
const tokens = require('../services/tokenService');
const totp = require('../services/totpService');
const passkeys = require('../services/passkeyService');
const invites = require('../services/inviteService');
const audit = require('../services/auditService');
const files = require('../services/fileService');
const oauth = require('../services/oauthService');
const identities = require('../services/identityService');
const home = require('../services/homeService');
const viewer = require('../services/viewerService');
const webhook = require('../services/webhookService');

const router = express.Router();
const admin = requireApi({ admin: true });
const adminSudo = [admin, requireRecentAuth];

const AUDIT_CATEGORIES = {
  signin: ['login', 'login_failed', 'logout', 'account_locked', 'reauth_failed', 'recovery_code_used'],
  security: [
    'mfa_enabled',
    'mfa_disabled',
    'mfa_reset',
    'recovery_codes_regenerated',
    'passkey_added',
    'passkey_removed',
    'password_changed',
    'password_reset',
    'token_created',
    'token_revoked',
    'sessions_revoked',
    'discord_linked',
    'discord_unlinked',
    'identity_linked',
    'identity_unlinked',
  ],
  admin: [
    'user_created',
    'user_registered',
    'user_updated',
    'user_suspended',
    'user_unsuspended',
    'user_deleted',
    'account_deleted',
    'invite_created',
    'invite_revoked',
    'settings_updated',
    'file_deleted',
    'embed_updated',
  ],
};

const settingsPayload = () => ({
  ...settings.forAdmin(),
  redirectUris: oauth.redirectUris(),
  environment: { port: config.port, logLevel: logger.level, logFormat: logger.format, errorReports: errorReports.destination() },
});

async function targetUser(req) {
  const row = await users.findById(integer(req.params.id));
  if (!row) throw notFound('Benutzer nicht gefunden.');
  return row;
}

router.get('/admin', requirePage({ admin: true }), async (req, res) => {
  const [stats, userStats, userList, fileList, inviteList, events, sudo, homeStats] = await Promise.all([
    files.globalStats(),
    files.userStats(req.user.username),
    users.listForAdmin(),
    files.listAll({ page: 1, limit: 25 }),
    invites.list(),
    audit.list({ limit: 40 }),
    viewer.confirmMethods(req.user),
    home.allStats(),
  ]);
  renderPage(res, {
    page: 'admin',
    title: 'Admin',
    data: {
      user: viewer.summary(req.user),
      greeting: greeting(),
      stats,
      userStats,
      system: systemInfo(),
      users: userList,
      files: fileList,
      invites: inviteList,
      settings: settingsPayload(),
      audit: events,
      sudo,
      homeStats,
    },
  });
});

router.get('/api/admin/stats', admin, async (req, res) => {
  res.json(await files.globalStats());
});

router.get('/api/admin/system', admin, (req, res) => {
  res.json(systemInfo());
});

router.get('/api/admin/files', admin, async (req, res) => {
  res.json(await files.listAll({ search: text(req.query.search, 200), page: req.query.page, limit: req.query.limit }));
});

router.delete('/api/admin/files/:username/:filename', admin, async (req, res) => {
  const { username, filename } = req.params;
  if (!isValidUsername(username)) throw badRequest('Ungültiger Benutzername.');
  await files.remove(username, filename);
  if (username !== req.user.username) {
    audit.log('file_deleted', { userId: null, actorId: req.user.id, req, details: { owner: username, filename } });
  }
  webhook.notify(
    'delete',
    'Eine Datei wurde gelöscht',
    `Nutzername: **${username}**\nDatei: **${filename}**\nGelöscht von: **${req.user.username}**`
  );
  res.json({ ok: true });
});

router.get('/api/admin/users', admin, async (req, res) => {
  res.json({ users: await users.listForAdmin(text(req.query.search, 64)) });
});

router.post('/api/admin/users', adminSudo, async (req, res) => {
  const generated = !req.body.password;
  const password = generated ? users.generatePassword() : String(req.body.password);
  const row = await users.create({
    username: req.body.username,
    password,
    role: req.body.role,
    quotaBytes: req.body.quotaBytes,
    maxFileBytes: req.body.maxFileBytes,
    mustChangePassword: req.body.mustChangePassword !== false,
  });
  audit.log('user_created', { userId: row.id, actorId: req.user.id, req, details: { role: row.role } });
  webhook.notify(
    'user',
    'Neuer Benutzer',
    `**${row.username}** wurde von **${req.user.username}** angelegt (${row.role === 'admin' ? 'Admin' : 'Mitglied'}).`
  );
  res.json({ ok: true, user: await users.getForAdmin(row.id), password: generated ? password : undefined });
});

router.get('/api/admin/users/:id', admin, async (req, res) => {
  const row = await targetUser(req);
  const [user, sessionList, tokenList, passkeyList, activity] = await Promise.all([
    users.getForAdmin(row.id),
    sessions.listForUser(row.id, req.session.id),
    tokens.listForUser(row.id),
    passkeys.listForUser(row.id),
    audit.list({ userId: row.id, limit: 30 }),
  ]);
  res.json({ user, sessions: sessionList, tokens: tokenList, passkeys: passkeyList, activity });
});

function auditActionFor(changes) {
  if (changes.status === 'suspended') return 'user_suspended';
  if (changes.status === 'active') return 'user_unsuspended';
  return 'user_updated';
}

router.patch('/api/admin/users/:id', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  const patch = {};
  for (const key of ['role', 'status', 'suspendedReason', 'quotaBytes', 'maxFileBytes']) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const { before, after } = await users.update(row.id, patch, { actorId: req.user.id });

  const changes = {};
  if (before.role !== after.role) changes.role = after.role;
  if (before.status !== after.status) changes.status = after.status;
  if (before.quota_bytes !== after.quota_bytes) changes.quotaBytes = after.quota_bytes;
  if (before.max_file_bytes !== after.max_file_bytes) changes.maxFileBytes = after.max_file_bytes;
  if (Object.keys(changes).length) audit.log(auditActionFor(changes), { userId: row.id, actorId: req.user.id, req, details: changes });
  if (changes.status === 'suspended') {
    await sessions.revokeAll(row.id);
    webhook.notify('user', 'Benutzer gesperrt', `**${row.username}** wurde von **${req.user.username}** gesperrt.`, 'error');
  }
  res.json({ ok: true, user: await users.getForAdmin(row.id) });
});

router.post('/api/admin/users/:id/password', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  const generated = !req.body.password;
  const password = generated ? users.generatePassword() : String(req.body.password);
  await users.setPassword(row.id, password, { mustChange: req.body.mustChange !== false });
  const endedSessions = await sessions.revokeAll(row.id, row.id === req.user.id ? req.session.id : null);
  audit.log('password_reset', { userId: row.id, actorId: req.user.id, req, details: { endedSessions } });
  res.json({ ok: true, password: generated ? password : undefined });
});

router.post('/api/admin/users/:id/reset-mfa', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  await totp.disable(row.id);
  audit.log('mfa_reset', { userId: row.id, actorId: req.user.id, req });
  webhook.notify(
    'security',
    '2FA zurückgesetzt',
    `**${req.user.username}** hat die Zwei-Faktor-Anmeldung von **${row.username}** zurückgesetzt.`,
    'error'
  );
  res.json({ ok: true });
});

router.delete('/api/admin/users/:id/passkeys', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  const count = await passkeys.removeAll(row.id);
  audit.log('passkey_removed', { userId: row.id, actorId: req.user.id, req, details: { count } });
  res.json({ ok: true, count });
});

router.post('/api/admin/users/:id/revoke-sessions', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  const count = await sessions.revokeAll(row.id, row.id === req.user.id ? req.session.id : null);
  audit.log('sessions_revoked', { userId: row.id, actorId: req.user.id, req, details: { count } });
  res.json({ ok: true, count });
});

router.post('/api/admin/users/:id/tokens', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  const { token, record } = await tokens.create(row.id, req.body.name || 'ShareX');
  audit.log('token_created', { userId: row.id, actorId: req.user.id, req, details: { name: record.name } });
  res.json({ ok: true, token, record });
});

router.delete('/api/admin/users/:id/tokens/:tokenId', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  await tokens.revoke(row.id, integer(req.params.tokenId));
  audit.log('token_revoked', { userId: row.id, actorId: req.user.id, req });
  res.json({ ok: true });
});

router.delete('/api/admin/users/:id/identities/:provider', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  if (!(await identities.unlink(row.id, req.params.provider))) throw notFound('Diese Verknüpfung gibt es nicht (mehr).');
  audit.log('identity_unlinked', { userId: row.id, actorId: req.user.id, req, details: { provider: req.params.provider } });
  res.json({ ok: true });
});

router.delete('/api/admin/users/:id', adminSudo, async (req, res) => {
  const row = await targetUser(req);
  if (row.id === req.user.id) throw badRequest('Dein eigenes Konto löschst du unter Konto › Konto löschen.');
  if (row.role === 'admin' && row.status === 'active' && (await users.countActiveAdmins()) <= 1)
    throw conflict('Es muss mindestens ein aktiver Admin bleiben.');
  await users.remove(row.id);
  audit.log('user_deleted', { userId: null, actorId: req.user.id, req, details: { username: row.username } });
  webhook.notify('user', 'Ein Nutzer wurde gelöscht', `Nutzername: **${row.username}**\nGelöscht von: **${req.user.username}**`);
  res.json({ ok: true });
});

router.post('/api/admin/invites', admin, async (req, res) => {
  if (req.body.role === 'admin') assertRecentAuth(req);
  const invite = await invites.create(req.user.id, req.body);
  audit.log('invite_created', { userId: null, actorId: req.user.id, req, details: { role: invite.role, code: invite.code.slice(0, 4) } });
  res.json({ ok: true, invite });
});

router.delete('/api/admin/invites/:code', admin, async (req, res) => {
  await invites.revoke(req.params.code);
  audit.log('invite_revoked', { userId: null, actorId: req.user.id, req, details: { code: String(req.params.code).slice(0, 4) } });
  res.json({ ok: true });
});

router.patch('/api/admin/settings', adminSudo, async (req, res) => {
  const { changed } = await settings.update(req.body, req.user.id);
  if (changed.length) {
    audit.log('settings_updated', { userId: null, actorId: req.user.id, req, details: { keys: changed } });
    webhook.notify('security', 'Einstellungen geändert', `**${req.user.username}** hat geändert: ${changed.join(', ')}`);
  }
  res.json({ ok: true, changed, ...settingsPayload() });
});

router.post('/api/admin/settings/webhook-test', admin, async (req, res) => {
  const url = text(req.body.url, 300).trim();
  if (url) settings.validatePatch({ 'webhook.url': url });
  const problem = await webhook.test(url || undefined);
  if (problem) throw badRequest(problem);
  res.json({ ok: true });
});

router.get('/api/admin/audit', admin, async (req, res) => {
  const events = await audit.list({
    userId: integer(req.query.userId),
    before: integer(req.query.before),
    limit: 40,
    actions: AUDIT_CATEGORIES[text(req.query.category, 20)] || null,
  });
  res.json({ events });
});

module.exports = router;
