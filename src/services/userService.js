'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../lib/db');
const cache = require('../lib/cache');
const { badRequest, conflict, notFound } = require('../lib/errors');
const { ensureUserDirs } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');
const identities = require('./identityService');

const BCRYPT_COST = 12;
const ROLES = ['admin', 'mitglied'];

const findById = (id) => db.get('SELECT * FROM users WHERE id = ?', [id]);
const findByName = (username) =>
  db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE ORDER BY username = ? DESC LIMIT 1', [username, username]);

const count = () => db.count('SELECT COUNT(*) FROM users');
const countActiveAdmins = () => db.count("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'");

async function findOrFail(id) {
  const user = await findById(id);
  if (!user) throw notFound('Benutzer nicht gefunden.');
  return user;
}

function validateUsername(input) {
  const username = typeof input === 'string' ? input.trim() : '';
  if (username.length < 2 || username.length > 32)
    throw badRequest('Der Benutzername muss 2 bis 32 Zeichen lang sein.', { field: 'username' });
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(username)) {
    throw badRequest(
      'Erlaubt sind Buchstaben ohne Umlaute, Ziffern, Punkt, Unterstrich und Bindestrich (am Anfang ein Buchstabe oder eine Ziffer).',
      {
        field: 'username',
      }
    );
  }
  return username;
}

function validatePassword(password, username = '') {
  const min = settings.get('auth.passwordMinLength');
  const invalid = (message) => badRequest(message, { field: 'password' });
  if (typeof password !== 'string' || password.length < min) throw invalid(`Das Passwort muss mindestens ${min} Zeichen lang sein.`);
  if (Buffer.byteLength(password, 'utf8') > 72) throw invalid('Das Passwort ist zu lang (höchstens 72 Byte).');
  if (username && password.toLowerCase().includes(username.toLowerCase()))
    throw invalid('Das Passwort darf den Benutzernamen nicht enthalten.');
  if (/^(.)\1+$/.test(password)) throw invalid('Das Passwort darf nicht aus nur einem Zeichen bestehen.');
  return password;
}

async function validateNewAccount(username, password) {
  const name = validateUsername(username);
  if (await findByName(name)) throw conflict('Dieser Benutzername ist schon vergeben.', { field: 'username' });
  if (password) validatePassword(password, name);
  return name;
}

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

let timingHash = null;

async function verifyPassword(user, password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 200) return false;
  if (!user || !user.password) {
    timingHash = timingHash || (await bcrypt.hash('moeshare-timing-equalizer', BCRYPT_COST));
    await bcrypt.compare(password, timingHash);
    return false;
  }
  const ok = await bcrypt.compare(password, user.password);
  if (ok && bcrypt.getRounds(user.password) < BCRYPT_COST && Buffer.byteLength(password, 'utf8') <= 72) {
    db.run('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(password), user.id]).catch(() => {});
  }
  return ok;
}

function validateLimit(value, label, field) {
  if (value === null || value === undefined || value === '') return null;
  if (!Number.isFinite(value) || value < 1024 * 1024) throw badRequest(`${label}: bitte mindestens 1 MB angeben.`, { field });
  return Math.round(value);
}

