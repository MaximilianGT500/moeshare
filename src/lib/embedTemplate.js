'use strict';

const { badRequest } = require('./errors');

const LIMITS = {
  siteName: 256,
  author: 256,
  title: 256,
  description: 350,
  url: 512,
};

const COLOR_MODES = ['dominant', 'fixed', 'random'];

const DEFAULT_TEMPLATE = Object.freeze({
  enabled: true,
  siteName: '{seite}',
  siteUrl: '',
  author: '{nutzer}',
  authorUrl: '',
  title: '{dateiname}',
  description: '{größe}, hochgeladen am {datum}',
  color: Object.freeze({ mode: 'dominant', value: '#8b5cf6' }),
  largeImage: true,
});

const PLACEHOLDERS = {
  dateiname: 'filename',
  name: 'name',
  endung: 'extension',
  größe: 'size',
  groesse: 'size',
  datum: 'date',
  uhrzeit: 'time',
  nutzer: 'user',
  aufrufe: 'views',
  auflösung: 'resolution',
  aufloesung: 'resolution',
  breite: 'width',
  höhe: 'height',
  hoehe: 'height',
  typ: 'type',
  seite: 'site',
  filename: 'filename',
  size: 'size',
  date: 'date',
  time: 'time',
  user: 'user',
  username: 'user',
  views: 'views',
  resolution: 'resolution',
  width: 'width',
  height: 'height',
  type: 'type',
  site: 'site',
};

const invalid = (message, field) => badRequest(message, { field });

const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function cleanText(value, field, max, { multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw invalid('Ungültiger Text.', field);
  let text = value.replace(/\r\n?/g, '\n');
  text = multiline ? text.replace(/\n{3,}/g, '\n\n') : text.replace(/\n+/g, ' ');
  text = text.trim();
  if (text.length > max) throw invalid(`Maximal ${max} Zeichen.`, field);
  return text;
}

function cleanUrl(value, field) {
  const text = cleanText(value, field, LIMITS.url);
  if (!text) return '';
  const probe = text.replace(/\{[^}]{1,20}\}/g, 'x');
  let parsed;
  try {
    parsed = new URL(probe);
  } catch {
    throw invalid('Bitte eine vollständige Adresse mit https:// eingeben.', field);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw invalid('Nur http- und https-Adressen sind erlaubt.', field);
  }
  return text;
}

function normalizeTemplate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('Ungültige Embed-Vorlage.', 'embed');
  }
  const color = input.color && typeof input.color === 'object' ? input.color : DEFAULT_TEMPLATE.color;
  const mode = COLOR_MODES.includes(color.mode) ? color.mode : 'dominant';
  if (color.value !== undefined && !isHex(color.value)) {
    throw invalid('Die Farbe muss als Hex-Wert wie #8b5cf6 angegeben werden.', 'color');
  }

  const pick = (key) => (input[key] === undefined ? DEFAULT_TEMPLATE[key] : input[key]);
  return {
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
    siteName: cleanText(pick('siteName'), 'siteName', LIMITS.siteName),
    siteUrl: cleanUrl(pick('siteUrl'), 'siteUrl'),
    author: cleanText(pick('author'), 'author', LIMITS.author),
    authorUrl: cleanUrl(pick('authorUrl'), 'authorUrl'),
    title: cleanText(pick('title'), 'title', LIMITS.title),
    description: cleanText(pick('description'), 'description', LIMITS.description, { multiline: true }),
    color: { mode, value: isHex(color.value) ? color.value.toLowerCase() : DEFAULT_TEMPLATE.color.value },
    largeImage: input.largeImage === undefined ? true : Boolean(input.largeImage),
  };
}

function fill(text, values) {
  if (!text) return '';
  return text.replace(/\{([^{}\s]{1,20})\}/g, (match, name) => {
    const key = PLACEHOLDERS[name.toLowerCase()];
    if (!key) return match;
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

const TYPE_LABELS = {
  de: { image: 'Bild', video: 'Video', audio: 'Audio', text: 'Text', file: 'Datei' },
  en: { image: 'Image', video: 'Video', audio: 'Audio', text: 'Text', file: 'File' },
};

function valuesFor(file, siteTitle, language = 'de') {
  const labels = TYPE_LABELS[language] || TYPE_LABELS.de;
  const dot = file.filename.lastIndexOf('.');
  const hasResolution = file.width > 0 && file.height > 0;
  return {
    filename: file.filename,
    name: dot > 0 ? file.filename.slice(0, dot) : file.filename,
    extension: dot > 0 ? file.filename.slice(dot + 1).toLowerCase() : '',
    size: file.sizeText,
    date: file.dateText,
    time: file.timeText,
    user: file.username,
    views: file.views,
    resolution: hasResolution ? `${file.width}×${file.height}` : '',
    width: hasResolution ? file.width : '',
    height: hasResolution ? file.height : '',
    type: labels[file.type] || labels.file,
    site: siteTitle,
  };
}

function render(template, values) {
  const t = normalizeTemplate(template);
  return {
    enabled: t.enabled,
    siteName: fill(t.siteName, values).slice(0, LIMITS.siteName),
    siteUrl: fill(t.siteUrl, values),
    author: fill(t.author, values).slice(0, LIMITS.author),
    authorUrl: fill(t.authorUrl, values),
    title: fill(t.title, values).slice(0, LIMITS.title),
    description: fill(t.description, values).slice(0, LIMITS.description),
    color: t.color,
    largeImage: t.largeImage,
  };
}

module.exports = { DEFAULT_TEMPLATE, normalizeTemplate, render, valuesFor };
