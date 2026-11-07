'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../lib/logger');
const brand = require('../lib/brand');
const settings = require('./settingsService');

const log = logger.scope('server');

const DAY = 24 * 60 * 60 * 1000;
const CHANGELOG = 'https://moeshare.eu/changelog.html';

let state = { latest: null, checkedAt: null, error: null };
let announced = null;
let timer = null;

function newer(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  return false;
}

async function check() {
  if (!settings.get('system.updateCheck') || !config.repository) return state;
  try {
    const { data } = await axios.get(`https://raw.githubusercontent.com/${config.repository}/main/package.json`, {
      timeout: 5000,
      headers: { 'User-Agent': brand.userAgent() },
    });
    const latest = data && typeof data.version === 'string' && /^\d+\.\d+\.\d+$/.test(data.version) ? data.version : null;
    state = { latest, checkedAt: Date.now(), error: null };
    if (latest && newer(latest, config.version) && announced !== latest) {
      announced = latest;
      log.info(`MoeShare ${latest} ist verfügbar`, { installed: config.version, changelog: CHANGELOG });
    } else if (latest) {
      log.debug('MoeShare ist auf dem neuesten Stand', { version: config.version });
    }
  } catch (error) {
    state = { ...state, checkedAt: Date.now(), error: error.code || error.message };
    log.debug('Die Versionsprüfung war nicht möglich', { error });
  }
  return state;
}

function start() {
  if (timer) return;
  check();
  timer = setInterval(check, DAY);
  timer.unref();
  settings.onChange((keys) => {
    if (keys.includes('system.updateCheck') && settings.get('system.updateCheck')) check();
  });
}

function info() {
  const enabled = Boolean(settings.get('system.updateCheck'));
  const latest = enabled ? state.latest : null;
  return {
    enabled,
    current: config.version,
    latest,
    available: latest && newer(latest, config.version) ? latest : null,
    checkedAt: enabled ? state.checkedAt : null,
    changelog: CHANGELOG,
  };
}

module.exports = { start, check, info, newer };
