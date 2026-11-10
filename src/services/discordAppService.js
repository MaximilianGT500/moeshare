'use strict';

const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const logger = require('../lib/logger');
const ephemeral = require('../lib/ephemeral');
const brand = require('../lib/brand');
const { translate } = require('../lib/i18n');
const { HttpError, badRequest, badGateway, tooLarge } = require('../lib/errors');
const settings = require('./settingsService');
const identities = require('./identityService');
const quota = require('./quotaService');
const uploads = require('./uploadService');
const links = require('./linkService');
const { languageOf } = require('./preferenceService');

const log = logger.scope('server');

const KIND = 'discord-app';
const DAY = 24 * 60 * 60 * 1000;
const PING = 1;
const COMMAND = 2;
const PONG = 1;
const MESSAGE = 4;
const DEFERRED = 5;
const EPHEMERAL = 64;
const SLASH = 1;
const MESSAGE_COMMAND = 3;
const STRING = 3;
const BOOLEAN = 5;
const ATTACHMENT = 11;
const MAX_FILES = 10;
const MAX_SKEW_S = 10 * 60;
const CONTENT_MAX = 2000;
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

const http = axios.create({ timeout: 15000 });

const site = () => settings.get('site.title') || 'MoeShare';
const base = () => settings.get('site.baseUrl');
const ready = () => Boolean(settings.get('auth.discord.app') && settings.get('auth.discord.publicKey'));
const endpoint = () => `${base()}/api/discord/interactions`;

function verify(raw, signature, timestamp) {
  const key = settings.get('auth.discord.publicKey');
  if (!key || !/^[0-9a-f]{128}$/i.test(signature || '') || !/^\d{1,12}$/.test(timestamp || '')) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_SKEW_S) return false;
  try {
    const publicKey = crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(key, 'hex')]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.concat([Buffer.from(timestamp), raw]), publicKey, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

function saveName(language) {
  const full = language === 'de' ? `In ${site()} speichern` : `Save to ${site()}`;
  if (full.length <= 32) return full;
  return language === 'de' ? 'Datei speichern' : 'Save file';
}

function commands() {
  const describe = (text, values) => ({
    description: translate('en', text, values).slice(0, 100),
    description_localizations: { de: translate('de', text, values).slice(0, 100) },
  });
  const everywhere = { integration_types: [0, 1], contexts: [0, 1, 2] };
  const visible = { type: BOOLEAN, name: 'public', name_localizations: { de: 'öffentlich' }, ...describe('Zeigt den Link allen im Kanal') };
  const list = [
    {
      type: SLASH,
      name: 'upload',
      name_localizations: { de: 'hochladen' },
      ...describe('Speichert eine Datei in {site}', { site: site() }),
      ...everywhere,
      options: [
        {
          type: ATTACHMENT,
          name: 'file',
          name_localizations: { de: 'datei' },
          ...describe('Die Datei, die du speichern willst'),
          required: true,
        },
        visible,
      ],
    },
    { type: MESSAGE_COMMAND, name: saveName('en'), name_localizations: { de: saveName('de') }, description: '', ...everywhere },
  ];
  if (settings.get('links.enabled')) {
    list.push({
      type: SLASH,
      name: 'shorten',
      name_localizations: { de: 'kürzen' },
      ...describe('Kürzt einen Link mit {site}', { site: site() }),
      ...everywhere,
      options: [
        {
          type: STRING,
          name: 'url',
          name_localizations: { de: 'adresse' },
          ...describe('Die lange Adresse'),
          required: true,
          max_length: 2000,
        },
        visible,
      ],
    });
  }
  return list;
}

function apiError(error) {
  const status = error.response ? error.response.status : 0;
  const detail =
    error.response && error.response.data && typeof error.response.data.message === 'string' ? error.response.data.message : '';
  if (status === 401 || status === 403) return 'Discord hat Client-ID oder Client-Secret abgelehnt.';
  if (status >= 400)
    return detail ? `Discord hat die Befehle abgelehnt: ${detail.slice(0, 200)}` : `Discord hat mit HTTP ${status} geantwortet.`;
  return 'Discord ist gerade nicht erreichbar.';
}

async function state() {
  const saved = (await ephemeral.get(KIND, 'state')) || {};
  return {
    enabled: Boolean(settings.get('auth.discord.app')),
    ready: ready(),
    credentials: Boolean(settings.get('auth.discord.clientId') && settings.get('auth.discord.clientSecret')),
    login: Boolean(settings.get('auth.discord.enabled')),
    endpoint: endpoint(),
    registeredAt: saved.registeredAt || null,
    commands: saved.commands || [],
    error: saved.error || null,
  };
}

