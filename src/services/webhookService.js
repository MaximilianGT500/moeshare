'use strict';

const axios = require('axios');
const logger = require('../lib/logger');
const i18n = require('../lib/i18n');
const settings = require('./settingsService');

const log = logger.scope('webhook');

const colorValue = (hex) => Number.parseInt(String(hex).replace(/^#/, ''), 16) || 0;

const localize = (text) => {
  const language = settings.get('site.language');
  return String(text)
    .split('\n')
    .map((line) => i18n.translate(language, line))
    .join('\n');
};

const payload = (title, description, kind) => ({
  username: settings.get('webhook.name'),
  embeds: [
    {
      title: localize(title).slice(0, 256),
      description: localize(description).slice(0, 2000),
      color: colorValue(settings.get(kind === 'error' ? 'webhook.errorColor' : 'webhook.successColor')),
      timestamp: new Date().toISOString(),
    },
  ],
});

function notify(event, title, description, kind = 'success') {
  const url = settings.get('webhook.url');
  if (!settings.get('webhook.enabled') || !url || !settings.get('webhook.events').includes(event)) return Promise.resolve();
  return axios
    .post(url, payload(title, description, kind), { timeout: 5000 })
    .catch((error) =>
      log.warn('Der Discord-Webhook konnte nicht gesendet werden', { event, status: error.response && error.response.status, error })
    );
}

async function test(url = settings.get('webhook.url')) {
  if (!url) return 'Es ist keine Webhook-Adresse eingetragen.';
  try {
    await axios.post(url, payload('Testnachricht', `Die Benachrichtigungen von **${settings.get('site.title')}** kommen hier an.`), {
      timeout: 8000,
    });
    return null;
  } catch (error) {
    const status = error.response ? error.response.status : 0;
    if (status === 401 || status === 404) return 'Discord kennt diesen Webhook nicht (gelöscht oder falsch kopiert).';
    if (status === 429) return 'Discord bremst gerade. Versuche es gleich noch einmal.';
    return `Discord ist nicht erreichbar (${status ? `HTTP ${status}` : error.code || error.message}).`;
  }
}

module.exports = { notify, test };
