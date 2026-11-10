'use strict';

const db = require('../lib/db');
const { randomToken, sha256 } = require('../lib/secrets');
const { deviceLabel, isSecure, storedIp } = require('../lib/request');
const emails = require('./emailService');

const COOKIE = 'ms_device';
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

const cookieOf = (req) => {
  const value = req.cookies && req.cookies[COOKIE];
  return typeof value === 'string' && TOKEN.test(value) ? value : null;
};

function ensureCookie(req, res) {
  const existing = cookieOf(req);
  if (existing) return existing;
  const token = randomToken(24);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: '/', maxAge: MAX_AGE_MS });
  if (req.cookies) req.cookies[COOKIE] = token;
  return token;
}

const labelOf = (req) => deviceLabel(req.get('user-agent')).slice(0, 120);

async function remember(userId, token, label) {
  const hash = sha256(token);
  const now = Date.now();
  const known = await db.get('SELECT id FROM user_devices WHERE user_id = ? AND device_hash = ?', [userId, hash]);
  if (known) {
    await db.run('UPDATE user_devices SET last_seen_at = ?, label = ? WHERE id = ?', [now, label, known.id]);
    return { known: true, first: false };
  }
  const first = (await db.count('SELECT COUNT(*) FROM user_devices WHERE user_id = ?', [userId])) === 0;
  await db.insertIgnore('user_devices', { user_id: userId, device_hash: hash, label, created_at: now, last_seen_at: now });
  return { known: false, first };
}

async function signedIn(req, res, row, method) {
  const label = labelOf(req);
  const { known, first } = await remember(row.id, ensureCookie(req, res), label);
  if (known || first || method === 'setup') return false;
  emails.notifyNewDevice(row.id, { device: label, method, ip: storedIp(req), at: Date.now() });
  return true;
}

async function seen(req, res, user) {
  if (!req.path.startsWith('/api/') || cookieOf(req)) return;
  await remember(user.id, ensureCookie(req, res), labelOf(req));
}

module.exports = { COOKIE, signedIn, seen };