async function register() {
  const clientId = settings.get('auth.discord.clientId');
  const secret = settings.get('auth.discord.clientSecret');
  if (!clientId || !secret) throw badRequest('Trag zuerst Client-ID und Client-Secret von Discord ein und speichere sie.');
  const list = commands();
  const previous = (await ephemeral.get(KIND, 'state')) || {};
  try {
    const { data: grant } = await http.post(
      `${config.discord.api}/oauth2/token`,
      new URLSearchParams({ grant_type: 'client_credentials', scope: 'applications.commands.update' }).toString(),
      {
        auth: { username: clientId, password: secret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': brand.userAgent() },
      }
    );
    const { data } = await http.put(`${config.discord.api}/v10/applications/${clientId}/commands`, list, {
      headers: { Authorization: `Bearer ${grant.access_token}`, 'User-Agent': brand.userAgent() },
    });
    const saved = { registeredAt: Date.now(), commands: (Array.isArray(data) ? data : list).map((command) => command.name), error: null };
    await ephemeral.put(KIND, 'state', saved, 3650 * DAY);
    log.info('Befehle für die Discord-App eingetragen', { commands: saved.commands.length });
    return state();
  } catch (error) {
    const message = apiError(error);
    await ephemeral.put(KIND, 'state', { ...previous, error: message }, 3650 * DAY);
    log.warn('Befehle für die Discord-App konnten nicht eingetragen werden', { error: message });
    throw badGateway(message);
  }
}

function languageFor(account, interaction) {
  const own = account ? languageOf(account.preferences) : null;
  if (own) return own;
  return String(interaction.locale || interaction.guild_locale || '').startsWith('de') ? 'de' : 'en';
}

const clip = (text) => (text.length > CONTENT_MAX ? `${text.slice(0, CONTENT_MAX - 1)}…` : text);

const message = (content, hidden = true) => ({
  type: MESSAGE,
  data: { content: clip(content), flags: hidden ? EPHEMERAL : 0, allowed_mentions: { parse: [] } },
});

const reason = (error, t) => (error instanceof HttpError ? t(error.message) : t('Das hat nicht geklappt. Versuch es gleich noch einmal.'));

async function saveAll(account, attachments, t) {
  const lines = [];
  let saved = 0;
  for (const attachment of attachments.slice(0, MAX_FILES)) {
    const name = String(attachment.filename || 'datei')
      .replace(/[\\/]/g, '_')
      .slice(0, 200);
    try {
      const limits = await quota.limitsFor(account);
      if (limits.remaining === 0 || (limits.limit && Number(attachment.size) > limits.limit)) throw tooLarge(limits.message);
      const result = await uploads.fetchRemote(account, attachment.url, limits, {}, { via: 'discord', originalName: name });
      saved += 1;
      lines.push(`${name}: ${result.view}`);
    } catch (error) {
      if (!(error instanceof HttpError)) log.warn('Datei aus Discord konnte nicht gespeichert werden', { user: account.username, error });
      lines.push(`${name}: ${reason(error, t)}`);
    }
  }
  if (attachments.length > MAX_FILES)
    lines.push(t('Mehr als {count} Dateien auf einmal gehen nicht, der Rest wurde übersprungen.', { count: MAX_FILES }));
  const head = saved ? t('In {site} gespeichert:', { site: site() }) : t('Nichts gespeichert:');
  return [head, ...lines].join('\n');
}

async function shorten(account, url, t) {
  const result = await links.create(account, url, {});
  return t('Gekürzt: {url}', { url: result.short });
}

function later(interaction, work, t) {
  setImmediate(async () => {
    let content;
    try {
      content = await work();
    } catch (error) {
      content = reason(error, t);
    }
    try {
      await http.patch(
        `${config.discord.api}/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
        { content: clip(content), allowed_mentions: { parse: [] } },
        { headers: { 'User-Agent': brand.userAgent() } }
      );
    } catch (error) {
      log.warn('Antwort an Discord fehlgeschlagen', { error: apiError(error) });
    }
  });
}

async function handle(interaction) {
  if (!interaction || typeof interaction !== 'object') throw badRequest('Ungültige Anfrage.');
  if (interaction.type === PING) return { type: PONG };
  const person = (interaction.member && interaction.member.user) || interaction.user || null;
  const account = person && person.id ? await identities.findUser('discord', String(person.id)) : null;
  const language = languageFor(account, interaction);
  const t = (text, values) => translate(language, text, values);
  if (interaction.type !== COMMAND) return message(t('Das kann ich noch nicht.'));
  if (!account) {
    return message(
      t(
        'Dein Discord-Konto ist mit keinem Konto bei {site} verknüpft. Melde dich dort einmal mit Discord an oder verknüpfe Discord unter Konto › Sicherheit: {url}',
        {
          site: site(),
          url: `${base()}/account#sicherheit`,
        }
      )
    );
  }
  if (account.status !== 'active') return message(t('Dein Konto bei {site} ist gesperrt.', { site: site() }));
  const data = interaction.data || {};
  const options = Object.fromEntries((Array.isArray(data.options) ? data.options : []).map((option) => [option.name, option.value]));
  const resolved = data.resolved || {};
  let work;
  let hidden = options.public !== true;
  if (data.type === MESSAGE_COMMAND) {
    const target = resolved.messages ? resolved.messages[data.target_id] : null;
    const attachments = target && Array.isArray(target.attachments) ? target.attachments : [];
    if (!attachments.length) return message(t('An dieser Nachricht hängt keine Datei.'));
    hidden = true;
    work = () => saveAll(account, attachments, t);
  } else if (data.name === 'upload') {
    const attachment = resolved.attachments ? resolved.attachments[options.file] : null;
    if (!attachment) return message(t('Hänge eine Datei an.'));
    work = () => saveAll(account, [attachment], t);
  } else if (data.name === 'shorten') {
    if (!settings.get('links.enabled')) return message(t('Der Link-Kürzer ist auf diesem Server abgeschaltet.'));
    work = () => shorten(account, options.url, t);
  } else {
    return message(t('Diesen Befehl kenne ich nicht. Ein Admin kann die Befehle unter Admin › Einstellungen neu eintragen.'));
  }
  later(interaction, work, t);
  return { type: DEFERRED, data: { flags: hidden ? EPHEMERAL : 0 } };
}

module.exports = { ready, verify, handle, state, register, commands };
