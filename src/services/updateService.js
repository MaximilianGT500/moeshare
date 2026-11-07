'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../lib/logger');
const ephemeral = require('../lib/ephemeral');
const { translate } = require('../lib/i18n');
const settings = require('./settingsService');
const webhook = require('./webhookService');
const mail = require('./mailService');

const log = logger.scope('server');

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const DUE_AFTER = DAY - 10 * MINUTE;
const TICK_MS = 15 * MINUTE;
const FIRST_TICK_MS = 20 * 1000;
const CHANGELOG = 'https://moeshare.moestudio.net/changelog.html';
const VERSION = /^\d+\.\d+\.\d+$/;
const LANGUAGES = ['de', 'en'];
const KIND = 'update';
const LOCK = 'update-check';

const blank = () => ({
  latest: null,
  date: null,
  changelog: null,
  notes: { de: [], en: [] },
  security: false,
  checkedAt: null,
  error: null,
  notified: null,
});

let state = blank();
let loadedAt = 0;
let timer = null;
let running = null;

function newer(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  return false;
}

const disabledBy = () => (!config.updateCheck.url ? 'env' : settings.get('system.updateCheck') ? null : 'setting');

const invalid = () => Object.assign(new Error('Die Versionsangaben haben ein ungültiges Format.'), { code: 'invalid' });

function lines(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.replace(/\s+/g, ' ').trim().slice(0, 200))
    .slice(0, 8);
}

function parse(raw) {
  let body;
  try {
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw invalid();
  }
  if (!body || typeof body !== 'object' || typeof body.version !== 'string' || !VERSION.test(body.version.trim())) throw invalid();
  const version = body.version.trim();
  const notes = body.notes && typeof body.notes === 'object' && !Array.isArray(body.notes) ? body.notes : {};
  return {
    latest: version,
    date: typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null,
    changelog:
      typeof body.changelog === 'string' && /^https:\/\/\S+$/i.test(body.changelog)
        ? body.changelog.slice(0, 300)
        : `${CHANGELOG}#v${version}`,
    notes: Object.fromEntries(LANGUAGES.map((language) => [language, lines(notes[language])])),
    security: body.security === true,
  };
}

function reasonOf(error) {
  if (error && error.code === 'invalid') return 'invalid';
  if (error && error.response) return `status:${error.response.status}`;
  if (error && ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) return 'timeout';
  return 'unreachable';
}

async function fetchLatest() {
  const response = await axios.get(config.updateCheck.url, {
    timeout: 8000,
    maxRedirects: 3,
    maxContentLength: 64 * 1024,
    responseType: 'text',
    transformResponse: [(data) => data],
    headers: { 'User-Agent': 'MoeShare', Accept: 'application/json' },
  });
  return parse(response.data);
}

async function load(force = false) {
  if (!force && Date.now() - loadedAt < MINUTE) return state;
  const stored = await ephemeral.get(KIND, 'state').catch(() => null);
  loadedAt = Date.now();
  if (stored && typeof stored === 'object') {
    state = {
      ...blank(),
      ...stored,
      notes: { ...blank().notes, ...(stored.notes && typeof stored.notes === 'object' ? stored.notes : {}) },
    };
  }
  return state;
}

const save = () =>
  ephemeral.put(KIND, 'state', state, 60 * DAY).catch((error) => log.debug('Ergebnis der Versionsprüfung nicht gespeichert', { error }));

const notesFor = (language) =>
  state.notes[language] && state.notes[language].length ? state.notes[language] : state.notes[language === 'de' ? 'en' : 'de'] || [];

const unannounced = () =>
  Boolean(state.latest && newer(state.latest, config.version) && (!state.notified || newer(state.latest, state.notified)));

