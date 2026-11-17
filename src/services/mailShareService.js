'use strict';

const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const i18n = require('../lib/i18n');
const { badRequest, forbidden, tooManyRequests } = require('../lib/errors');
const { isSealedName } = require('../lib/sealed');
const { normalizeEmail } = require('./emailService');
const files = require('./fileService');
const mail = require('./mailService');
const settings = require('./settingsService');

const MAX_RECIPIENTS = 5;
const MAX_MESSAGE = 500;
const PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

const enabled = () => Boolean(settings.get('sharing.email') && mail.ready());

function recipientsOf(input) {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,;]+/) : [];
  const list = [...new Set(raw.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))];
  if (!list.length) throw badRequest('Gib mindestens eine E-Mail-Adresse ein.', { field: 'to' });
  if (list.length > MAX_RECIPIENTS) throw badRequest(`Höchstens ${MAX_RECIPIENTS} Empfänger auf einmal.`, { field: 'to' });
  return list.map((value) => {
    try {
      return normalizeEmail(value);
    } catch {
      throw badRequest('Eine der E-Mail-Adressen sieht nicht richtig aus.', { field: 'to' });
    }
  });
}

function noteOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw badRequest('Ungültige Nachricht.', { field: 'message' });
  const note = value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (note.length > MAX_MESSAGE) throw badRequest(`Höchstens ${MAX_MESSAGE} Zeichen.`, { field: 'message' });
  return note;
}

async function budget(user, count) {
  const key = `${user.id}:${Math.floor(Date.now() / HOUR_MS)}`;
  await ephemeral.putIfAbsent('mailshare', key, { sent: 0 }, 2 * HOUR_MS);
  const current = await ephemeral.get('mailshare', key);
  if (current && Number(current.sent) + count > PER_HOUR) {
    throw tooManyRequests(`Du kannst höchstens ${PER_HOUR} E-Mails pro Stunde verschicken. Versuch es später noch einmal.`);
  }
  for (let index = 0; index < count; index += 1) await ephemeral.increment('mailshare', key, 'sent');
}

async function senderOf(user) {
  const row = await db.get('SELECT username, email, email_verified_at, profile FROM users WHERE id = ?', [user.id]);
  let name = user.username;
  try {
    const profile = JSON.parse((row && row.profile) || '{}');
    if (profile && typeof profile.name === 'string' && profile.name.trim()) name = profile.name.trim().slice(0, 80);
  } catch {
    name = user.username;
  }
  return { name, replyTo: row && row.email && row.email_verified_at ? row.email : null };
}

function message(language, { sender, title, note, url, kind, locked }) {
  const t = (text, values) => i18n.translate(language, text, values);
  const quoted = language === 'en' ? `“${title}”` : `„${title}“`;
  const subject =
    kind === 'album' ? t('{name} teilt das Album {title} mit dir', { name: sender.name, title: quoted }) : t('{name} hat dir {title} geschickt', { name: sender.name, title: quoted });
  const paragraphs = [];
  if (note) paragraphs.push(note);
  paragraphs.push(kind === 'album' ? t('Mit dem Knopf öffnest du das Album im Browser.') : t('Mit dem Knopf öffnest du die Datei im Browser.'));
  if (locked) paragraphs.push(t('Sie ist mit einem Passwort geschützt. Frag {name} danach.', { name: sender.name }));
  return {
    subject,
    title: subject,
    paragraphs,
    button: { label: kind === 'album' ? t('Album ansehen') : t('Datei ansehen'), url },
    footer: sender.replyTo
      ? t('Diese E-Mail kam über {site}, weil {name} sie dir geschickt hat. Eine Antwort geht direkt an {name}.', {
          site: settings.get('site.title'),
          name: sender.name,
        })
      : t('Diese E-Mail kam über {site}, weil {name} sie dir geschickt hat.', { site: settings.get('site.title'), name: sender.name }),
    replyTo: sender.replyTo,
    personal: true,
  };
}

async function deliver(user, recipients, details) {
  const sender = await senderOf(user);
  const language = settings.get('site.language');
  const built = message(language, { ...details, sender });
  let sent = 0;
  for (const to of recipients) if (await mail.sendSafely(to, language, built)) sent += 1;
  if (!sent) throw badRequest('Die E-Mail ließ sich nicht verschicken. Prüf die Einstellungen für E-Mails.', { code: 'mail_failed' });
  return sent;
}

async function shareFile(user, record, input = {}) {
  if (!enabled()) throw forbidden('Teilen per E-Mail ist auf diesem Server abgeschaltet.');
  if (isSealedName(record.filename)) {
    throw badRequest('Verschlüsselte Dateien teilst du über den Link mit Schlüssel, nicht per E-Mail.', { code: 'sealed' });
  }
  if (record.blocked_at || record.deleted_at) throw badRequest('Diese Datei lässt sich nicht teilen.');
  const recipients = recipientsOf(input.to);
  const note = noteOf(input.message);
  await budget(user, recipients.length);
  const urls = files.urlsFor(record);
  const sent = await deliver(user, recipients, {
    kind: 'file',
    title: record.title || record.original_name || record.filename,
    note,
    url: urls.view,
    locked: Boolean(record.password_hash),
  });
  return { sent };
}

async function shareAlbum(user, row, input = {}) {
  if (!enabled()) throw forbidden('Teilen per E-Mail ist auf diesem Server abgeschaltet.');
  if (row.visibility === 'private') throw badRequest('Private Alben kannst du nicht per E-Mail teilen.', { code: 'private' });
  if (row.blocked_at) throw badRequest('Dieses Album lässt sich nicht teilen.');
  const recipients = recipientsOf(input.to);
  const note = noteOf(input.message);
  await budget(user, recipients.length);
  const sent = await deliver(user, recipients, {
    kind: 'album',
    title: row.title,
    note,
    url: `${settings.get('site.baseUrl')}/a/${encodeURIComponent(row.code)}`,
    locked: Boolean(row.password_hash),
  });
  return { sent };
}

module.exports = { MAX_RECIPIENTS, enabled, shareFile, shareAlbum };
