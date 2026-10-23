'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const ARGON2 = /^\$(argon2id|argon2i|argon2d)\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const argon2Supported = typeof crypto.argon2 === 'function';

const isBcrypt = (hash) => typeof hash === 'string' && BCRYPT.test(hash);
const isArgon2 = (hash) => typeof hash === 'string' && ARGON2.test(hash);
const isSupported = (hash) => isBcrypt(hash) || (isArgon2(hash) && argon2Supported);
const normalize = (hash) => (typeof hash === 'string' ? hash.replace(/^\$2y\$/, '$2b$') : hash);

function argon2(algorithm, parameters) {
  return new Promise((resolve, reject) => crypto.argon2(algorithm, parameters, (error, key) => (error ? reject(error) : resolve(key))));
}

async function verifyArgon2(hash, password) {
  const match = ARGON2.exec(hash);
  if (!match || !argon2Supported) return false;
  const [, algorithm, version, memory, passes, parallelism, salt, digest] = match;
  if (Number(version) !== 19 || Number(memory) > 1024 * 1024 || Number(passes) > 16 || Number(parallelism) > 64) return false;
  const expected = Buffer.from(digest, 'base64');
  const actual = await argon2(algorithm, {
    message: Buffer.from(password, 'utf8'),
    nonce: Buffer.from(salt, 'base64'),
    parallelism: Number(parallelism),
    tagLength: expected.length,
    memory: Number(memory),
    passes: Number(passes),
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function verify(hash, password) {
  if (typeof hash !== 'string' || !hash || typeof password !== 'string' || !password) return false;
  try {
    if (isArgon2(hash)) return await verifyArgon2(hash, password);
    if (!isBcrypt(hash)) return false;
    return await bcrypt.compare(password, normalize(hash));
  } catch {
    return false;
  }
}

module.exports = { verify, isBcrypt, isSupported, normalize, argon2Supported };