async function announce() {
  const { latest } = state;
  if (!unannounced()) return;
  state.notified = latest;
  log.info(`MoeShare ${latest} ist verfügbar`, { installed: config.version, changelog: state.changelog });
  webhook.notify(
    'system',
    state.security ? 'Sicherheitsupdate für MoeShare' : 'Neue Version von MoeShare',
    [`Neue Version: **${latest}**`, `Installiert: **${config.version}**`, `Neuerungen: ${state.changelog}`].join('\n'),
    state.security ? 'error' : 'success'
  );
  await mail
    .notifyAdmins('system', (language) => {
      const t = (text, values) => translate(language, text, values);
      const heading = state.security
        ? t('Sicherheitsupdate: MoeShare {version}', { version: latest })
        : t('MoeShare {version} ist erschienen', { version: latest });
      const notes = notesFor(language);
      return {
        subject: heading,
        title: heading,
        paragraphs: [
          t('Auf {site} läuft MoeShare {installed}, neu erschienen ist {version}.', {
            site: settings.get('site.title'),
            installed: config.version,
            version: latest,
          }),
          ...(state.security ? [t('Das Update schließt Sicherheitslücken. Spiel es bald ein.')] : []),
          ...(notes.length ? [`${t('Neu:')}\n${notes.map((note) => `• ${note}`).join('\n')}`] : []),
          t('Wie du aktualisierst, steht unter Admin › System.'),
        ],
        button: { label: t('Neuerungen ansehen'), url: state.changelog || CHANGELOG },
        footer: t('Diese Nachricht kommt, weil du Systemmeldungen per E-Mail bekommst. Abschalten kannst du sie im Konto unter E-Mail.'),
      };
    })
    .catch(() => 0);
}

async function run({ notify = true } = {}) {
  try {
    state = { ...state, ...(await fetchLatest()), checkedAt: Date.now(), error: null };
  } catch (error) {
    state = { ...state, checkedAt: Date.now(), error: reasonOf(error) };
    log.debug('Die Versionsprüfung war nicht möglich', { error: state.error });
  }
  if (notify) await announce();
  await save();
  loadedAt = Date.now();
  return state;
}

async function tick({ force = false } = {}) {
  if (disabledBy()) return;
  const due = () => !state.checkedAt || Date.now() - state.checkedAt >= (force ? 2 * MINUTE : DUE_AFTER);
  await load(true);
  if (!due() && !unannounced()) return;
  const token = await ephemeral.acquire(LOCK, 2 * MINUTE).catch(() => null);
  if (!token) return;
  try {
    await load(true);
    if (due()) {
      await run();
    } else if (unannounced()) {
      await announce();
      await save();
    }
  } finally {
    await ephemeral.release(LOCK, token).catch(() => {});
  }
}

async function check({ notify = true } = {}) {
  if (disabledBy()) return info();
  await load(true);
  if (!running) {
    running = run({ notify }).finally(() => {
      running = null;
    });
  }
  await running;
  return info();
}

function start() {
  if (timer) return;
  const quietly = (options) => tick(options).catch((error) => log.debug('Die Versionsprüfung ist fehlgeschlagen', { error }));
  setTimeout(quietly, FIRST_TICK_MS).unref();
  timer = setInterval(quietly, TICK_MS);
  timer.unref();
  settings.onChange((keys) => {
    if (keys.includes('system.updateCheck') && settings.get('system.updateCheck')) quietly({ force: true });
  });
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

async function info() {
  await load().catch(() => state);
  const off = disabledBy();
  const latest = off ? null : state.latest;
  const available = latest && newer(latest, config.version) ? latest : null;
  return {
    enabled: !off,
    disabledBy: off,
    current: config.version,
    latest,
    date: off ? null : state.date,
    available,
    security: Boolean(available && state.security),
    notes: off ? blank().notes : state.notes,
    checkedAt: off ? null : state.checkedAt,
    error: off ? null : state.error,
    changelog: (!off && state.changelog) || CHANGELOG,
    source: config.updateCheck.url ? hostOf(config.updateCheck.url) : null,
    install: config.install,
  };
}

function describe(error) {
  if (!error) return '';
  if (error === 'invalid') return 'Die Versionsangaben haben ein ungültiges Format.';
  if (error === 'timeout') return 'Der Server mit den Versionsangaben hat nicht rechtzeitig geantwortet.';
  if (error.startsWith('status:')) return `Der Server mit den Versionsangaben antwortet mit Status ${error.slice(7)}.`;
  return 'Der Server mit den Versionsangaben ist nicht erreichbar.';
}

function notice() {
  if (disabledBy() || !state.latest || !newer(state.latest, config.version)) return null;
  return { version: state.latest, security: state.security, changelog: state.changelog || CHANGELOG };
}

module.exports = { start, check, info, notice, describe, newer, parse, CHANGELOG };
