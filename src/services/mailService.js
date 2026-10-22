'use strict';

const nodemailer = require('nodemailer');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { escapeHtml } = require('../lib/format');
const { translate } = require('../lib/i18n');
const settings = require('./settingsService');
const { languageOf, notifyOf } = require('./preferenceService');

const log = logger.scope('mail');

let transport = null;
let transportKey = null;

const ready = () => Boolean(settings.get('mail.enabled') && settings.get('mail.host') && settings.get('mail.from'));

function transportOptions() {
  const security = settings.get('mail.security');
  const username = settings.get('mail.username');
  return {
    host: settings.get('mail.host'),
    port: settings.get('mail.port'),
    secure: security === 'tls',
    requireTLS: security === 'starttls',
    ignoreTLS: security === 'none',
    auth: username ? { user: username, pass: settings.get('mail.password') } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  };
}

function transporter() {
  const options = transportOptions();
  const key = JSON.stringify(options);
  if (transport && key === transportKey) return transport;
  if (transport) transport.close();
  transport = nodemailer.createTransport(options);
  transportKey = key;
  return transport;
}

const sender = () => ({ name: settings.get('mail.fromName') || settings.get('site.title'), address: settings.get('mail.from') });

function readableOn(hex) {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1d1a23' : '#ffffff';
}

function render(language, { subject, title, paragraphs = [], button = null, footer = '' }) {
  const t = (text, params) => translate(language, text, params);
  const site = settings.get('site.title');
  const accent = settings.get('site.uiColor');
  const body = paragraphs.map((text) => `<p style="margin:0 0 12px">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`).join('');
  const action = button
    ? `<tr><td style="padding-top:12px"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:${accent};color:${readableOn(accent)};text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px">${escapeHtml(button.label)}</a></td></tr>
<tr><td style="padding-top:16px;font-size:12px;line-height:1.5;color:#6f6878;word-break:break-all">${escapeHtml(t('Falls der Knopf nicht funktioniert, öffne diese Adresse:'))}<br><a href="${escapeHtml(button.url)}" style="color:#6f6878">${escapeHtml(button.url)}</a></td></tr>`
    : '';
  const note = footer
    ? `<tr><td style="padding-top:28px;font-size:12px;line-height:1.5;color:#8a8392">${escapeHtml(footer)}</td></tr>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="${language === 'en' ? 'en' : 'de'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1a23">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1f6;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;padding:32px 28px">
<tr><td style="font-size:14px;font-weight:700;color:${accent}">${escapeHtml(site)}</td></tr>
<tr><td style="padding-top:14px;font-size:22px;font-weight:700;line-height:1.3">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:14px;font-size:15px;line-height:1.6;color:#3d3846">${body}</td></tr>
${action}
${note}
</table></td></tr></table></body></html>`;
  const text = [
    title,
    '',
    ...paragraphs,
    ...(button ? ['', `${button.label}: ${button.url}`] : []),
    ...(footer ? ['', footer] : []),
    '',
    `-- ${site}`,
  ].join('\n');
  return { html, text };
}

async function send(to, language, message) {
  if (!ready()) return false;
  const { html, text } = render(language, message);
  await transporter().sendMail({
    from: sender(),
    to,
    subject: message.subject,
    html,
    text,
    headers: { 'Auto-Submitted': 'auto-generated' },
  });
  log.debug('E-Mail verschickt', { to: to.replace(/^(.).*(@.*)$/, '$1…$2'), subject: message.subject });
  return true;
}

async function sendSafely(to, language, message) {
  try {
    return await send(to, language, message);
  } catch (error) {
    log.warn('E-Mail konnte nicht verschickt werden', { error });
    return false;
  }
}

const languageFor = (row) => languageOf(row && row.preferences) || settings.get('site.language');

async function notifyUser(userId, category, build) {
  if (!ready()) return false;
  const row = await db.get('SELECT username, email, email_verified_at, preferences, status FROM users WHERE id = ?', [userId]);
  if (!row || !row.email || !row.email_verified_at || row.status !== 'active') return false;
  if (!notifyOf(row.preferences)[category]) return false;
  const language = languageFor(row);
  return sendSafely(row.email, language, build(language, row));
}

async function notifyAdmins(category, build) {
  if (!ready()) return 0;
  const rows = await db.all(
    "SELECT id, username, email, email_verified_at, preferences FROM users WHERE role = 'admin' AND status = 'active' AND email IS NOT NULL AND email_verified_at IS NOT NULL"
  );
  let sent = 0;
  for (const row of rows) {
    if (!notifyOf(row.preferences)[category]) continue;
    const language = languageFor(row);
    if (await sendSafely(row.email, language, build(language, row))) sent += 1;
  }
  return sent;
}

async function test(to, language) {
  if (!settings.get('mail.host') || !settings.get('mail.from')) throw new Error('Trage zuerst Mailserver und Absenderadresse ein.');
  const t = (text, params) => translate(language, text, params);
  const { html, text } = render(language, {
    subject: t('Testnachricht von {site}', { site: settings.get('site.title') }),
    title: t('Der E-Mail-Versand funktioniert'),
    paragraphs: [
      t('Diese Nachricht kommt von {site}. Wenn du sie liest, sind die SMTP-Einstellungen richtig.', { site: settings.get('site.title') }),
    ],
  });
  const started = Date.now();
  await transporter().sendMail({
    from: sender(),
    to,
    subject: t('Testnachricht von {site}', { site: settings.get('site.title') }),
    html,
    text,
  });
  return { ms: Date.now() - started };
}

function onSettings(keys) {
  if (keys.some((key) => key.startsWith('mail.')) && transport) {
    transport.close();
    transport = null;
    transportKey = null;
  }
}

settings.onChange(onSettings);

module.exports = { ready, send, sendSafely, render, notifyUser, notifyAdmins, languageFor, test };
