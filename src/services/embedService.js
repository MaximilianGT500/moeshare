'use strict';

const crypto = require('crypto');
const db = require('../lib/db');
const i18n = require('../lib/i18n');
const tpl = require('../lib/embedTemplate');
const { escapeHtml, formatBytes, splitBerlinDate } = require('../lib/format');
const { displayPath } = require('../lib/slugs');
const { extensionOf } = require('../lib/storage');
const { isCrawler } = require('../lib/crawlers');
const settings = require('./settingsService');
const files = require('./fileService');
const storage = require('./storageService');

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
    settings.get('site.title'),
    settings.get('site.language')
  );
}

const ENGLISH_DESCRIPTION = '{size}, uploaded on {date}';

function localized(template) {
  if (settings.get('site.language') !== 'en' || template.description !== tpl.DEFAULT_TEMPLATE.description) return template;
  return { ...template, description: ENGLISH_DESCRIPTION };
}

const meaningfulColor = (hex) => (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) && hex.toLowerCase() !== '#ffffff' ? hex : null);

function colorFor(template, record) {
  if (template.color.mode === 'random') return `#${crypto.randomBytes(3).toString('hex')}`;
  if (template.color.mode === 'dominant') return meaningfulColor(record.dominant_color) || template.color.value;
  return template.color.value;
}

async function embedFor(record) {
  const template = await templateFor(record.username);
  return { ...tpl.render(localized(template), valuesForRecord(record)), themeColor: colorFor(template, record) };
}

function lockedTags(record, urls, locale) {
  const tag = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  const title = i18n.translate(settings.get('site.language'), record.password_hash ? 'Geschützte Datei' : 'Datei zum einmaligen Abruf');
  return [
    tag('property', 'og:url', urls.view),
    tag('property', 'og:locale', locale),
    tag('property', 'og:type', 'website'),
    tag('property', 'og:title', title),
    tag('property', 'og:site_name', settings.get('site.title')),
    tag('name', 'robots', 'noindex'),
  ].join('\n  ');
}

function metaTags(record, embed, { domain = null, locale = 'de_DE' } = {}) {
  const { type } = files.typeOf(record.filename, record.syntax);
  const ext = extensionOf(record.filename);
  const urls = files.urlsFor(record, { domain });
  if (record.password_hash || record.max_views) return lockedTags(record, urls, locale);
  const width = record.resolution_width || 0;
  const height = record.resolution_height || 0;
  const tag = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  const tags = [tag('property', 'og:url', urls.view), tag('property', 'og:locale', locale)];

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
    if (storage.hasVariant(record, 'poster')) tags.push(tag('property', 'og:image', urls.preview));
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
    const oembed = `${domain || settings.get('site.baseUrl')}/oembed/${displayPath(record.slug || record.filename)}`;
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

async function userTemplate(userId) {
  const row = await db.get('SELECT embed FROM users WHERE id = ?', [userId]);
  return parseTemplate(row && row.embed);
}

async function setUserTemplate(userId, template) {
  const value = template === null ? null : JSON.stringify(tpl.normalizeTemplate(template));
  await db.run('UPDATE users SET embed = ? WHERE id = ?', [value, userId]);
}

async function builderData(user) {
  const [own, recent] = await Promise.all([userTemplate(user.id), files.listForUser(user.username, { page: 1, limit: 12 })]);
  return {
    own,
    defaultTemplate: localized(settings.get('embed.default')),
    builtinTemplate: tpl.DEFAULT_TEMPLATE,
    allowCustom: settings.get('embed.allowUserTemplates'),
    samples: recent.files,
    siteTitle: settings.get('site.title'),
    dominantColors: settings.get('uploads.dominantColor'),
  };
}

module.exports = { embedFor, metaTags, oembedFor, isCrawler, userTemplate, setUserTemplate, localized, builderData };