async function create({
  username,
  password = '',
  role = 'mitglied',
  quotaBytes = null,
  maxFileBytes = null,
  mustChangePassword = false,
  identity = null,
}) {
  const name = await validateNewAccount(username, password);
  if (!password && !identity) throw badRequest('Ein Passwort ist erforderlich.', { field: 'password' });
  if (identity) await identities.assertFree(identity.provider, identity.subject, null, identity.label);

  const now = Date.now();
  const { lastID } = await db.run(
    `INSERT INTO users (username, password, role, status, quota_bytes, max_file_bytes, created_at, password_changed_at, must_change_password)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      name,
      password ? await hashPassword(password) : '',
      role === 'admin' ? 'admin' : 'mitglied',
      validateLimit(quotaBytes, 'Speicherlimit', 'quotaBytes'),
      validateLimit(maxFileBytes, 'Maximale Dateigröße', 'maxFileBytes'),
      now,
      password ? now : null,
      mustChangePassword && password ? 1 : 0,
    ]
  );
  if (identity) await identities.link(lastID, identity.provider, identity, identity.label);
  ensureUserDirs(name);
  cache.clear();
  return findById(lastID);
}

async function setPassword(userId, password, { mustChange = false } = {}) {
  const user = await findOrFail(userId);
  validatePassword(password, user.username);
  await db.run('UPDATE users SET password = ?, password_changed_at = ?, must_change_password = ? WHERE id = ?', [
    await hashPassword(password),
    Date.now(),
    mustChange ? 1 : 0,
    userId,
  ]);
}

const WORDS = ['fuchs', 'wolke', 'birke', 'meer', 'stern', 'kiesel', 'nebel', 'funke', 'eule', 'welle', 'moos', 'blitz'];

function generatePassword() {
  const chunk = () => crypto.randomBytes(3).toString('base64url').slice(0, 4);
  const word = () => WORDS[crypto.randomInt(WORDS.length)];
  return `${word()}-${chunk()}-${word()}-${chunk()}`;
}

async function update(userId, patch, { actorId } = {}) {
  const user = await findOrFail(userId);
  const fields = {};

  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw badRequest('Ungültige Rolle.', { field: 'role' });
    fields.role = patch.role;
  }
  if (patch.status !== undefined) {
    if (!['active', 'suspended'].includes(patch.status)) throw badRequest('Ungültiger Status.', { field: 'status' });
    fields.status = patch.status;
    const reason = typeof patch.suspendedReason === 'string' ? patch.suspendedReason.trim().slice(0, 200) : '';
    fields.suspended_reason = patch.status === 'suspended' && reason ? reason : null;
  }
  if (patch.quotaBytes !== undefined) fields.quota_bytes = validateLimit(patch.quotaBytes, 'Speicherlimit', 'quotaBytes');
  if (patch.maxFileBytes !== undefined) fields.max_file_bytes = validateLimit(patch.maxFileBytes, 'Maximale Dateigröße', 'maxFileBytes');

  const losesAdmin =
    user.role === 'admin' &&
    user.status === 'active' &&
    ((fields.role && fields.role !== 'admin') || (fields.status && fields.status !== 'active'));
  if (losesAdmin) {
    if (actorId === user.id) throw badRequest('Du kannst dir die Admin-Rechte nicht selbst entziehen oder dich sperren.');
    if ((await countActiveAdmins()) <= 1) throw badRequest('Es muss mindestens ein aktiver Admin bleiben.');
  }

  const keys = Object.keys(fields);
  if (keys.length) {
    await db.run(`UPDATE users SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, [
      ...keys.map((key) => fields[key]),
      userId,
    ]);
    cache.clear();
  }
  return { before: user, after: await findById(userId) };
}

const effectiveLimits = (user) => ({
  quotaBytes: user.quota_bytes || settings.get('uploads.defaultQuotaBytes') || null,
  maxFileBytes: user.max_file_bytes || settings.get('uploads.maxFileBytes') || null,
});

const usageBytes = (username) => db.count('SELECT COALESCE(SUM(size_bytes), 0) FROM file_data WHERE username = ?', [username]);

function toAdminUser(row, linked = []) {
  const limits = effectiveLimits(row);
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    suspendedReason: row.suspended_reason || '',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    storageBytes: row.storage_bytes || 0,
    files: row.files || 0,
    views: row.views || 0,
    quotaBytes: row.quota_bytes,
    maxFileBytes: row.max_file_bytes,
    effectiveQuotaBytes: limits.quotaBytes,
    effectiveMaxFileBytes: limits.maxFileBytes,
    totp: Boolean(row.totp_enabled_at),
    passkeys: row.passkeys || 0,
    identities: linked,
    hasPassword: Boolean(row.password),
    mustChangePassword: Boolean(row.must_change_password),
  };
}

const ADMIN_LIST = `
  SELECT u.*, COALESCE(f.bytes, 0) AS storage_bytes, COALESCE(f.files, 0) AS files, COALESCE(f.views, 0) AS views,
         (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkeys
  FROM users u
  LEFT JOIN (
    SELECT username, SUM(size_bytes) AS bytes, COUNT(*) AS files, SUM(views) AS views FROM file_data GROUP BY username
  ) f ON f.username = u.username
`;

async function listForAdmin(search = '') {
  const term = typeof search === 'string' ? search.trim() : '';
  const rows = term
    ? await db.all(`${ADMIN_LIST} WHERE u.username LIKE ? ESCAPE '\\' ORDER BY u.id`, [
        `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
      ])
    : await db.all(`${ADMIN_LIST} ORDER BY u.id`);
  const linked = await identities.listByUser();
  return rows.map((row) => toAdminUser(row, linked.get(row.id)));
}

async function getForAdmin(userId) {
  const row = await db.get(`${ADMIN_LIST} WHERE u.id = ?`, [userId]);
  return row ? toAdminUser(row, await identities.listForUser(row.id)) : null;
}

async function remove(userId) {
  const user = await findOrFail(userId);
  await files.removeAllForUser(user.username);
  for (const table of ['sessions', 'api_tokens', 'passkeys', 'recovery_codes', 'identities']) {
    await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [user.id]);
  }
  await db.run('DELETE FROM users WHERE id = ?', [user.id]);
  cache.clear();
  return user;
}

module.exports = {
  ROLES,
  findById,
  findByName,
  count,
  countActiveAdmins,
  validateNewAccount,
  verifyPassword,
  generatePassword,
  create,
  setPassword,
  update,
  effectiveLimits,
  usageBytes,
  listForAdmin,
  getForAdmin,
  remove,
};
