'use strict';

const crypto = require('crypto');
const fs = require('fs');
const db = require('../lib/db');
const tpl = require('../lib/embedTemplate');
const { escapeHtml, formatBytes, splitBerlinDate } = require('../lib/format');
const { extensionOf, filePaths } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');

const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
};

const CRAWLERS = /Discordbot|TelegramBot|Twitterbot|WhatsApp|Slackbot/i;

function parseTemplate(raw) {
  if (!raw) return null;
  try {
    return tpl.normalizeTemplate(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function templateFor(username) {
  if (settings.get('embed.allowUserTemplates')) {
    const row = await db.get('SELECT embed FROM users WHERE username = ?', [username]);
    const own = parseTemplate(row && row.embed);
    if (own) return own;
  }
  return settings.get('embed.default');
}

function valuesForRecord(record) {
  const { date, time } = splitBerlinDate(record.creation_date);
  return tpl.valuesFor(
    {
      filename: record.filename,
      sizeText: formatBytes(record.size_bytes || 0),
      dateText: date,
      timeText: time,
      username: record.username,
      views: record.views || 0,
      width: record.resolution_width || 0,
      height: record.resolution_height || 0,
      type: files.typeOf(record.filename).type,
    },
    settings.get('site.title')
  );
}

const meaningfulColor = (hex) => (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) && hex.toLowerCase() !== '#ffffff' ? hex : null);

function colorFor(template, record) {
  if (template.color.mode === 'random') return `#${crypto.randomBytes(3).toString('hex')}`;
  if (template.color.mode === 'dominant') return meaningfulColor(record.dominant_color) || template.color.value;
  return template.color.value;
}

async function embedFor(record) {
  const template = await templateFor(record.username);
  return { ...tpl.render(template, valuesForRecord(record)), themeColor: colorFor(template, record) };
}

function metaTags(record, embed) {
  const { type } = files.typeOf(record.filename);
  const ext = extensionOf(record.filename);
  const urls = files.urlsFor(record.username, record.filename);
  const width = record.resolution_width || 0;
  const height = record.resolution_height || 0;
  const tag = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  const tags = [tag('property', 'og:url', urls.view), tag('property', 'og:locale', 'de_DE')];

  if (embed.enabled) {
    if (embed.siteName) tags.push(tag('property', 'og:site_name', embed.siteName));
    if (embed.title) tags.push(tag('property', 'og:title', embed.title));
    if (embed.description) tags.push(tag('property', 'og:description', embed.description));
  }
  tags.push(tag('name', 'theme-color', embed.themeColor));

  if (type === 'image') {
    tags.push(tag('property', 'og:type', 'website'), tag('property', 'og:image', urls.direct), tag('name', 'twitter:image', urls.direct));
    if (width && height) tags.push(tag('property', 'og:image:width', width), tag('property', 'og:image:height', height));
    tags.push(tag('name', 'twitter:card', embed.largeImage ? 'summary_large_image' : 'summary'));
  } else if (type === 'video') {
    tags.push(
      tag('property', 'og:type', 'video.other'),
      tag('property', 'og:video', urls.direct),
      tag('property', 'og:video:url', urls.direct),
      tag('property', 'og:video:type', MIME[ext] || 'video/mp4')
    );
    if (urls.direct.startsWith('https://')) tags.push(tag('property', 'og:video:secure_url', urls.direct));
    if (width && height) tags.push(tag('property', 'og:video:width', width), tag('property', 'og:video:height', height));
    if (fs.existsSync(filePaths(record.username, record.filename).poster)) tags.push(tag('property', 'og:image', urls.preview));
  } else if (type === 'audio') {
    tags.push(
      tag('property', 'og:type', 'music.song'),
      tag('property', 'og:audio', urls.direct),
      tag('property', 'og:audio:type', MIME[ext] || 'audio/mpeg')
    );
  } else {
    tags.push(tag('property', 'og:type', 'website'));
  }

  if (embed.enabled && (embed.author || embed.siteName)) {
    const oembed = `${settings.get('site.baseUrl')}/oembed/${record.filename}`;
    tags.push(`<link rel="alternate" type="application/json+oembed" href="${escapeHtml(oembed)}" title="oEmbed" />`);
  }
  return tags.join('\n  ');
}

function oembedFor(embed) {
  const doc = { version: '1.0', type: 'link' };
  if (!embed.enabled) return doc;
  if (embed.title) doc.title = embed.title;
  if (embed.author) doc.author_name = embed.author;
  if (embed.authorUrl) doc.author_url = embed.authorUrl;
  if (embed.siteName) doc.provider_name = embed.siteName;
  if (embed.siteUrl) doc.provider_url = embed.siteUrl;
  return doc;
}

const isCrawler = (userAgent) => CRAWLERS.test(String(userAgent || ''));

async function userTemplate(userId) {
  const row = await db.get('SELECT embed FROM users WHERE id = ?', [userId]);
  return parseTemplate(row && row.embed);
}

async function setUserTemplate(userId, template) {
  const value = template === null ? null : JSON.stringify(tpl.normalizeTemplate(template));
  await db.run('UPDATE users SET embed = ? WHERE id = ?', [value, userId]);
}

module.exports = { embedFor, metaTags, oembedFor, isCrawler, userTemplate, setUserTemplate };
