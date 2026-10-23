'use strict';

const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const i18n = require('../lib/i18n');
const secrets = require('../lib/secrets');
const { badRequest, notFound } = require('../lib/errors');
const settings = require('./settingsService');

const log = logger.scope('webhook');

const KINDS = ['discord', 'slack', 'matrix', 'telegram', 'ntfy', 'json'];
const MAX_TARGETS = 20;
const TIMEOUT_MS = 8000;
const CACHE_MS = 15000;

const DISCORD_URL = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const SLACK_URL = /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[\w/-]+$/;

const FIELDS = {
  discord: { secret: ['url'], plain: ['username', 'successColor', 'errorColor'] },
  slack: { secret: ['url'], plain: [] },
  matrix: { secret: ['token'], plain: ['homeserver', 'room'] },
  telegram: { secret: ['token'], plain: ['chatId', 'apiBase'] },
  ntfy: { secret: ['token'], plain: ['server', 'topic', 'priority'] },
  json: { secret: ['url', 'secret'], plain: [] },
};

let cached = null;
let cachedAt = 0;

const colorValue = (hex) => Number.parseInt(String(hex || '').replace(/^#/, ''), 16) || 0;

const localize = (text) => {
  const language = settings.get('site.language');
  return String(text)
    .split('\n')
    .map((line) => i18n.translate(language, line))
    .join('\n');
};

const plain = (text) => text.replace(/\*\*(.+?)\*\*/g, '$1');
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const html = (text) =>
  escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
const slackText = (text) =>
  String(text)
    .replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])
    .replace(/\*\*(.+?)\*\*/g, '*$1*');

function parseJson(raw, fallback) {
  try {
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function unseal(value) {
  if (typeof value !== 'string' || !value) return '';
  if (!value.startsWith('v1:')) return value;
  try {
    return secrets.decrypt(value);
  } catch (error) {
    log.warn('Ein gespeichertes Webhook-Geheimnis lässt sich nicht entschlüsseln', { error });
    return '';
  }
}

function load(row) {
  const kind = KINDS.includes(row.kind) ? row.kind : 'json';
  const stored = parseJson(row.config, {});
  const fields = FIELDS[kind];
  const values = {};
  for (const key of fields.plain) values[key] = typeof stored[key] === 'string' ? stored[key] : '';
  for (const key of fields.secret) values[key] = unseal(stored[key]);
  return {
    id: Number(row.id),
    name: row.name,
    kind,
    config: values,
    events: parseJson(row.events, []).filter((event) => settings.WEBHOOK_EVENTS.includes(event)),
    enabled: Boolean(Number(row.enabled)),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    lastAt: row.last_at ? Number(row.last_at) : null,
    lastStatus: row.last_status === null || row.last_status === undefined ? null : Number(row.last_status),
    lastError: row.last_error || null,
  };
}

function present(target) {
  const fields = FIELDS[target.kind];
  return {
    ...target,
    config: Object.fromEntries(fields.plain.map((key) => [key, target.config[key] || ''])),
    secrets: Object.fromEntries(fields.secret.map((key) => [key, Boolean(target.config[key])])),
  };
}

async function targets() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const rows = await db.all('SELECT * FROM webhooks ORDER BY id');
  cached = rows.map(load);
  cachedAt = Date.now();
  return cached;
}

const invalidate = () => {
  cached = null;
};

function message(event, title, description, kind) {
  return {
    event,
    kind: kind === 'error' ? 'error' : 'success',
    title: localize(title).slice(0, 250),
    text: localize(description).slice(0, 3500),
  };
}

function hostOf(value, field, label) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw badRequest(`${label}: bitte eine vollständige Adresse wie https://example.com eingeben.`, { field });
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Nur http- und https-Adressen sind erlaubt.', { field });
  return url;
}

const request = (options) =>
  axios({
    timeout: TIMEOUT_MS,
    maxRedirects: 3,
    ...options,
    headers: { 'User-Agent': `MoeShare/${config.version}`, ...(options.headers || {}) },
  });

const matrixRooms = new Map();

async function matrixRoom(target) {
  const room = target.config.room.trim();
  if (room.startsWith('!')) return room;
  const key = `${target.config.homeserver}|${room}`;
  if (matrixRooms.has(key)) return matrixRooms.get(key);
  const base = target.config.homeserver.replace(/\/+$/, '');
  const { data } = await request({
    method: 'get',
    url: `${base}/_matrix/client/v3/directory/room/${encodeURIComponent(room)}`,
    headers: { Authorization: `Bearer ${target.config.token}` },
  });
  if (!data || !data.room_id) throw new Error('Den Matrix-Raum gibt es nicht.');
  matrixRooms.set(key, data.room_id);
  return data.room_id;
}

