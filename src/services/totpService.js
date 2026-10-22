'use strict';

const crypto = require('crypto');
const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const settings = require('./settingsService');
const { encrypt, decrypt, sha256, safeEqual } = require('../lib/secrets');
const { qrSvg } = require('../lib/qr');
const { badRequest, HttpError } = require('../lib/errors');

const STEP_SECONDS = 30;
const DIGITS = 6;
const SETUP_TTL_MS = 15 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text)
    .toUpperCase()
    .replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Ungültiges Base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

const stepAt = (time = Date.now()) => Math.floor(time / 1000 / STEP_SECONDS);

function matchStep(secretBase32, code, { lastStep = null, now = Date.now() } = {}) {
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length !== DIGITS) return null;
  const secret = base32Decode(secretBase32);
  const current = stepAt(now);
  for (const step of [current, current - 1, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (safeEqual(hotp(secret, step), digits)) return step;
  }
  return null;
}

const SETUP = 'totp-setup';

function otpauthUri(secret, username) {
  const issuer = settings.get('site.title') || 'MoeShare';
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;
  const query = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${query}`;
}

async function beginSetup(user) {
  const secret = base32Encode(crypto.randomBytes(20));
  await ephemeral.put(SETUP, String(user.id), { secret: encrypt(secret) }, SETUP_TTL_MS);
  const uri = otpauthUri(secret, user.username);
  return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), uri, qr: qrSvg(uri) };
}

async function generateRecoveryCodes(userId) {
  await db.run('DELETE FROM recovery_codes WHERE user_id = ?', [userId]);
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = base32Encode(crypto.randomBytes(7)).toLowerCase().slice(0, 10);
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    await db.run('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)', [userId, sha256(raw)]);
  }
  return codes;
}

async function enable(userId, code) {
  const entry = await ephemeral.get(SETUP, String(userId));
  let secret = null;
  try {
    secret = entry ? decrypt(entry.secret) : null;
  } catch {
    secret = null;
  }
  if (!secret) throw badRequest('Die Einrichtung ist abgelaufen. Starte sie bitte neu.');
  const step = matchStep(secret, code);
  if (step === null) throw badRequest('Der Code stimmt nicht. Prüfe die Uhrzeit deines Geräts und versuche den nächsten Code.');
  if (!(await ephemeral.take(SETUP, String(userId)))) throw badRequest('Die Einrichtung ist abgelaufen. Starte sie bitte neu.');

  await db.run('UPDATE users SET totp_secret = ?, totp_enabled_at = ?, totp_last_step = ? WHERE id = ?', [
    encrypt(secret),
    Date.now(),
    step,
    userId,
  ]);
  return generateRecoveryCodes(userId);
}

async function disable(userId) {
  await ephemeral.remove(SETUP, String(userId));
  await db.run('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?', [userId]);
  await db.run('DELETE FROM recovery_codes WHERE user_id = ?', [userId]);
}

async function verifyCode(userId, code) {
  const row = await db.get('SELECT totp_secret, totp_enabled_at, totp_last_step FROM users WHERE id = ?', [userId]);
  if (!row || !row.totp_enabled_at || !row.totp_secret) return false;
  let secret;
  try {
    secret = decrypt(row.totp_secret);
  } catch {
    throw new HttpError(
      500,
      'Der 2FA-Schlüssel kann nicht gelesen werden (db/.secret fehlt oder wurde ersetzt). Ein Admin muss 2FA zurücksetzen.'
    );
  }
  const step = matchStep(secret, code, { lastStep: row.totp_last_step });
  if (step === null) return false;
  await db.run('UPDATE users SET totp_last_step = ? WHERE id = ?', [step, userId]);
  return true;
}

const normalizeRecovery = (code) =>
  String(code || '')
    .toLowerCase()
    .replace(/[^a-z2-7]/g, '');

async function useRecoveryCode(userId, code) {
  const normalized = normalizeRecovery(code);
  if (normalized.length !== 10) return -1;
  const row = await db.get('SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL', [
    userId,
    sha256(normalized),
  ]);
  if (!row) return -1;
  await db.run('UPDATE recovery_codes SET used_at = ? WHERE id = ?', [Date.now(), row.id]);
  return remainingRecoveryCodes(userId);
}

const remainingRecoveryCodes = (userId) => db.count('SELECT COUNT(*) FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', [userId]);

async function verifySecondFactor(userId, input) {
  const value = String(input || '').trim();
  if (/^\d{6}$/.test(value.replace(/\s/g, ''))) {
    return (await verifyCode(userId, value)) ? { ok: true, method: 'totp' } : { ok: false };
  }
  const left = await useRecoveryCode(userId, value);
  return left >= 0 ? { ok: true, method: 'recovery', recoveryCodesLeft: left } : { ok: false };
}

module.exports = { beginSetup, enable, disable, verifySecondFactor, generateRecoveryCodes, remainingRecoveryCodes };
