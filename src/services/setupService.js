'use strict';

const fs = require('fs');
const os = require('os');
const config = require('../config');
const logger = require('../lib/logger');
const media = require('../lib/media');
const ephemeral = require('../lib/ephemeral');
const { badRequest, forbidden, gone } = require('../lib/errors');
const { randomToken, safeEqual } = require('../lib/secrets');
const settings = require('./settingsService');
const users = require('./userService');

const KIND = 'setup';
const ID = 'token';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const WIZARD_SETTINGS = [
  'site.title',
  'site.baseUrl',
  'site.uiColor',
  'site.favicon',
  'site.redirectUrl',
  'home.enabled',
  'uploads.maxFileBytes',
  'uploads.defaultQuotaBytes',
  'uploads.preview',
  'uploads.removeMetadata',
  'uploads.dominantColor',
  'uploads.hls',
  'uploads.urlFetch',
  'auth.registration',
  'auth.enforceMfa',
  'auth.passkeys',
  'webhook.enabled',
  'webhook.url',
  'webhook.events',
];

const isOpen = async () => (await users.count()) === 0;

function networkAddresses() {
  if (fs.existsSync('/.dockerenv')) return [];
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

function printLink(token) {
  const path = `/setup?token=${token}`;
  const urls = [
    `${settings.get('site.baseUrl')}${path}`,
    ...networkAddresses().map((address) => `http://${address}:${config.port}${path}`),
  ];
  logger.box(
    'MoeShare ist noch nicht eingerichtet. Öffne den Installationsassistenten:',
    [...urls.map((url) => `  ${url}`), '', 'Läuft MoeShare unter einer anderen Adresse, hänge den Teil ab /setup an diese an.'],
    { url: urls[0], alternatives: urls.slice(1) }
  );
}

async function prepare({ onlyIfMissing = false } = {}) {
  if (!(await isOpen())) {
    await ephemeral.remove(KIND, ID);
    return null;
  }
  const existing = await ephemeral.get(KIND, ID);
  if (existing && onlyIfMissing) return existing.token;
  const entry = existing || (await ephemeral.putIfAbsent(KIND, ID, { token: randomToken(18) }, TTL_MS));
  printLink(entry.token);
  return entry.token;
}

async function verify(token) {
  if (typeof token !== 'string' || !token) return false;
  const entry = await ephemeral.get(KIND, ID);
  return Boolean(entry && safeEqual(token, entry.token));
}

async function assertAccess(token) {
  if (!(await isOpen())) throw gone('MoeShare ist bereits eingerichtet.', { code: 'done' });
  if (!(await verify(token)))
    throw forbidden('Der Einrichtungslink stimmt nicht. Du findest ihn in der Konsole des Servers.', { code: 'token' });
}

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function checks() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const storage = writable(config.paths.uploads);
  return [
    { key: 'database', ok: true, label: 'Datenbank', detail: 'SQLite ist bereit.' },
    {
      key: 'storage',
      ok: storage,
      label: 'Speicherordner',
      detail: storage ? 'Uploads können gespeichert werden.' : `Kein Schreibzugriff auf ${config.paths.uploads}.`,
    },
    {
      key: 'ffmpeg',
      ok: media.ffmpegAvailable,
      optional: true,
      label: 'FFmpeg',
      detail: media.ffmpegAvailable ? 'Videovorschauen und Streaming sind möglich.' : 'Fehlt, Videos werden ohne Vorschau gespeichert.',
    },
    { key: 'node', ok: nodeMajor >= 20, label: 'Node.js', detail: `Version ${process.versions.node}` },
  ];
}

function wizardSettings() {
  const { values, secrets } = settings.forAdmin();
  return {
    values: Object.fromEntries(WIZARD_SETTINGS.map((key) => [key, values[key]])),
    secrets: Object.fromEntries(WIZARD_SETTINGS.filter((key) => key in secrets).map((key) => [key, secrets[key]])),
  };
}

function pickWizardSettings(patch) {
  const source = patch && typeof patch === 'object' ? patch : {};
  return Object.fromEntries(WIZARD_SETTINGS.filter((key) => key in source).map((key) => [key, source[key]]));
}

const credentials = (account) => ({
  username: account && typeof account.username === 'string' ? account.username : '',
  password: account && typeof account.password === 'string' ? account.password : '',
});

async function validate({ token, account, patch }) {
  await assertAccess(token);
  if (account) {
    const { username, password } = credentials(account);
    await users.validateNewAccount(username, password);
  }
  if (patch) settings.validatePatch(pickWizardSettings(patch));
}

async function complete({ token, account, patch }) {
  await assertAccess(token);
  const values = settings.validatePatch(pickWizardSettings(patch));
  const { username, password } = credentials(account);
  if (!password) throw badRequest('Lege ein Passwort für dein Admin-Konto fest.', { field: 'password' });
  await users.validateNewAccount(username, password);

  const claimed = await ephemeral.take(KIND, ID);
  if (!claimed) throw gone('Die Einrichtung läuft bereits oder ist abgeschlossen.', { code: 'done' });
  try {
    await settings.update(values);
    const user = await users.create({ username, password, role: 'admin' });
    logger.scope('setup').info('Einrichtung abgeschlossen', { admin: user.username });
    return user;
  } catch (error) {
    await ephemeral.put(KIND, ID, claimed, TTL_MS);
    throw error;
  }
}

module.exports = { isOpen, prepare, verify, checks, wizardSettings, validate, complete };
