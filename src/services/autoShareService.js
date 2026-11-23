'use strict';

const crypto = require('crypto');
const axios = require('axios');
const brand = require('../lib/brand');
const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const secrets = require('../lib/secrets');
const { client: safeHttp } = require('../lib/safeFetch');
const { badRequest, conflict, forbidden, notFound } = require('../lib/errors');
const { isSealedName } = require('../lib/sealed');
const files = require('./fileService');
const settings = require('./settingsService');

const log = logger.scope('autoshare');

const KINDS = ['discord', 'slack', 'telegram', 'ntfy', 'matrix', 'mastodon', 'webhook'];
const TYPES = ['image', 'video', 'audio', 'text', 'file'];
const VISIBILITIES = ['public', 'unlisted', 'private'];
const MAX_RULES = 10;
const MAX_FAILURES = 10;
const MAX_TEMPLATE = 1000;
const MAX_NAME = 80;
const TIMEOUT_MS = 10000;
const SKIPPED_VIA = new Set(['request', 'import', 'version', 'discord']);

const DISCORD = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{5,25})\/([\w-]{20,120})\/?(?:\?.*)?$/;
const SLACK = /^https:\/\/hooks\.slack\.com\/((?:services|workflows|triggers)\/[\w/-]{10,200})$/;
const TELEGRAM_TOKEN = /^\d{5,15}:[\w-]{20,80}$/;
const TELEGRAM_CHAT = /^(?:-?\d{1,20}|@[A-Za-z][\w]{4,31})$/;
const NTFY_TOPIC = /^[\w-]{1,64}$/;
const SECRET_TOKEN = /^[\w.~+/=:-]{8,500}$/;
const MATRIX_ROOM = /^[!#][^\s:]{1,200}:[^\s]{1,200}$/;
const SIGNING_SECRET = /^\S{8,200}$/;
const MAX_HOOK_URL = 500;

const enabled = () => Boolean(settings.get('autoShare.enabled'));

function assertEnabled() {
  if (!enabled()) throw forbidden('Automatisches Teilen ist auf diesem Server abgeschaltet.');
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function serverUrl(value, field, { fallback = null, https = false } = {}) {
  const raw = text(value) || fallback;
  if (!raw) throw badRequest('Bitte eine Adresse eingeben.', { field });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Bitte eine vollständige Adresse wie https://example.com eingeben.', { field });
  }
  if (!(https ? ['https:'] : ['http:', 'https:']).includes(url.protocol) || url.username || url.password) {
    throw badRequest(https ? 'Nur https-Adressen sind erlaubt.' : 'Nur http- und https-Adressen sind erlaubt.', { field });
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function hookUrl(value, previous) {
  const raw = text(value) || previous || '';
  if (!raw) throw badRequest('Bitte eine Adresse eingeben.', { field: 'url' });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Bitte eine vollständige Adresse wie https://example.com/hook eingeben.', { field: 'url' });
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw badRequest('Nur http- und https-Adressen ohne Zugangsdaten sind erlaubt.', { field: 'url' });
  }
  if (url.href.length > MAX_HOOK_URL) throw badRequest(`Die Adresse darf höchstens ${MAX_HOOK_URL} Zeichen lang sein.`, { field: 'url' });
  return url.href;
}

function token(value, field, { optional = false, pattern = SECRET_TOKEN } = {}) {
  const raw = text(value);
  if (!raw && optional) return null;
  if (!pattern.test(raw)) throw badRequest('Das Token sieht nicht richtig aus.', { field });
  return raw;
}

const TARGETS = {
  discord: {
    parse(input) {
      const match = DISCORD.exec(text(input.url));
      if (!match) throw badRequest('Das ist keine Discord-Webhook-Adresse (https://discord.com/api/webhooks/…).', { field: 'url' });
      return { id: match[1], token: match[2] };
    },
    hint: (target) => `…${String(target.id).slice(-4)}`,
  },
  slack: {
    parse(input) {
      const match = SLACK.exec(text(input.url));
      if (!match) throw badRequest('Das ist keine Slack-Webhook-Adresse (https://hooks.slack.com/…).', { field: 'url' });
      return { path: match[1] };
    },
    hint: (target) => `…${String(target.path).slice(-4)}`,
  },
  telegram: {
    parse(input, previous) {
      const chatId = text(input.chatId) || (previous && previous.chatId) || '';
      if (!TELEGRAM_CHAT.test(chatId)) throw badRequest('Die Chat-ID sieht nicht richtig aus (Zahl oder @kanalname).', { field: 'chatId' });
      const secret = text(input.token) ? token(input.token, 'token', { pattern: TELEGRAM_TOKEN }) : previous && previous.token;
      if (!secret) throw badRequest('Das Token sieht nicht richtig aus.', { field: 'token' });
      return { token: secret, chatId };
    },
    hint: (target) => target.chatId,
  },
  ntfy: {
    parse(input, previous) {
      const server = serverUrl(input.server, 'server', { fallback: (previous && previous.server) || 'https://ntfy.sh' });
      const topic = text(input.topic) || (previous && previous.topic) || '';
      if (!NTFY_TOPIC.test(topic)) throw badRequest('Das Thema darf nur Buchstaben, Ziffern, - und _ enthalten.', { field: 'topic' });
      const secret = text(input.token) ? token(input.token, 'token') : input.token === null ? null : (previous && previous.token) || null;
      return { server, topic, token: secret };
    },
    hint: (target) => `${target.topic} @ ${new URL(target.server).host}`,
  },
  matrix: {
    parse(input, previous) {
      const homeserver = serverUrl(input.homeserver, 'homeserver', {
        fallback: previous && previous.homeserver,
        https: !config.allowPrivateFetch,
      });
      const room = text(input.room) || (previous && previous.room) || '';
      if (!MATRIX_ROOM.test(room)) throw badRequest('Der Raum sieht nicht richtig aus (!id:server oder #name:server).', { field: 'room' });
      const secret = text(input.token) ? token(input.token, 'token') : previous && previous.token;
      if (!secret) throw badRequest('Das Token sieht nicht richtig aus.', { field: 'token' });
      return { homeserver, room, token: secret };
    },
    hint: (target) => target.room,
  },
  mastodon: {
    parse(input, previous) {
      const instance = serverUrl(input.instance, 'instance', { fallback: previous && previous.instance, https: !config.allowPrivateFetch });
      const secret = text(input.token) ? token(input.token, 'token') : previous && previous.token;
      if (!secret) throw badRequest('Das Token sieht nicht richtig aus.', { field: 'token' });
      const visibility = text(input.visibility) || (previous && previous.visibility) || 'public';
      if (!VISIBILITIES.includes(visibility)) throw badRequest('Ungültige Sichtbarkeit.', { field: 'visibility' });
      return { instance, token: secret, visibility };
    },
    hint: (target) => `@ ${new URL(target.instance).host}`,
  },
  webhook: {
    parse(input, previous) {
      const url = hookUrl(input.url, previous && previous.url);
      let secret = previous ? previous.secret || null : null;
      if (input.secret === null) secret = null;
      else if (text(input.secret)) {
        if (!SIGNING_SECRET.test(text(input.secret)))
          throw badRequest('Der Schlüssel braucht 8 bis 200 Zeichen ohne Leerzeichen.', { field: 'secret' });
        secret = text(input.secret);
      }
      return { url, secret };
    },
    hint: (target) => new URL(target.url).host,
  },
};

function targetOf(row) {
  try {
    const value = JSON.parse(secrets.decrypt(row.target));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

const typesOf = (row) =>
  String(row.types || '')
    .split(',')
    .filter((type) => TYPES.includes(type));

function present(row) {
  const target = targetOf(row);
  let hint = null;
  try {
    hint = target ? TARGETS[row.kind].hint(target) : null;
  } catch {
    hint = null;
  }
  return {
    id: Number(row.id),
    name: row.name || null,
    kind: row.kind,
    enabled: Boolean(Number(row.enabled)),
    tag: row.tag || null,
    types: typesOf(row),
    template: row.template || null,
    hint,
    visibility: target && row.kind === 'mastodon' ? target.visibility : null,
    signed: target && row.kind === 'webhook' ? Boolean(target.secret) : null,
    createdAt: Number(row.created_at),
    lastSuccessAt: row.last_success_at ? Number(row.last_success_at) : null,
    lastError: row.last_error || null,
    failures: Number(row.failures) || 0,
  };
}

const rowsOf = (userId) => db.all('SELECT * FROM auto_shares WHERE user_id = ? ORDER BY id', [userId]);

async function list(user) {
  return (await rowsOf(user.id)).map(present);
}

async function own(user, id) {
  const ruleId = Number(id);
  const row = Number.isSafeInteger(ruleId)
    ? await db.get('SELECT * FROM auto_shares WHERE id = ? AND user_id = ?', [ruleId, user.id])
    : null;
  if (!row) throw notFound('Diese Regel gibt es nicht.');
  return row;
}

function cleanName(value) {
  if (value === undefined) return undefined;
  const name = text(value).replace(/\s+/g, ' ').slice(0, MAX_NAME);
  return name || null;
}

function cleanTag(value) {
  if (value === undefined) return undefined;
  if (value === null || text(String(value)) === '') return null;
  const tag = typeof value === 'string' ? files.normalizeTag(value) : null;
  if (!tag) throw badRequest('Ungültiger Tag.', { field: 'tag' });
  return tag;
}

function cleanTypes(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((type) => !TYPES.includes(type))) throw badRequest('Ungültiger Dateityp.', { field: 'types' });
  const list = TYPES.filter((type) => value.includes(type));
  return list.length && list.length < TYPES.length ? list.join(',') : null;
}

function cleanTemplate(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw badRequest('Ungültige Vorlage.', { field: 'template' });
  const template = value.replace(/\r\n?/g, '\n').trim();
  if (template.length > MAX_TEMPLATE) throw badRequest(`Höchstens ${MAX_TEMPLATE} Zeichen.`, { field: 'template' });
  if (template && !/\{link\}/.test(template)) throw badRequest('Die Vorlage braucht den Platzhalter {link}.', { field: 'template' });
  return template || null;
}

function cleanEnabled(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw badRequest('Erwartet wird an oder aus.', { field: 'enabled' });
  return value ? 1 : 0;
}

async function create(user, input = {}) {
  assertEnabled();
  const kind = text(input.kind);
  if (!KINDS.includes(kind)) throw badRequest('Dieses Ziel gibt es nicht.', { field: 'kind' });
  if ((await db.count('SELECT COUNT(*) FROM auto_shares WHERE user_id = ?', [user.id])) >= MAX_RULES) {
    throw conflict(`Du kannst höchstens ${MAX_RULES} Regeln anlegen.`);
  }
  const target = TARGETS[kind].parse(input, null);
  const row = {
    user_id: user.id,
    name: cleanName(input.name) ?? null,
    kind,
    target: secrets.encrypt(JSON.stringify(target)),
    tag: cleanTag(input.tag) ?? null,
    types: cleanTypes(input.types) ?? null,
    template: cleanTemplate(input.template) ?? null,
    enabled: cleanEnabled(input.enabled) ?? 1,
    created_at: Date.now(),
    failures: 0,
  };
  const id = await db.insertRow('auto_shares', row);
  return present(await db.get('SELECT * FROM auto_shares WHERE id = ?', [id]));
}

const TARGET_FIELDS = ['url', 'token', 'chatId', 'server', 'topic', 'homeserver', 'room', 'instance', 'visibility', 'secret'];

async function update(user, id, input = {}) {
  assertEnabled();
  const row = await own(user, id);
  const fields = {};
  const name = cleanName(input.name);
  if (name !== undefined) fields.name = name;
  const tag = cleanTag(input.tag);
  if (tag !== undefined) fields.tag = tag;
  const types = cleanTypes(input.types);
  if (types !== undefined) fields.types = types;
  const template = cleanTemplate(input.template);
  if (template !== undefined) fields.template = template;
  const switched = cleanEnabled(input.enabled);
  if (switched !== undefined) fields.enabled = switched;
  const retarget = TARGET_FIELDS.some((field) => input[field] !== undefined);
  if (retarget) {
    const previous = targetOf(row);
    fields.target = secrets.encrypt(JSON.stringify(TARGETS[row.kind].parse(input, previous)));
  }
  if (retarget || (fields.enabled === 1 && !Number(row.enabled))) Object.assign(fields, { last_error: null, failures: 0 });
  const columns = Object.keys(fields);
  if (columns.length) {
    await db.run(`UPDATE auto_shares SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((column) => fields[column]),
      row.id,
    ]);
  }
  return present(await db.get('SELECT * FROM auto_shares WHERE id = ?', [row.id]));
}

async function remove(user, id) {
  const row = await own(user, id);
  await db.run('DELETE FROM auto_shares WHERE id = ?', [row.id]);
}

const escapeMarkdown = (value) => String(value).replace(/([\\*_~`|>[\]()#-])/g, '\\$1');
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const escapeSlack = (value) => String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);

const FORMATS = {
  discord: { escape: escapeMarkdown, bold: (value) => `**${value}**`, literal: (value) => value },
  slack: { escape: escapeSlack, bold: (value) => `*${value}*`, literal: escapeSlack },
  telegram: { escape: escapeHtml, bold: (value) => `<b>${value}</b>`, literal: escapeHtml },
  matrix: { escape: (value) => String(value), bold: (value) => value, literal: (value) => value },
  ntfy: { escape: (value) => String(value), bold: (value) => value, literal: (value) => value },
  mastodon: { escape: (value) => String(value), bold: (value) => value, literal: (value) => value },
  webhook: { escape: (value) => String(value), bold: (value) => value, literal: (value) => value },
};

const ALIASES = { title: 'titel', description: 'beschreibung', file: 'datei', account: 'konto' };

function render(kind, template, values) {
  const format = FORMATS[kind];
  if (!template) {
    const link = format.literal(values.link);
    const lines = values.titel ? [format.bold(format.escape(values.titel)), link] : [link];
    return lines.join('\n');
  }
  const pieces = template.split(/(\{[a-zäöüß]+\})/i);
  return pieces
    .map((piece) => {
      const match = /^\{([a-zäöüß]+)\}$/i.exec(piece);
      if (!match) return format.literal(piece);
      const key = ALIASES[match[1].toLowerCase()] || match[1].toLowerCase();
      if (!(key in values)) return format.literal(piece);
      return key === 'link' ? format.literal(values.link) : format.escape(values[key] || '');
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const plainHtml = (value) => escapeHtml(value).replace(/\n/g, '<br>');

const request = (http, options) =>
  http({
    timeout: TIMEOUT_MS,
    maxRedirects: 0,
    proxy: false,
    ...options,
    headers: { 'User-Agent': brand.userAgent(), ...(options.headers || {}) },
  });

const SENDERS = {
  async discord(target, message) {
    await request(axios, {
      method: 'post',
      url: `${config.discord.api}/webhooks/${encodeURIComponent(target.id)}/${encodeURIComponent(target.token)}`,
      data: { content: message.text.slice(0, 2000), username: settings.get('site.title'), allowed_mentions: { parse: [] } },
    });
  },
  async slack(target, message) {
    await request(axios, { method: 'post', url: `${config.slack.hooks}/${target.path}`, data: { text: message.text.slice(0, 3000) } });
  },
  async telegram(target, message) {
    await request(axios, {
      method: 'post',
      url: `${config.telegram.api}/bot${target.token}/sendMessage`,
      data: { chat_id: target.chatId, text: message.text.slice(0, 4000), parse_mode: 'HTML' },
    });
  },
  async ntfy(target, message) {
    await request(safeHttp, {
      method: 'post',
      url: target.server,
      headers: target.token ? { Authorization: `Bearer ${target.token}` } : {},
      data: { topic: target.topic, title: message.title, message: message.text.slice(0, 3000), click: message.link, tags: ['link'] },
    });
  },
  async matrix(target, message) {
    let room = target.room;
    if (room.startsWith('#')) {
      const { data } = await request(safeHttp, {
        method: 'get',
        url: `${target.homeserver}/_matrix/client/v3/directory/room/${encodeURIComponent(room)}`,
        headers: { Authorization: `Bearer ${target.token}` },
      });
      if (!data || !data.room_id) throw new Error('Den Matrix-Raum gibt es nicht.');
      room = data.room_id;
    }
    await request(safeHttp, {
      method: 'put',
      url: `${target.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(room)}/send/m.room.message/${crypto.randomUUID()}`,
      headers: { Authorization: `Bearer ${target.token}` },
      data: { msgtype: 'm.text', body: message.text, format: 'org.matrix.custom.html', formatted_body: plainHtml(message.text) },
    });
  },
  async webhook(target, message) {
    const body = JSON.stringify({
      event: message.event,
      text: message.text,
      link: message.link,
      title: message.values.titel || null,
      description: message.values.beschreibung || null,
      file: message.values.datei || null,
      type: message.values.type || null,
      tags: message.values.tagList || [],
      account: message.values.konto || null,
      site: { title: settings.get('site.title'), url: settings.get('site.baseUrl') },
      at: new Date().toISOString(),
    });
    const headers = { 'Content-Type': 'application/json', 'X-Webhook-Event': message.event };
    if (target.secret) headers['X-Webhook-Signature'] = `sha256=${crypto.createHmac('sha256', target.secret).update(body).digest('hex')}`;
    await request(safeHttp, { method: 'post', url: target.url, headers, data: body, transformRequest: [(data) => data] });
  },
  async mastodon(target, message) {
    const status = message.text.length > 500 ? `${message.text.slice(0, 500 - message.link.length - 2)}…\n${message.link}` : message.text;
    await request(safeHttp, {
      method: 'post',
      url: `${target.instance}/api/v1/statuses`,
      headers: { Authorization: `Bearer ${target.token}`, 'Idempotency-Key': crypto.randomUUID() },
      data: { status, visibility: target.visibility || 'public' },
    });
  },
};

function describe(error) {
  const status = error && error.response ? error.response.status : null;
  if (status) return `HTTP ${status}`;
  if (error && /^E[A-Z]+$/.test(String(error.code || ''))) return String(error.code);
  return String((error && error.message) || error).slice(0, 180);
}

async function recordResult(row, error) {
  if (!error) {
    await db.run('UPDATE auto_shares SET last_success_at = ?, last_error = NULL, failures = 0 WHERE id = ?', [Date.now(), row.id]);
    return;
  }
  const status = error.response ? error.response.status : null;
  const message = describe(error);
  if (status === 429) {
    await db.run('UPDATE auto_shares SET last_error = ? WHERE id = ?', [message, row.id]);
    return;
  }
  const gone = status === 401 || status === 403 || status === 404 || status === 410;
  await db.run(
    `UPDATE auto_shares SET last_error = ?, enabled = CASE WHEN ${gone ? '1 = 1' : 'failures + 1 >= ?'} THEN 0 ELSE enabled END, failures = failures + 1 WHERE id = ?`,
    gone ? [message, row.id] : [message, MAX_FAILURES, row.id]
  );
}

async function deliver(row, values, event = 'upload') {
  const target = targetOf(row);
  if (!target) throw new Error('Das Ziel ließ sich nicht entschlüsseln.');
  const message = {
    text: render(row.kind, row.template, values),
    title: values.titel || settings.get('site.title'),
    link: values.link,
    event,
    values,
  };
  await SENDERS[row.kind](target, message);
}

async function test(user, id) {
  assertEnabled();
  const row = await own(user, id);
  const values = {
    link: `${settings.get('site.baseUrl')}/`,
    titel: `${settings.get('site.title')}: Test`,
    beschreibung: '',
    datei: 'test.png',
    tags: '',
    konto: user.username,
    type: 'image',
    tagList: [],
  };
  try {
    await deliver(row, values, 'test');
    await recordResult(row, null);
  } catch (error) {
    await recordResult(row, error);
    throw badRequest('Das Ziel hat die Nachricht nicht angenommen. Prüf die Angaben.', { code: 'autoshare_failed' });
  }
  return present(await db.get('SELECT * FROM auto_shares WHERE id = ?', [row.id]));
}

function shareable(record, via, now = Date.now()) {
  if (SKIPPED_VIA.has(via)) return false;
  if (record.password_hash || record.max_views || record.blocked_at || record.deleted_at) return false;
  if (record.publish_at && Number(record.publish_at) > now) return false;
  return !isSealedName(record.filename);
}

function matches(row, type, tags) {
  if (row.tag && !tags.includes(row.tag)) return false;
  const types = typesOf(row);
  return !types.length || types.includes(type);
}

async function shareUpload(user, record, link, { via = 'upload', tags = [] } = {}) {
  if (!enabled() || !user || !user.id || !shareable(record, via)) return 0;
  const rows = (await rowsOf(user.id)).filter((row) => Number(row.enabled));
  if (!rows.length) return 0;
  const { type } = files.typeOf(record.filename, record.syntax);
  const values = {
    link,
    titel: record.title || '',
    beschreibung: record.description || '',
    datei: record.original_name || record.filename,
    tags: tags.map((tag) => `#${tag}`).join(' '),
    konto: user.username,
    type,
    tagList: tags,
  };
  let posted = 0;
  for (const row of rows.filter((candidate) => matches(candidate, type, tags))) {
    try {
      await deliver(row, values);
      await recordResult(row, null);
      posted += 1;
    } catch (error) {
      log.warn('Automatisches Teilen fehlgeschlagen', { user: user.username, kind: row.kind, error: describe(error) });
      await recordResult(row, error);
    }
  }
  return posted;
}

function shareLater(user, record, link, options) {
  shareUpload(user, record, link, options).catch((error) => log.warn('Automatisches Teilen fehlgeschlagen', { error }));
}

module.exports = { KINDS, TYPES, MAX_RULES, enabled, list, create, update, remove, test, shareUpload, shareLater, render };