const SENDERS = {
  async discord(target, note) {
    const color =
      note.kind === 'error'
        ? target.config.errorColor || settings.get('webhook.errorColor')
        : target.config.successColor || settings.get('webhook.successColor');
    await request({
      method: 'post',
      url: target.config.url,
      data: {
        username: target.config.username || settings.get('webhook.name') || settings.get('site.title'),
        embeds: [
          { title: note.title, description: note.text.slice(0, 2000), color: colorValue(color), timestamp: new Date().toISOString() },
        ],
      },
    });
  },
  async slack(target, note) {
    await request({ method: 'post', url: target.config.url, data: { text: `*${slackText(note.title)}*\n${slackText(note.text)}` } });
  },
  async matrix(target, note) {
    const base = target.config.homeserver.replace(/\/+$/, '');
    const room = await matrixRoom(target);
    await request({
      method: 'put',
      url: `${base}/_matrix/client/v3/rooms/${encodeURIComponent(room)}/send/m.room.message/${crypto.randomUUID()}`,
      headers: { Authorization: `Bearer ${target.config.token}` },
      data: {
        msgtype: 'm.notice',
        body: `${note.title}\n${plain(note.text)}`,
        format: 'org.matrix.custom.html',
        formatted_body: `<strong>${escapeHtml(note.title)}</strong><br>${html(note.text)}`,
      },
    });
  },
  async telegram(target, note) {
    const base = (target.config.apiBase || 'https://api.telegram.org').replace(/\/+$/, '');
    await request({
      method: 'post',
      url: `${base}/bot${target.config.token}/sendMessage`,
      data: {
        chat_id: target.config.chatId,
        text: `<b>${escapeHtml(note.title)}</b>\n${html(note.text).replace(/<br>/g, '\n')}`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
    });
  },
  async ntfy(target, note) {
    const server = (target.config.server || 'https://ntfy.sh').replace(/\/+$/, '');
    const priority = Number(target.config.priority) || (note.kind === 'error' ? 4 : 3);
    await request({
      method: 'post',
      url: server,
      headers: target.config.token ? { Authorization: `Bearer ${target.config.token}` } : {},
      data: {
        topic: target.config.topic,
        title: note.title,
        message: note.text,
        markdown: true,
        priority,
        tags: [note.kind === 'error' ? 'warning' : 'white_check_mark'],
      },
    });
  },
  async json(target, note) {
    const body = JSON.stringify({
      event: note.event,
      kind: note.kind,
      title: note.title,
      text: plain(note.text),
      markdown: note.text,
      site: { title: settings.get('site.title'), url: settings.get('site.baseUrl') },
      at: new Date().toISOString(),
    });
    const headers = { 'Content-Type': 'application/json', 'X-MoeShare-Event': note.event };
    if (target.config.secret) {
      headers['X-MoeShare-Signature'] = `sha256=${crypto.createHmac('sha256', target.config.secret).update(body).digest('hex')}`;
    }
    await request({ method: 'post', url: target.config.url, data: body, headers });
  },
};

function describeError(error) {
  const status = error.response ? error.response.status : 0;
  if (status === 401 || status === 403)
    return { status, message: 'Der Dienst hat den Zugang abgelehnt (falsches Token oder fehlende Rechte).' };
  if (status === 404) return { status, message: 'Der Dienst kennt dieses Ziel nicht (gelöscht oder falsch kopiert).' };
  if (status === 429) return { status, message: 'Der Dienst bremst gerade. Versuche es gleich noch einmal.' };
  if (status) return { status, message: `Der Dienst antwortet mit HTTP ${status}.` };
  return { status: 0, message: `Der Dienst ist nicht erreichbar (${error.code || error.message}).` };
}

async function record(target, failure) {
  Object.assign(target, {
    lastAt: Date.now(),
    lastStatus: failure ? failure.status : 200,
    lastError: failure ? failure.message : null,
  });
  await db
    .run('UPDATE webhooks SET last_at = ?, last_status = ?, last_error = ? WHERE id = ?', [
      Date.now(),
      failure ? failure.status : 200,
      failure ? failure.message : null,
      target.id,
    ])
    .catch(() => {});
}

async function deliver(target, note) {
  try {
    await SENDERS[target.kind](target, note);
    if (target.id) await record(target, null);
    return null;
  } catch (error) {
    const failure = describeError(error);
    if (target.id) await record(target, failure);
    log.warn('Eine Benachrichtigung konnte nicht gesendet werden', {
      target: target.name,
      kind: target.kind,
      event: note.event,
      status: failure.status,
    });
    return failure;
  }
}

function notify(event, title, description, kind = 'success') {
  return targets()
    .then((list) => {
      const chosen = list.filter((target) => target.enabled && target.events.includes(event));
      if (!chosen.length) return null;
      const note = message(event, title, description, kind);
      return Promise.all(chosen.map((target) => deliver(target, note)));
    })
    .catch((error) => log.warn('Benachrichtigungen ließen sich nicht verschicken', { event, error }));
}

function validate(input, current = null) {
  const kind = current ? current.kind : input.kind;
  if (!KINDS.includes(kind)) throw badRequest('Unbekannter Dienst.', { field: 'kind' });
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim().slice(0, 80) : current ? current.name : '';
  const fields = FIELDS[kind];
  const raw = input.config && typeof input.config === 'object' ? input.config : {};
  const values = current ? { ...current.config } : {};
  for (const key of [...fields.plain, ...fields.secret]) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'string') throw badRequest('Ungültiger Wert.', { field: `config.${key}` });
    values[key] = raw[key].trim().slice(0, 500);
  }
  const need = (key, message) => {
    if (!values[key]) throw badRequest(message, { field: `config.${key}` });
  };
  if (kind === 'discord') {
    need('url', 'Trage die Webhook-Adresse aus Discord ein.');
    if (!DISCORD_URL.test(values.url))
      throw badRequest('Das ist keine Discord-Webhook-Adresse (https://discord.com/api/webhooks/…).', { field: 'config.url' });
    for (const key of ['successColor', 'errorColor']) {
      if (values[key] && !/^#[0-9a-f]{6}$/i.test(values[key]))
        throw badRequest('Bitte eine Farbe als Hex-Wert wie #8b5cf6 eingeben.', { field: `config.${key}` });
    }
  }
  if (kind === 'slack') {
    need('url', 'Trage die Webhook-Adresse aus Slack ein.');
    if (!SLACK_URL.test(values.url))
      throw badRequest('Das ist keine Slack-Webhook-Adresse (https://hooks.slack.com/…).', { field: 'config.url' });
  }
  if (kind === 'matrix') {
    need('homeserver', 'Trage die Adresse des Matrix-Servers ein.');
    hostOf(values.homeserver, 'config.homeserver', 'Matrix-Server');
    need('room', 'Trage den Raum ein, zum Beispiel !abc123:matrix.org oder #moeshare:matrix.org.');
    if (!/^[!#][^:\s]+:\S+$/.test(values.room))
      throw badRequest('Der Raum sieht aus wie !abc123:matrix.org oder #name:matrix.org.', { field: 'config.room' });
    need('token', 'Trage das Zugangstoken des Matrix-Kontos ein.');
  }
  if (kind === 'telegram') {
    need('token', 'Trage das Token deines Telegram-Bots ein.');
    if (!/^\d{5,15}:[\w-]{30,60}$/.test(values.token))
      throw badRequest('Das Bot-Token sieht aus wie 123456789:ABC-DEF…', { field: 'config.token' });
    need('chatId', 'Trage die Chat-ID ein.');
    if (!/^(-?\d{3,20}|@[A-Za-z0-9_]{5,32})$/.test(values.chatId))
      throw badRequest('Die Chat-ID ist eine Zahl oder ein @kanalname.', { field: 'config.chatId' });
    if (values.apiBase) hostOf(values.apiBase, 'config.apiBase', 'Bot-API');
  }
  if (kind === 'ntfy') {
    if (values.server) hostOf(values.server, 'config.server', 'ntfy-Server');
    need('topic', 'Trage das Thema (Topic) ein.');
    if (!/^[\w-]{1,64}$/.test(values.topic))
      throw badRequest('Das Thema besteht aus Buchstaben, Ziffern, _ und -.', { field: 'config.topic' });
    if (values.priority && !/^[1-5]$/.test(values.priority))
      throw badRequest('Die Priorität ist eine Zahl von 1 bis 5.', { field: 'config.priority' });
  }
  if (kind === 'json') {
    need('url', 'Trage die Adresse ein, an die MoeShare die Nachrichten schickt.');
    hostOf(values.url, 'config.url', 'Adresse');
  }
  let events = current ? current.events : settings.WEBHOOK_EVENTS.filter((event) => event !== 'processing');
  if (input.events !== undefined) {
    if (!Array.isArray(input.events) || input.events.some((event) => !settings.WEBHOOK_EVENTS.includes(event))) {
      throw badRequest('Unbekanntes Ereignis.', { field: 'events' });
    }
    events = [...new Set(input.events)];
  }
  const enabled = input.enabled === undefined ? (current ? current.enabled : true) : input.enabled === true;
  return { kind, name: name || kind, config: values, events, enabled };
}

function sealConfig(kind, values) {
  const stored = {};
  for (const key of FIELDS[kind].plain) if (values[key]) stored[key] = values[key];
  for (const key of FIELDS[kind].secret) if (values[key]) stored[key] = secrets.encrypt(values[key]);
  return JSON.stringify(stored);
}

async function list() {
  return (await targets()).map(present);
}

async function find(id) {
  const row = Number.isSafeInteger(Number(id)) ? await db.get('SELECT * FROM webhooks WHERE id = ?', [Number(id)]) : null;
  if (!row) throw notFound('Dieses Ziel gibt es nicht (mehr).');
  return load(row);
}

async function create(input = {}) {
  if ((await db.count('SELECT COUNT(*) FROM webhooks')) >= MAX_TARGETS) throw badRequest(`Höchstens ${MAX_TARGETS} Ziele.`);
  const next = validate(input);
  const now = Date.now();
  const id = await db.insertRow('webhooks', {
    name: next.name,
    kind: next.kind,
    config: sealConfig(next.kind, next.config),
    events: JSON.stringify(next.events),
    enabled: next.enabled ? 1 : 0,
    created_at: now,
    updated_at: now,
  });
  invalidate();
  return present(await find(id));
}

async function update(id, input = {}) {
  const current = await find(id);
  const next = validate(input, current);
  await db.run('UPDATE webhooks SET name = ?, config = ?, events = ?, enabled = ?, updated_at = ? WHERE id = ?', [
    next.name,
    sealConfig(next.kind, next.config),
    JSON.stringify(next.events),
    next.enabled ? 1 : 0,
    Date.now(),
    current.id,
  ]);
  invalidate();
  return present(await find(current.id));
}

async function remove(id) {
  const current = await find(id);
  await db.run('DELETE FROM webhooks WHERE id = ?', [current.id]);
  invalidate();
}

async function test(id, input = null) {
  const target = input ? { ...validate(input, id ? await find(id) : null), id: id ? Number(id) : null } : await find(id);
  const note = message('test', 'Testnachricht', `Die Benachrichtigungen von **${settings.get('site.title')}** kommen hier an.`, 'success');
  const failure = await deliver(target, note);
  if (target.id) invalidate();
  return failure;
}

async function testDiscordUrl(url) {
  if (!url) return 'Es ist keine Webhook-Adresse eingetragen.';
  const failure = await deliver(
    { id: null, name: 'Discord', kind: 'discord', config: { url } },
    message('test', 'Testnachricht', `Die Benachrichtigungen von **${settings.get('site.title')}** kommen hier an.`, 'success')
  );
  return failure ? failure.message : null;
}

async function adoptLegacy() {
  if (!settings.get('webhook.url') || (await settings.readMeta('webhooksAdopted'))) return false;
  const lock = await ephemeral.acquire('webhook-adopt', 60000);
  if (!lock) return false;
  try {
    return await adopt();
  } finally {
    await ephemeral.release('webhook-adopt', lock);
  }
}

async function adopt() {
  const url = settings.get('webhook.url');
  if (!url || (await settings.readMeta('webhooksAdopted'))) return false;
  await create({
    kind: 'discord',
    name: 'Discord',
    config: {
      url,
      username: settings.get('webhook.name'),
      successColor: settings.get('webhook.successColor'),
      errorColor: settings.get('webhook.errorColor'),
    },
    events: settings.get('webhook.events'),
    enabled: settings.get('webhook.enabled'),
  });
  await settings.writeMeta('webhooksAdopted', new Date().toISOString());
  await settings.update({ 'webhook.enabled': false, 'webhook.url': '' });
  log.info('Der Discord-Webhook ist jetzt eines der Benachrichtigungsziele');
  return true;
}

const configured = async () => (await targets()).some((target) => target.enabled);

module.exports = { KINDS, notify, list, create, update, remove, test, testDiscordUrl, adoptLegacy, configured };
