'use strict';

const express = require('express');
const config = require('../config');
const errorReports = require('../lib/errorReports');
const logger = require('../lib/logger');
const { badRequest, conflict, notFound } = require('../lib/errors');
const { tr } = require('../lib/i18n');
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
const storage = require('../services/storageService');
const backups = require('../services/backupService');
const domains = require('../services/domainService');
const reports = require('../services/reportService');
const emails = require('../services/emailService');
const mail = require('../services/mailService');
const db = require('../lib/db');
const media = require('../lib/media');
const passwords = require('../lib/passwords');
const { counts: tableCounts } = require('../lib/db/transfer');
const scans = require('../services/scanService');
const importer = require('../services/importService');
const jobs = require('../services/jobService');
const redirects = require('../services/redirectService');

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
    'email_changed',
    'email_removed',
    'domain_added',
    'domain_verified',
    'domain_removed',
    'virus_found',
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
    'design_updated',
    'report_resolved',
    'content_blocked',
    'content_unblocked',
    'domain_revoked',
    'import_finished',
    'webhook_changed',
  ],
};

const LOCALIZED_DEFAULTS = ['home.text'];

const settingsPayload = (req) => ({
  ...settings.forAdmin(),
  localizedDefaults: Object.fromEntries(
    LOCALIZED_DEFAULTS.map((key) => {
      const value = settings.defaultFor(key);
      return [key, { value, localized: tr(req, value) }];
    })
  ),
  redirectUris: oauth.redirectUris(),
  environment: { port: config.port, logLevel: logger.level, logFormat: logger.format, errorReports: errorReports.destination() },
});

async function databaseInfo() {
  const info = await db.info();
  return { ...info, tables: await tableCounts(db) };
}

let migration = null;

async function storageInfo() {
  return {
    driver: storage.activeDriver(),
    configured: storage.configured(),
    counts: await storage.counts(),
    migration: migration ? { ...migration } : null,
    ffmpeg: media.ffmpegVersion,
  };
}

async function backupInfo() {
  const [items, status] = await Promise.all([backups.list().catch((error) => ({ error: error.message })), backups.status()]);
  return Array.isArray(items) ? { items, ...status } : { items: [], listError: items.error, ...status };
}

async function targetUser(req) {
  const row = await users.findById(integer(req.params.id));
  if (!row) throw notFound('Benutzer nicht gefunden.');
  return row;
}

const domainList = async (req) => (await domains.listAll()).map((item) => ({ ...item, error: item.error ? tr(req, item.error) : null }));

router.get('/admin', requirePage({ admin: true }), async (req, res) => {
  const [
    stats,
    userStats,
    userList,
    fileList,
    inviteList,
    events,
    sudo,
    homeStats,
    database,
    storageState,
    backupState,
    openReports,
    domainItems,
    webhookTargets,
  ] = await Promise.all([
    files.globalStats(),
    files.userStats(req.user.username),
    users.listForAdmin(),
    files.listAll({ page: 1, limit: 25 }),
    invites.list(),
    audit.list({ limit: 40, language: req.language }),
    viewer.confirmMethods(req.user),
    home.allStats(),
    databaseInfo(),
    storageInfo(),
    backupInfo(),
    reports.openCount(),
    domainList(req),
    webhook.list(),
  ]);
  renderPage(res, {
    page: 'admin',
    title: 'Admin',
    data: {
      user: viewer.summary(req.user),
      greeting: tr(req, greeting()),
      stats,
      userStats,
      system: systemInfo(),
      users: userList,
      files: fileList,
      invites: inviteList,
      settings: settingsPayload(req),
      audit: events,
      sudo,
      homeStats,
      database,
      storage: storageState,
      backups: backupState,
      moderation: { open: openReports, enabled: reports.enabled() },
      domains: domainItems,
      mail: { ready: mail.ready() },
      webhooks: { targets: webhookTargets, kinds: webhook.KINDS, events: settings.WEBHOOK_EVENTS },
      imports: importInfo(),
    },
  });
});

