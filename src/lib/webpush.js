'use strict';

const crypto = require('crypto');

const RECORD_SIZE = 4096;
const SERVICE_HOSTS = [
  /(^|\.)googleapis\.com$/,
  /(^|\.)google\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

const isPushService = (url) => url.protocol === 'https:' && !url.port && SERVICE_HOSTS.some((pattern) => pattern.test(url.hostname));

const b64 = (value) => Buffer.from(value).toString('base64url');
const unb64 = (value) => Buffer.from(String(value || ''), 'base64url');

function generateKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: b64(Buffer.concat([Buffer.from([4]), unb64(jwk.x), unb64(jwk.y)])), privateKey: jwk.d };
}

function privateKeyObject(publicKey, d) {
  const raw = unb64(publicKey);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d, x: b64(raw.subarray(1, 33)), y: b64(raw.subarray(33, 65)) },
    format: 'jwk',
  });
}

function validPublicKey(value) {
  const raw = unb64(value);
  if (raw.length !== 65 || raw[0] !== 4) return false;
  try {
    crypto.ECDH.convertKey(raw, 'prime256v1', undefined, undefined, 'compressed');
    return true;
  } catch {
    return false;
  }
}

function vapidToken({ audience, subject, publicKey, privateKey, lifetimeSeconds = 12 * 60 * 60 }) {
  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = { aud: audience, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds };
  if (subject) claims.sub = subject;
  const input = `${header}.${b64(JSON.stringify(claims))}`;
  const signature = crypto.sign('sha256', Buffer.from(input), { key: privateKeyObject(publicKey, privateKey), dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64(signature)}`;
}

const hkdf = (salt, ikm, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));

function encrypt(payload, { p256dh, auth }) {
  const receiver = unb64(p256dh);
  const secret = unb64(auth);
  if (receiver.length !== 65 || receiver[0] !== 4 || secret.length !== 16) throw new Error('Ungültige Schlüssel im Push-Abo');
  const local = crypto.createECDH('prime256v1');
  const sender = local.generateKeys();
  const shared = local.computeSecret(receiver);
  const salt = crypto.randomBytes(16);
  const ikm = hkdf(secret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), receiver, sender]), 32);
  const key = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  if (plain.length + 16 > RECORD_SIZE) throw new Error('Die Push-Nachricht ist zu lang');
  const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(sender.length, 20);
  return Buffer.concat([header, sender, body]);
}

module.exports = { generateKeys, validPublicKey, vapidToken, encrypt, isPushService };
