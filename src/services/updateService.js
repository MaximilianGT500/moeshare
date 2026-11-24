'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../lib/logger');
const ephemeral = require('../lib/ephemeral');
const { translate } = require('../lib/i18n');
const settings = require('./settingsService');
const webhook = require('./webhookService');
const mail = require('./mailService');
const pulse = require('./pulseService');

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
  yanked: false,
  behind: 0,
  markdown: null,
  releases: [],
  source: null,
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

const viaPulse = () => !config.updateCheck.custom && !pulse.lockedBy();

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

const plain = (text) =>
  String(text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

function bulletsOf(markdown) {
  if (typeof markdown !== 'string') return [];
  return lines(
    markdown
      .split(/\r?\n/)
      .map((line) => /^\s*[-*+]\s+(.+)$/.exec(line))
      .filter(Boolean)
      .map((match) => plain(match[1]))
  );
}

const dayOf = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null);

function releaseOf(entry) {
  if (!entry || typeof entry.version !== 'string') return null;
  const version = entry.version.replace(/^v/, '');
  if (!VERSION.test(version)) return null;
  return {
    version,
    title: typeof entry.title === 'string' ? entry.title.slice(0, 160) : null,
    date: typeof entry.date === 'number' ? entry.date : null,
    dateText: typeof entry.dateText === 'string' ? entry.dateText.slice(0, 60) : null,
    url: typeof entry.url === 'string' && /^https:\/\/\S+$/i.test(entry.url) ? entry.url.slice(0, 300) : `${CHANGELOG}#v${version}`,
    security: entry.security === true,
    notes: typeof entry.notes === 'string' ? entry.notes.slice(0, 20000) : null,
  };
}

async function fromPulse() {
  const found = await pulse.checkUpdate({ force: true });
  const latest = found && releaseOf(found.latest);
  if (!latest) return null;
  const releases = (Array.isArray(found.releases) ? found.releases : []).map(releaseOf).filter(Boolean).slice(0, 10);
  const bullets = bulletsOf(latest.notes);
  return {
    latest: latest.version,
    date: dayOf(latest.date),
    changelog: latest.url,
    notes: { de: bullets, en: [] },
    security: found.security === true,
    yanked: found.yanked === true,
    behind: Number.isInteger(found.behind) ? found.behind : releases.length,
    markdown: latest.notes,
    releases: releases.length ? releases : [latest],
    source: 'moepulse',
  };
}

async function fetchLatest() {
  if (viaPulse()) {
    const found = await fromPulse().catch((error) => {
      log.debug('MoePulse hat keine Versionsangaben geliefert', { error });
      return null;
    });
    if (found) return found;
  }
  return { ...(await fetchWebsite()), yanked: false, behind: 0, markdown: null, releases: [], source: 'website' };
}

async function fetchWebsite() {
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

async function check({ notify = true, language = 'de' } = {}) {
  if (disabledBy()) return info(language);
  await load(true);
  if (!running) {
    running = run({ notify }).finally(() => {
      running = null;
    });
  }
  await running;
  return info(language);
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

const markdownOf = (items) => (items.length ? items.map((item) => `- ${item}`).join('\n') : null);

function details(language) {
  if (!state.latest) return null;
  const update = newer(state.latest, config.version);
  const fallback = {
    version: state.latest,
    title: null,
    date: state.date ? Date.parse(`${state.date}T12:00:00Z`) : null,
    dateText: null,
    url: state.changelog || CHANGELOG,
    security: state.security,
    notes: state.markdown || markdownOf(notesFor(language)),
  };
  const releases = (state.releases.length ? state.releases : [fallback]).map((entry) => ({ ...entry, channel: 'stable' }));
  const latest = releases.find((entry) => entry.version === state.latest) || { ...fallback, channel: 'stable' };
  return {
    app: pulse.APP,
    version: config.version,
    channel: 'stable',
    latest,
    update,
    security: update && state.security,
    yanked: state.yanked,
    behind: update ? Math.max(1, state.behind || releases.length) : 0,
    releases: update ? releases.filter((entry) => newer(entry.version, config.version)) : [],
    checkedAt: state.checkedAt || 0,
  };
}

const sourceOf = () => (viaPulse() ? 'MoeStudio' : config.updateCheck.url ? hostOf(config.updateCheck.url) : null);

async function info(language = 'de') {
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
    yanked: !off && state.yanked === true,
    behind: off || !available ? 0 : Math.max(1, state.behind || 1),
    via: off ? null : state.source,
    details: off ? null : details(language),
    source: sourceOf(),
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
  if (disabledBy() || !state.latest) return null;
  const available = newer(state.latest, config.version);
  if (!available && !state.yanked) return null;
  return {
    version: state.latest,
    current: config.version,
    security: available && state.security,
    yanked: state.yanked === true,
    changelog: state.changelog || CHANGELOG,
  };
}

const disabled = () => Boolean(disabledBy());

module.exports = { start, check, info, notice, describe, newer, parse, disabled, CHANGELOG };