function importInfo() {
  return {
    sources: Object.values(importer.IMPORTERS).map(({ id, label }) => ({ id, label })),
    argon2: passwords.argon2Supported,
    redirects: redirects.count(),
  };
}

router.get('/api/admin/database', admin, async (req, res) => {
  res.json(await databaseInfo());
});

router.get('/api/admin/storage', admin, async (req, res) => {
  res.json(await storageInfo());
});

router.post('/api/admin/storage/test', admin, async (req, res) => {
  const body = req.body || {};
  const overrides = {};
  const patch = {};
  for (const [field, key] of [
    ['endpoint', 'storage.s3.endpoint'],
    ['region', 'storage.s3.region'],
    ['bucket', 'storage.s3.bucket'],
    ['accessKeyId', 'storage.s3.accessKeyId'],
    ['secretAccessKey', 'storage.s3.secretAccessKey'],
    ['prefix', 'storage.s3.prefix'],
    ['pathStyle', 'storage.s3.pathStyle'],
  ]) {
    if (body[field] !== undefined && body[field] !== '') patch[key] = body[field];
  }
  const valid = settings.validatePatch(patch);
  const map = {
    'storage.s3.endpoint': 'endpoint',
    'storage.s3.region': 'region',
    'storage.s3.bucket': 'bucket',
    'storage.s3.accessKeyId': 'accessKeyId',
    'storage.s3.secretAccessKey': 'secretAccessKey',
    'storage.s3.prefix': 'prefix',
    'storage.s3.pathStyle': 'forcePathStyle',
  };
  for (const [key, value] of Object.entries(valid)) overrides[map[key]] = value === '' ? undefined : value;
  try {
    res.json(await storage.testConnection(overrides));
  } catch (error) {
    throw badRequest(error.message || 'Die Verbindung zu S3 ist fehlgeschlagen.');
  }
});

router.post('/api/admin/storage/migrate', adminSudo, async (req, res) => {
  const to = req.body && req.body.to;
  if (!['local', 's3'].includes(to)) throw badRequest('Unbekannter Speicherort.');
  if (!storage.configured()) throw badRequest('Richte zuerst S3 ein und speichere die Einstellungen.');
  if (migration && !migration.finishedAt) throw conflict('Es werden gerade schon Dateien verschoben.');
  migration = { to, startedAt: Date.now(), total: null, done: 0, moved: 0, failed: 0, missing: 0, finishedAt: null, error: null };
  audit.log('settings_updated', { userId: null, actorId: req.user.id, req, details: { keys: [`storage.migrate:${to}`] } });
  storage
    .migrate(to, { onProgress: (progress) => Object.assign(migration, progress) })
    .then((result) => Object.assign(migration, result, { finishedAt: Date.now() }))
    .catch((error) => Object.assign(migration, { error: error.message, finishedAt: Date.now() }));
  res.status(202).json({ ok: true, migration });
});

router.get('/api/admin/backups', admin, async (req, res) => {
  res.json(await backupInfo());
});

router.post('/api/admin/backups', adminSudo, async (req, res) => {
  if (backups.isRunning()) throw conflict('Es läuft schon eine Sicherung.');
  const includeUploads =
    req.body && typeof req.body.includeUploads === 'boolean' ? req.body.includeUploads : settings.get('backup.includeUploads');
  backups.create({ includeUploads, reason: 'manual', actor: req.user.username }).catch(() => {});
  res.status(202).json({ ok: true, ...(await backups.status()) });
});

router.get('/api/admin/backups/:name/download', adminSudo, async (req, res) => {
  const location = req.query.location === 's3' ? 's3' : 'local';
  if (req.query.probe) {
    const items = await backups.list();
    if (!items.some((item) => item.name === req.params.name && item.location === location))
      throw notFound('Diese Sicherung gibt es nicht mehr.');
    return res.json({ ok: true });
  }
  return backups.send(res, req.params.name, location);
});

