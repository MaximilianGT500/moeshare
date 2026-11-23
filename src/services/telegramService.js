'use strict';

const fs = require('fs');
const fsp = fs.promises;
const { pipeline } = require('stream/promises');
const axios = require('axios');
const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const ephemeral = require('../lib/ephemeral');
const brand = require('../lib/brand');
const { translate } = require('../lib/i18n');
const { randomToken } = require('../lib/secrets');
const { HttpError, badGateway, badRequest, notFound, tooLarge } = require('../lib/errors');
const { extensionOf, ensureUserDirs, filePaths } = require('../lib/storage');
const { formatBytes } = require('../lib/format');
const settings = require('./settingsService');
const quota = require('./quotaService');
const uploads = require('./uploadService');
const links = require('./linkService');
const files = require('./fileService');
const { languageOf } = require('./preferenceService');

const log = logger.scope('telegram');

const PROVIDER = 'telegram';
const KIND = 'telegram';
const LINK_KIND = 'telegram-link';
const LOCK = 'telegram-poll';
const LINK_TTL_MS = 10 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 20 * 1024 * 1024;
const MESSAGE_MAX = 4000;
const RECENT = 5;
const IDLE_MS = 5000;
const TOKEN = /^\d{5,15}:[\w-]{20,80}$/;
const CODE = /^[\w-]{10,64}$/;
const URL_ONLY = /^https?:\/\/\S+$/i;

const pollSeconds = () => config.telegram.pollSeconds;
const token = () => settings.get('telegram.token');
const enabled = () => Boolean(settings.get('telegram.enabled') && TOKEN.test(token() || ''));
const site = () => settings.get('site.title') || 'MoeShare';
const base = () => settings.get('site.baseUrl');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const http = axios.create({ maxRedirects: 0, proxy: false });

async function call(method, data = {}, { timeout = 15000, secret = token() } = {}) {
  const { data: body } = await http.post(`${config.telegram.api}/bot${secret}/${method}`, data, {
    timeout,
    headers: { 'User-Agent': brand.userAgent() },
  });
  if (!body || body.ok !== true)
    throw Object.assign(new Error('Telegram hat die Anfrage abgelehnt.'), { response: { status: 400, data: body } });
  return body.result;
}

function describe(error) {
  const status = error && error.response ? error.response.status : 0;
  if (status === 401 || status === 404) return 'Telegram kennt dieses Bot-Token nicht.';
  if (status === 409)
    return 'Ein anderes Programm holt schon Nachrichten für diesen Bot ab, zum Beispiel ein Webhook oder ein zweiter Server.';
  if (status === 429) return 'Telegram bremst gerade, zu viele Anfragen.';
  if (status >= 400) return `Telegram hat mit HTTP ${status} geantwortet.`;
  return 'Telegram ist gerade nicht erreichbar.';
}

async function stored() {
  return (await ephemeral.get(KIND, 'state')) || {};
}

async function remember(patch) {
  const next = { ...(await stored()), ...patch };
  await ephemeral.put(KIND, 'state', next, YEAR_MS);
  return next;
}

async function state() {
  const saved = await stored();
  const linked = await db.count('SELECT COUNT(*) FROM chat_links WHERE provider = ?', [PROVIDER]);
  return {
    enabled: Boolean(settings.get('telegram.enabled')),
    configured: TOKEN.test(token() || ''),
    bot: saved.bot || null,
    error: saved.error || null,
    checkedAt: saved.checkedAt || null,
    lastMessageAt: saved.lastMessageAt || null,
    linked,
  };
}

const COMMANDS = {
  de: [
    { command: 'hilfe', description: 'Zeigt, was der Bot kann' },
    { command: 'letzte', description: 'Deine letzten Uploads' },
    { command: 'trennen', description: 'Verbindung zum Konto lösen' },
  ],
  en: [
    { command: 'help', description: 'Shows what the bot can do' },
    { command: 'last', description: 'Your latest uploads' },
    { command: 'unlink', description: 'Disconnect from your account' },
  ],
};

