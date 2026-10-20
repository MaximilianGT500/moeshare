'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const KEY_FILE = config.paths.secret;
let key = null;

function createKeyFile() {
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  const fresh = crypto.randomBytes(32).toString('base64');
  const tmp = `${KEY_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, fresh, { mode: 0o600 });
  try {
    fs.linkSync(tmp, KEY_FILE);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      try {
        fs.writeFileSync(KEY_FILE, fresh, { mode: 0o600, flag: 'wx' });
      } catch (fallbackError) {
        if (fallbackError.code !== 'EEXIST') throw fallbackError;
      }
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function loadKey() {
  if (key) return key;
  if (!fs.existsSync(KEY_FILE)) createKeyFile();
  const stored = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
  if (stored.length !== 32) {
    throw new Error(`${KEY_FILE} ist beschädigt (erwartet: 32 Byte, Base64). Stelle die Datei aus deiner Sicherung wieder her.`);
  }
  key = stored;
  return key;
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
}

function decrypt(blob) {
  if (typeof blob !== 'string' || !blob.startsWith('v1:')) throw new Error('Unbekanntes Format');
  const raw = Buffer.from(blob.slice(3), 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

module.exports = { loadKey, randomToken, sha256, safeEqual, encrypt, decrypt };