router.delete('/api/admin/backups/:name', adminSudo, async (req, res) => {
  await backups.remove(req.params.name, req.query.location === 's3' ? 's3' : 'local');
  res.json({ ok: true, ...(await backupInfo()) });
});

router.get('/api/admin/stats', admin, async (req, res) => {
  res.json(await files.globalStats());
});

router.get('/api/admin/system', admin, (req, res) => {
  res.json(systemInfo());
});

router.get('/api/admin/files', admin, async (req, res) => {
  res.json(
    await files.listAll({
      search: text(req.query.search, 200),
      page: req.query.page,
      limit: req.query.limit,
      trash: req.query.trash === '1',
    })
  );
});

router.delete('/api/admin/files/:username/:filename', admin, async (req, res) => {
  const { username, filename } = req.params;
  if (!isValidUsername(username)) throw badRequest('Ungültiger Benutzername.');
  const permanent = req.query.permanent === '1';
  const { trashed } = await files.remove(username, filename, { actorId: req.user.id, permanent });
  if (username !== req.user.username) {
    audit.log('file_deleted', { userId: null, actorId: req.user.id, req, details: { owner: username, filename, trash: trashed } });
  }
  webhook.notify(
    'delete',
    trashed ? 'Eine Datei wurde in den Papierkorb gelegt' : 'Eine Datei wurde gelöscht',
    `Nutzername: **${username}**\nDatei: **${filename}**\nGelöscht von: **${req.user.username}**`
  );
  res.json({ ok: true, trashed });
});

async function trashedRecord(req) {
  const record = await files.findById(integer(req.params.id));
  if (!record || !record.deleted_at) throw notFound('Diese Datei liegt nicht (mehr) im Papierkorb.');
  return record;
}

router.post('/api/admin/trash/:id/restore', admin, async (req, res) => {
  const record = await files.restore(await trashedRecord(req));
  res.json({ ok: true, file: files.toFile(record) });
});

router.delete('/api/admin/trash/:id', admin, async (req, res) => {
  const record = await trashedRecord(req);
  await files.removeRecord(record, 'trash');
  if (record.username !== req.user.username) {
    audit.log('file_deleted', { userId: null, actorId: req.user.id, req, details: { owner: record.username, filename: record.filename } });
  }
  res.json({ ok: true });
});

router.get('/api/admin/domains', admin, async (req, res) => {
  res.json({ domains: await domainList(req) });
});

router.delete('/api/admin/domains/:id', admin, async (req, res) => {
  const removed = await domains.removeAny(req.params.id);
  audit.log('domain_revoked', { userId: removed.userId, actorId: req.user.id, req, details: { domain: removed.domain } });
  res.json({ ok: true, domains: await domainList(req) });
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
    audit.list({ userId: row.id, limit: 30, language: req.language }),
  ]);
  res.json({
    user,
    sessions: sessionList.map((session) => ({ ...session, device: tr(req, session.device) })),
    tokens: tokenList,
    passkeys: passkeyList.map((passkey) => ({ ...passkey, name: tr(req, passkey.name) })),
    activity,
  });
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
  const address = text(req.body.email, 191).trim();
  if (address) emails.normalizeEmail(address);
  const invite = await invites.create(req.user.id, req.body);
  audit.log('invite_created', { userId: null, actorId: req.user.id, req, details: { role: invite.role, code: invite.code.slice(0, 4) } });
  let sent = null;
  let mailError = null;
  if (address) {
    try {
      sent = await emails.sendInvite(address, invite, req.user.username, req.language);
    } catch (error) {
      mailError = tr(req, error.message);
    }
  }
  res.json({ ok: true, invite, sent, mailError });
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
  res.json({ ok: true, changed, ...settingsPayload(req) });
});

router.post('/api/admin/settings/webhook-test', admin, async (req, res) => {
  const url = text(req.body.url, 300).trim();
  if (url) settings.validatePatch({ 'webhook.url': url });
  const problem = await webhook.testDiscordUrl(url || settings.get('webhook.url'));
  if (problem) throw badRequest(problem);
  res.json({ ok: true });
});