async function check(secret = token()) {
  if (!TOKEN.test(secret || ''))
    throw badRequest('Das Bot-Token sieht nicht richtig aus. Du bekommst es von @BotFather.', { field: 'telegram.token' });
  try {
    const me = await call('getMe', {}, { secret });
    const bot = { id: me.id, username: me.username, name: me.first_name || me.username };
    await call('setMyCommands', { commands: COMMANDS.de, language_code: 'de' }, { secret }).catch(() => {});
    await call('setMyCommands', { commands: COMMANDS.en }, { secret }).catch(() => {});
    await remember({ bot, error: null, checkedAt: Date.now(), token: secret.split(':')[0] });
    log.info('Telegram-Bot verbunden', { bot: `@${bot.username}` });
    return state();
  } catch (error) {
    const message = describe(error);
    await remember({ error: message, checkedAt: Date.now() });
    throw badGateway(message);
  }
}

async function botInfo() {
  const saved = await stored();
  if (saved.bot && saved.token === String(token()).split(':')[0]) return saved.bot;
  const next = await check();
  return next.bot;
}

const chatLink = (chatId) =>
  db.get(
    `SELECT c.id AS link_id, c.chat_id, c.name AS chat_name, u.* FROM chat_links c JOIN users u ON u.id = c.user_id
     WHERE c.provider = ? AND c.chat_id = ?`,
    [PROVIDER, chatId]
  );

async function linkFor(userId) {
  const row = await db.get('SELECT * FROM chat_links WHERE user_id = ? AND provider = ?', [userId, PROVIDER]);
  return row
    ? { name: row.name || null, createdAt: Number(row.created_at), lastUsedAt: row.last_used_at ? Number(row.last_used_at) : null }
    : null;
}

async function accountState(user) {
  if (!settings.get('telegram.enabled')) return { enabled: false, bot: null, link: null };
  const saved = await stored();
  return { enabled: enabled(), bot: saved.bot ? saved.bot.username : null, link: await linkFor(user.id) };
}

async function startLink(user) {
  if (!enabled()) throw notFound('Der Telegram-Bot ist auf diesem Server abgeschaltet.');
  const bot = await botInfo();
  const code = randomToken(18);
  await ephemeral.put(LINK_KIND, code, { userId: user.id }, LINK_TTL_MS);
  return { code, url: `https://t.me/${bot.username}?start=${code}`, bot: bot.username, expiresAt: Date.now() + LINK_TTL_MS };
}

async function unlink(userId) {
  const { changes } = await db.run('DELETE FROM chat_links WHERE user_id = ? AND provider = ?', [userId, PROVIDER]);
  return changes > 0;
}

function languageFor(account, from) {
  const own = account ? languageOf(account.preferences) : null;
  if (own) return own;
  const code = String((from && from.language_code) || '');
  if (code.startsWith('de')) return 'de';
  if (code) return 'en';
  return settings.get('site.language') === 'en' ? 'en' : 'de';
}

const clip = (text) => (text.length > MESSAGE_MAX ? `${text.slice(0, MESSAGE_MAX - 1)}…` : text);

async function reply(chatId, text, replyTo = null) {
  try {
    await call('sendMessage', {
      chat_id: chatId,
      text: clip(text),
      link_preview_options: { is_disabled: true },
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    });
  } catch (error) {
    log.warn('Antwort an Telegram fehlgeschlagen', { error: describe(error) });
  }
}

function helpText(t, linked) {
  const lines = [
    t('Ich speichere alles, was du mir schickst, in {site}:', { site: site() }),
    t(
      'Fotos, Videos, Dateien, Audio und Sprachnachrichten landen in deinen Uploads. Text wird zu einer Textdatei, ein einzelner Link wird gekürzt.'
    ),
    t('Hashtags in der Bildunterschrift werden zu Tags, der Rest zum Titel.'),
    '',
    t('/letzte zeigt deine letzten Uploads, /trennen löst die Verbindung.'),
  ];
  if (!linked) lines.push('', t('Verbinde zuerst dein Konto unter Konto › ShareX und API: {url}', { url: `${base()}/account#sharex` }));
  return lines.join('\n');
}

