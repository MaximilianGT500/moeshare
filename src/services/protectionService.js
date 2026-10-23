'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const secrets = require('../lib/secrets');
const passwords = require('../lib/passwords');
const { isSecure } = require('../lib/request');

const PASSWORD_COST = 10;
const COOKIE_PREFIX = 'ms_u_';
const UNLOCK_MS = 12 * 60 * 60 * 1000;
const GRANT_MS = 15 * 60 * 1000;
const MAX_PASSWORD = 200;

let signingKey = null;
const key = () => {
  if (!signingKey) signingKey = crypto.createHmac('sha256', secrets.loadKey()).update('moeshare-unlock-v1').digest();
  return signingKey;
};

const mac = (name, until) => crypto.createHmac('sha256', key()).update(`${name}.${until}`).digest('base64url').slice(0, 32);
const cookieName = (kind, id) => `${COOKIE_PREFIX}${kind}${id}`;

function grant(req, res, kind, id, ttlMs = UNLOCK_MS) {
  const name = cookieName(kind, id);
  const until = Date.now() + ttlMs;
  res.cookie(name, `${until}.${mac(name, until)}`, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: '/', maxAge: ttlMs });
}

function granted(req, kind, id) {
  const name = cookieName(kind, id);
  const value = req.cookies && req.cookies[name];
  if (typeof value !== 'string') return false;
  const [untilText, signature] = value.split('.');
  const until = Number(untilText);
  if (!Number.isFinite(until) || until < Date.now() || typeof signature !== 'string') return false;
  const expected = Buffer.from(mac(name, until));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

async function hashPassword(password) {
  if (password === undefined || password === null || password === '') return null;
  const text = String(password);
  if (text.length > MAX_PASSWORD) return { error: 'too_long' };
  return bcrypt.hash(text, PASSWORD_COST);
}

async function checkPassword(hash, password) {
  if (!hash || typeof password !== 'string' || !password || password.length > MAX_PASSWORD) return false;
  return passwords.verify(hash, password);
}

const isOwner = (req, username) => Boolean(req.user && (req.user.username === username || req.user.isAdmin));

function fileAccess(req, record, { now = Date.now() } = {}) {
  if (record.expires_at && Number(record.expires_at) <= now) return { state: 'expired' };
  if (isOwner(req, record.username)) return { state: 'open', owner: true };
  if (record.deleted_at) return { state: 'missing' };
  if (record.blocked_at) return { state: 'blocked' };
  if (record.password_hash && !granted(req, 'f', record.id)) return { state: 'locked' };
  if (record.max_views && !granted(req, 'g', record.id)) {
    return Number(record.views) >= Number(record.max_views) ? { state: 'used' } : { state: 'once' };
  }
  return { state: 'open' };
}

const isProtected = (record) => Boolean(record.password_hash || record.max_views);

module.exports = {
  GRANT_MS,
  UNLOCK_MS,
  MAX_PASSWORD,
  grant,
  granted,
  hashPassword,
  checkPassword,
  fileAccess,
  isOwner,
  isProtected,
};