router.post('/api/admin/settings/mail-test', admin, async (req, res) => {
  const row = await users.findById(req.user.id);
  const to = text(req.body.to, 191).trim() || (row && row.email_verified_at ? row.email : '');
  if (!to) throw badRequest('Gib eine Adresse für die Testnachricht ein.', { field: 'to' });
  emails.normalizeEmail(to);
  try {
    res.json({ ok: true, to, ...(await mail.test(to, req.language)) });
  } catch (error) {
    throw badRequest(tr(req, 'Der Versand ist fehlgeschlagen: {reason}', { reason: tr(req, error.message) }));
  }
});

router.get('/api/admin/webhooks', admin, async (req, res) => {
  res.json({ targets: await webhook.list() });
});

router.post('/api/admin/webhooks', adminSudo, async (req, res) => {
  const target = await webhook.create(req.body || {});
  audit.log('webhook_changed', {
    userId: null,
    actorId: req.user.id,
    req,
    details: { name: target.name, kind: target.kind, change: 'created' },
  });
  res.json({ ok: true, target, targets: await webhook.list() });
});

router.patch('/api/admin/webhooks/:id', adminSudo, async (req, res) => {
  const target = await webhook.update(req.params.id, req.body || {});
  audit.log('webhook_changed', {
    userId: null,
    actorId: req.user.id,
    req,
    details: { name: target.name, kind: target.kind, change: 'updated' },
  });
  res.json({ ok: true, target, targets: await webhook.list() });
});

router.delete('/api/admin/webhooks/:id', adminSudo, async (req, res) => {
  await webhook.remove(req.params.id);
  audit.log('webhook_changed', { userId: null, actorId: req.user.id, req, details: { change: 'removed' } });
  res.json({ ok: true, targets: await webhook.list() });
});

router.post('/api/admin/webhooks/test', admin, async (req, res) => {
  const failure = await webhook.test(null, req.body || {});
  if (failure) throw badRequest(tr(req, failure.message));
  res.json({ ok: true });
});

router.post('/api/admin/webhooks/:id/test', admin, async (req, res) => {
  const body = req.body && Object.keys(req.body).length ? req.body : null;
  const failure = await webhook.test(req.params.id, body);
  if (failure) throw badRequest(tr(req, failure.message));
  res.json({ ok: true, targets: await webhook.list() });
});

router.post('/api/admin/clamav/test', admin, async (req, res) => {
  const body = req.body || {};
  const patch = {};
  for (const key of ['host', 'port', 'socket']) if (body[key] !== undefined && body[key] !== '') patch[`clamav.${key}`] = body[key];
  const valid = settings.validatePatch(patch);
  try {
    res.json(
      await scans.test({
        host: valid['clamav.host'],
        port: valid['clamav.port'],
        socket: body.socket === '' ? '' : valid['clamav.socket'],
      })
    );
  } catch (error) {
    throw badRequest(
      tr(req, 'ClamAV ist nicht erreichbar: {reason}', {
        reason: error.code === 'ETIMEDOUT' ? tr(req, 'Zeitüberschreitung') : tr(req, error.message),
      })
    );
  }
});

router.post('/api/admin/import/preview', adminSudo, async (req, res) => {
  res.json({ ok: true, preview: await importer.preview(req.body || {}) });
});

router.post('/api/admin/import', adminSudo, async (req, res) => {
  res.status(202).json({ ok: true, job: importer.start(req.user, req.body || {}) });
});

router.get('/api/admin/jobs/:id', admin, async (req, res) => {
  const job = await jobs.get(req.user, req.params.id, { admin: true });
  if (job.error) job.error = { ...job.error, message: tr(req, job.error.message) };
  res.json({ job });
});

router.get('/api/admin/audit', admin, async (req, res) => {
  const events = await audit.list({
    userId: integer(req.query.userId),
    before: integer(req.query.before),
    limit: 40,
    actions: AUDIT_CATEGORIES[text(req.query.category, 20)] || null,
    language: req.language,
  });
  res.json({ events });
});

module.exports = router;
