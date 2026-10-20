'use strict';

const db = require('../lib/db');
const { randomToken, sha256 } = require('../lib/secrets');
const { storedIp, deviceLabel, isSecure, safeNext } = require('../lib/request');
const settings = require('./settingsService');
const audit = require('./auditService');

const COOKIE = 'ms_session';
const SHORT_SESSION_MS = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const ELEVATION_MS = 10 * 60 * 1000;

const lifetimeFor = (persistent) => (persistent ? settings.get('auth.sessionDays') * 86400000 : SHORT_SESSION_MS);

async function create(userId, { method, remember = true, req = null }) {
  const token = randomToken(32);
  const id = sha256(token);
  const now = Date.now();
  const expiresAt = now + lifetimeFor(remember);
  await db.run(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, persistent, method, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      now,
      now,
      expiresAt,
      remember ? 1 : 0,
      method,
      req ? storedIp(req) : null,
      req ? String(req.get('user-agent') || '').slice(0, 300) : null,
    ]
  );
  await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [now, userId]);
  return { token, id, expiresAt, persistent: Boolean(remember) };
}

const toUser = (row) => ({
  id: row.user_id,
  username: row.username,
  role: row.role,
  isAdmin: row.role === 'admin',
  status: row.status,
  mustChangePassword: Boolean(row.must_change_password),
  totpEnabled: Boolean(row.totp_enabled_at),
  passkeyCount: row.passkey_count || 0,
  hasPassword: Boolean(row.password_hash),
});

async function resolve(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const id = sha256(token);
  const row = await db.get(
    `SELECT s.*, u.username, u.role, u.status, u.must_change_password, u.totp_enabled_at,
            u.password AS password_hash,
            (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkey_count
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [id]
  );
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at <= now) {
    await db.run('DELETE FROM sessions WHERE id = ?', [id]);
    return null;
  }
  if (row.status !== 'active') return null;

  let refreshed = false;
  if (now - row.last_seen_at > TOUCH_INTERVAL_MS) {
    const expiresAt = Math.max(row.expires_at, now + lifetimeFor(row.persistent));
    row.expires_at = expiresAt;
    refreshed = true;
    await db.run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', [now, expiresAt, id]);
  }

  return {
    session: {
      id,
      method: row.method,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      persistent: Boolean(row.persistent),
      elevated: (row.elevated_until || 0) > now || now - row.created_at < ELEVATION_MS,
      refreshed,
    },
    user: toUser(row),
  };
}

async function listForUser(userId, currentId = null) {
  const rows = await db.all('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC', [userId, Date.now()]);
  return rows.map((row) => ({
    id: row.id,
    current: row.id === currentId,
    device: deviceLabel(row.user_agent),
    ip: row.ip,
    method: row.method,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    persistent: Boolean(row.persistent),
  }));
}

const revoke = (userId, id) => db.run('DELETE FROM sessions WHERE user_id = ? AND id = ?', [userId, id]).then((r) => r.changes > 0);

const revokeToken = (token) => db.run('DELETE FROM sessions WHERE id = ?', [sha256(token || '')]);

const revokeAll = (userId, exceptId = null) =>
  db
    .run(
      exceptId ? 'DELETE FROM sessions WHERE user_id = ? AND id <> ?' : 'DELETE FROM sessions WHERE user_id = ?',
      exceptId ? [userId, exceptId] : [userId]
    )
    .then((r) => r.changes);

const elevate = (id) => db.run('UPDATE sessions SET elevated_until = ? WHERE id = ?', [Date.now() + ELEVATION_MS, id]);

const cleanup = () => db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]).then((r) => r.changes);

function cookieOptions(req, { persistent, expiresAt }) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(req),
    path: '/',
    ...(persistent ? { maxAge: Math.max(0, expiresAt - Date.now()) } : {}),
  };
}

function pendingSetup(user) {
  if (!user) return null;
  if (user.mustChangePassword) return 'password';
  const enforce = settings.get('auth.enforceMfa');
  const required = enforce === 'all' || (enforce === 'admins' && user.isAdmin);
  return required && !user.totpEnabled ? 'mfa' : null;
}

const pendingSetupFor = (row) =>
  pendingSetup({
    isAdmin: row.role === 'admin',
    mustChangePassword: Boolean(row.must_change_password),
    totpEnabled: Boolean(row.totp_enabled_at),
  });

async function start(req, res, row, { method, remember = true, next = '' } = {}) {
  const created = await create(row.id, { method, remember, req });
  res.cookie(COOKIE, created.token, cookieOptions(req, created));
  audit.log('login', { userId: row.id, req, details: { method } });
  const setup = pendingSetupFor(row);
  return setup ? `/account?setup=${setup}` : safeNext(next);
}

module.exports = {
  COOKIE,
  create,
  start,
  resolve,
  pendingSetup,
  listForUser,
  revoke,
  revokeToken,
  revokeAll,
  elevate,
  cleanup,
  cookieOptions,
};