function captionParts(caption) {
  const text = typeof caption === 'string' ? caption : '';
  const tags = [...text.matchAll(/(^|\s)#([\p{L}\p{N}_-]{1,40})/gu)].map((match) => match[2]);
  const title = text
    .replace(/(^|\s)#[\p{L}\p{N}_-]{1,40}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return { tags, title };
}

function stamp(date) {
  const value = new Date((Number(date) || Date.now() / 1000) * 1000);
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
}

function attachmentOf(message) {
  const when = stamp(message.date);
  if (Array.isArray(message.photo) && message.photo.length) {
    const best = [...message.photo].sort((a, b) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height))[0];
    return { id: best.file_id, size: best.file_size, name: `telegram-${when}.jpg` };
  }
  if (message.document) return { id: message.document.file_id, size: message.document.file_size, name: message.document.file_name || null };
  if (message.video)
    return { id: message.video.file_id, size: message.video.file_size, name: message.video.file_name || `video-${when}.mp4` };
  if (message.animation)
    return {
      id: message.animation.file_id,
      size: message.animation.file_size,
      name: message.animation.file_name || `animation-${when}.mp4`,
    };
  if (message.audio) {
    const fallback = [message.audio.performer, message.audio.title].filter(Boolean).join(' - ') || `audio-${when}`;
    return { id: message.audio.file_id, size: message.audio.file_size, name: message.audio.file_name || `${fallback}.mp3` };
  }
  if (message.voice) return { id: message.voice.file_id, size: message.voice.file_size, name: `sprachnachricht-${when}.ogg` };
  if (message.video_note) return { id: message.video_note.file_id, size: message.video_note.file_size, name: `videonachricht-${when}.mp4` };
  return null;
}

async function download(account, attachment, limits) {
  const info = await call('getFile', { file_id: attachment.id });
  if (!info || !info.file_path) throw badRequest('Telegram gibt diese Datei nicht heraus.');
  const size = Number(info.file_size || attachment.size) || 0;
  if (size > MAX_BYTES)
    throw tooLarge(`Telegram gibt Bots nur Dateien bis ${formatBytes(MAX_BYTES)} heraus. Lade größere Dateien im Browser hoch.`);
  const max = Math.min(MAX_BYTES, limits.limit || MAX_BYTES);
  if (limits.limit && size > limits.limit) throw tooLarge(limits.message);
  const name = String(attachment.name || info.file_path.split('/').pop() || 'datei')
    .replace(/[\\/]/g, '_')
    .slice(0, 200);
  const extension = extensionOf(name) || extensionOf(info.file_path) || '.bin';
  ensureUserDirs(account.username);
  const filename = uploads.newFilename(extension === '.oga' ? '.ogg' : extension);
  const target = filePaths(account.username, filename).file;
  try {
    const response = await http.get(`${config.telegram.api}/file/bot${token()}/${info.file_path}`, {
      responseType: 'stream',
      timeout: 60000,
      maxContentLength: max,
      headers: { 'User-Agent': brand.userAgent() },
    });
    let received = 0;
    response.data.on('data', (chunk) => {
      received += chunk.length;
      if (received > max) response.data.destroy(Object.assign(new Error('Zu groß'), { code: 'ETOOLARGE' }));
    });
    await pipeline(response.data, fs.createWriteStream(target));
  } catch (error) {
    await fsp.rm(target, { force: true });
    if (error.code === 'ETOOLARGE' || error.code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED') throw tooLarge(limits.message);
    throw badGateway('Die Datei ließ sich nicht von Telegram laden.');
  }
  return { filename, name: extensionOf(name) ? name : `${name}${extension}` };
}

async function saveAttachment(account, message, t) {
  const attachment = attachmentOf(message);
  const limits = await quota.limitsFor(account);
  if (limits.remaining === 0) throw tooLarge(limits.message);
  const { tags, title } = captionParts(message.caption);
  const raw = { tags: tags.length ? tags : undefined, title: title || undefined };
  const options = await uploads.resolveOptions(account, raw);
  const fetched = await download(account, attachment, limits);
  const result = await uploads.accept(account, fetched.filename, { via: PROVIDER, originalName: fetched.name, options });
  return t('Gespeichert: {url}', { url: result.view });
}

async function saveText(account, text, t) {
  if (URL_ONLY.test(text) && settings.get('links.enabled')) {
    const result = await links.create(account, text, {});
    return t('Gekürzt: {url}', { url: result.short });
  }
  const limits = await quota.limitsFor(account);
  if (limits.remaining === 0) throw tooLarge(limits.message);
  const { tags } = captionParts(text);
  const result = await uploads.createText(account, text, { tags: tags.length ? tags : undefined }, limits);
  return t('Als Text gespeichert: {url}', { url: result.view });
}

async function recent(account, t) {
  const rows = await db.all(
    `SELECT * FROM file_data WHERE username = ? AND deleted_at IS NULL AND blocked_at IS NULL ORDER BY id DESC LIMIT ${RECENT}`,
    [account.username]
  );
  if (!rows.length) return t('Du hast noch nichts hochgeladen.');
  return [
    t('Deine letzten Uploads:'),
    ...rows.map((row) => `${row.title || row.original_name || row.filename}: ${files.urlsFor(row).view}`),
  ].join('\n');
}

const reason = (error, t) => (error instanceof HttpError ? t(error.message) : t('Das hat nicht geklappt. Versuch es gleich noch einmal.'));

async function connect(chatId, from, code, t) {
  const pending = CODE.test(code) ? await ephemeral.take(LINK_KIND, code) : null;
  if (!pending) return t('Der Code ist ungültig oder abgelaufen. Hol dir unter Konto › ShareX und API einen neuen.');
  const account = await db.get('SELECT * FROM users WHERE id = ?', [pending.userId]);
  if (!account || account.status !== 'active') return t('Dieses Konto gibt es nicht mehr oder es ist gesperrt.');
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || (from.username ? `@${from.username}` : null);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM chat_links WHERE provider = ? AND (chat_id = ? OR user_id = ?)', [PROVIDER, chatId, account.id]);
    await tx.insertRow('chat_links', {
      user_id: account.id,
      provider: PROVIDER,
      chat_id: chatId,
      name: name ? name.slice(0, 255) : null,
      created_at: Date.now(),
    });
  });
  log.info('Telegram mit einem Konto verbunden', { user: account.username });
  const lt = (text, values) => translate(languageFor(account, from), text, values);
  return [lt('Verbunden mit {username} bei {site}.', { username: account.username, site: site() }), '', helpText(lt, true)].join('\n');
}

async function command(chatId, from, linked, text, t) {
  const [head, ...rest] = text.split(/\s+/);
  const name = head.slice(1).split('@')[0].toLowerCase();
  const argument = rest.join(' ').trim();
  if (name === 'start') {
    if (argument) return connect(chatId, from, argument, t);
    return linked ? helpText(t, true) : helpText(t, false);
  }
  if (name === 'hilfe' || name === 'help') return helpText(t, Boolean(linked));
  if (!linked) return helpText(t, false);
  if (name === 'letzte' || name === 'last') return recent(linked, t);
  if (name === 'trennen' || name === 'unlink') {
    await db.run('DELETE FROM chat_links WHERE provider = ? AND chat_id = ?', [PROVIDER, chatId]);
    log.info('Telegram vom Konto getrennt', { user: linked.username });
    return t('Getrennt. Ich speichere nichts mehr für {username}.', { username: linked.username });
  }
  return t('Diesen Befehl kenne ich nicht. /hilfe zeigt, was geht.');
}

async function handle(update, groups) {
  const message = update && update.message;
  if (!message || !message.chat || message.chat.type !== 'private') return;
  const chatId = String(message.chat.id);
  const from = message.from || {};
  if (from.is_bot) return;
  const linked = await chatLink(chatId);
  const t = (text, values) => translate(languageFor(linked, from), text, values);
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  await remember({ lastMessageAt: Date.now() });
  if (text.startsWith('/')) {
    await reply(chatId, await command(chatId, from, linked, text, t).catch((error) => reason(error, t)), message.message_id);
    return;
  }
  if (!linked) {
    await reply(chatId, helpText(t, false), message.message_id);
    return;
  }
  if (linked.status !== 'active') {
    await reply(chatId, t('Dein Konto bei {site} ist gesperrt.', { site: site() }), message.message_id);
    return;
  }
  db.run('UPDATE chat_links SET last_used_at = ? WHERE id = ?', [Date.now(), linked.link_id]).catch(() => {});
  let work = null;
  if (attachmentOf(message)) work = () => saveAttachment(linked, message, t);
  else if (text) work = () => saveText(linked, text, t);
  else if (message.sticker) work = async () => t('Sticker speichere ich nicht. Schick mir Fotos, Videos, Dateien oder Text.');
  else return;
  const line = await work().catch((error) => {
    if (!(error instanceof HttpError)) log.warn('Nachricht aus Telegram ließ sich nicht speichern', { user: linked.username, error });
    return reason(error, t);
  });
  if (message.media_group_id) {
    const key = `${chatId}:${message.media_group_id}`;
    const group = groups.get(key) || { chatId, replyTo: message.message_id, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
    return;
  }
  await reply(chatId, line, message.message_id);
}

async function pollOnce() {
  const saved = (await ephemeral.get(KIND, 'offset')) || {};
  const updates = await call(
    'getUpdates',
    { offset: saved.value || undefined, timeout: pollSeconds(), allowed_updates: ['message'] },
    { timeout: (pollSeconds() + 15) * 1000 }
  );
  const groups = new Map();
  for (const update of Array.isArray(updates) ? updates : []) {
    await ephemeral.put(KIND, 'offset', { value: Number(update.update_id) + 1 }, YEAR_MS);
    try {
      await handle(update, groups);
    } catch (error) {
      log.warn('Nachricht aus Telegram ließ sich nicht verarbeiten', { error });
    }
  }
  for (const group of groups.values()) await reply(group.chatId, group.lines.join('\n'), group.replyTo);
}

let started = false;
let failures = 0;

async function loop() {
  for (;;) {
    if (!enabled()) {
      failures = 0;
      await sleep(IDLE_MS);
      continue;
    }
    const lock = await ephemeral.acquire(LOCK, (pollSeconds() + 30) * 1000).catch(() => null);
    if (!lock) {
      await sleep(IDLE_MS);
      continue;
    }
    try {
      await pollOnce();
      if (failures) await remember({ error: null });
      failures = 0;
    } catch (error) {
      failures += 1;
      const message = describe(error);
      if (failures === 1 || failures % 20 === 0) log.warn('Telegram ist nicht erreichbar', { error: message, tries: failures });
      await remember({ error: message });
      if (error.response && error.response.status === 409) await call('deleteWebhook', {}).catch(() => {});
      await sleep(Math.min(60000, 2000 * failures));
    } finally {
      await ephemeral.release(LOCK, lock).catch(() => {});
    }
  }
}

function start() {
  if (started) return;
  started = true;
  loop().catch((error) => log.error('Der Telegram-Bot ist ausgefallen', { error }));
}

module.exports = { PROVIDER, TOKEN, enabled, state, check, accountState, startLink, unlink, linkFor, start, handle, captionParts };
