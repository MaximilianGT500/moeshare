'use strict';

const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const settings = require('./settingsService');
const { loadKey, randomToken } = require('../lib/secrets');
const { deviceLabel } = require('../lib/request');
const { HttpError } = require('../lib/errors');

const FLOW_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 20;
const FLOW = 'webauthn';

const PROVIDERS = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud-Schlüsselbund',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Passwortmanager',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome auf dem Mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
};

function relyingParty() {
  const base = new URL(settings.get('site.baseUrl'));
  return { rpID: base.hostname, origin: base.origin, rpName: settings.get('site.title') || 'MoeShare' };
}

const userHandle = (userId) =>
  new Uint8Array(crypto.createHmac('sha256', loadKey()).update(`passkey-user:${userId}`).digest().subarray(0, 16));

async function startFlow(challenge, purpose, userId = null) {
  const flowId = randomToken(18);
  await ephemeral.put(FLOW, flowId, { challenge, purpose, userId }, FLOW_TTL_MS);
  return flowId;
}

async function takeFlow(flowId, purpose) {
  const flow = await ephemeral.take(FLOW, flowId);
  if (!flow || flow.purpose !== purpose) {
    throw new HttpError(400, 'Die Anfrage ist abgelaufen. Bitte versuche es noch einmal.');
  }
  return flow;
}

const parseTransports = (value) => {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
};

const toRecord = (row) => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  backedUp: Boolean(row.backed_up),
  deviceType: row.device_type,
});

const listForUser = (userId) =>
  db.all('SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at DESC', [userId]).then((rows) => rows.map(toRecord));

async function registrationOptions(user) {
  const { rpID, rpName } = relyingParty();
  const existing = await db.all('SELECT id, transports FROM passkeys WHERE user_id = ?', [user.id]);
  if (existing.length >= MAX_PASSKEYS) throw new HttpError(400, `Mehr als ${MAX_PASSKEYS} Passkeys sind nicht möglich.`);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userDisplayName: user.username,
    userID: userHandle(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({ id: row.id, transports: parseTransports(row.transports) })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  return { flowId: await startFlow(options.challenge, 'register', user.id), options };
}

async function register(user, { flowId, response, name, userAgent }) {
  const flow = await takeFlow(flowId, 'register');
  if (flow.userId !== user.id) throw new HttpError(403, 'Die Anfrage gehört zu einem anderen Konto.');
  const { rpID, origin } = relyingParty();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: flow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (error) {
    throw new HttpError(400, `Der Passkey konnte nicht geprüft werden: ${error.message}`);
  }
  if (!verification.verified) throw new HttpError(400, 'Der Passkey konnte nicht bestätigt werden.');

  const info = verification.registrationInfo;
  const { credential } = info;
  const label = (typeof name === 'string' && name.trim().slice(0, 60)) || PROVIDERS[info.aaguid] || deviceLabel(userAgent);

  await db.run(
    `INSERT INTO passkeys (id, user_id, name, public_key, counter, transports, device_type, backed_up, aaguid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      credential.id,
      user.id,
      label,
      Buffer.from(credential.publicKey),
      credential.counter || 0,
      JSON.stringify(credential.transports || response.response?.transports || []),
      info.credentialDeviceType,
      info.credentialBackedUp ? 1 : 0,
      info.aaguid,
      Date.now(),
    ]
  );
  return toRecord(await db.get('SELECT * FROM passkeys WHERE id = ?', [credential.id]));
}

async function authenticationOptions(purpose, userId = null) {
  const { rpID } = relyingParty();
  let allowCredentials;
  if (userId) {
    const rows = await db.all('SELECT id, transports FROM passkeys WHERE user_id = ?', [userId]);
    if (!rows.length) throw new HttpError(400, 'Für dieses Konto ist kein Passkey eingerichtet.');
    allowCredentials = rows.map((row) => ({ id: row.id, transports: parseTransports(row.transports) }));
  }
  const options = await generateAuthenticationOptions({ rpID, allowCredentials, userVerification: 'required' });
  return { flowId: await startFlow(options.challenge, purpose, userId), options };
}

async function authenticate({ flowId, response, purpose }) {
  const flow = await takeFlow(flowId, purpose);
  const credentialId = response && typeof response.id === 'string' ? response.id : '';
  const row = credentialId ? await db.get('SELECT * FROM passkeys WHERE id = ?', [credentialId]) : null;
  if (!row) throw new HttpError(401, 'Dieser Passkey ist hier nicht (mehr) registriert.');
  if (flow.userId && flow.userId !== row.user_id) throw new HttpError(401, 'Dieser Passkey gehört zu einem anderen Konto.');

  const { rpID, origin } = relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: flow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(row.public_key),
        counter: row.counter,
        transports: parseTransports(row.transports),
      },
      requireUserVerification: true,
    });
  } catch (error) {
    throw new HttpError(401, `Der Passkey konnte nicht geprüft werden: ${error.message}`);
  }
  if (!verification.verified) throw new HttpError(401, 'Der Passkey konnte nicht bestätigt werden.');

  await db.run('UPDATE passkeys SET counter = ?, backed_up = ?, last_used_at = ? WHERE id = ?', [
    verification.authenticationInfo.newCounter,
    verification.authenticationInfo.credentialBackedUp ? 1 : 0,
    Date.now(),
    row.id,
  ]);
  return { userId: row.user_id, passkeyId: row.id, name: row.name };
}

async function rename(userId, id, name) {
  const label = typeof name === 'string' ? name.trim() : '';
  if (!label || label.length > 60) throw new HttpError(400, 'Der Name muss 1 bis 60 Zeichen lang sein.');
  const result = await db.run('UPDATE passkeys SET name = ? WHERE user_id = ? AND id = ?', [label, userId, id]);
  if (!result.changes) throw new HttpError(404, 'Diesen Passkey gibt es nicht (mehr).');
}

async function remove(userId, id) {
  const result = await db.run('DELETE FROM passkeys WHERE user_id = ? AND id = ?', [userId, id]);
  if (!result.changes) throw new HttpError(404, 'Diesen Passkey gibt es nicht (mehr).');
}

const removeAll = (userId) => db.run('DELETE FROM passkeys WHERE user_id = ?', [userId]).then((r) => r.changes);

module.exports = {
  listForUser,
  registrationOptions,
  register,
  authenticationOptions,
  authenticate,
  rename,
  remove,
  removeAll,
};
