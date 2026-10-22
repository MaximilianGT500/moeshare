'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LANGUAGES = ['de', 'en'];
const DIRECTORY = path.join(__dirname, '..', 'i18n');
const FILE = path.join(DIRECTORY, 'server', 'en.json');
const CLIENT_FILE = path.join(DIRECTORY, 'client', 'en.json');

let english = null;
let patterns = null;
let clientBundle = null;

function dictionary() {
  if (!english) {
    try {
      english = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      english = {};
    }
  }
  return english;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compiled() {
  if (!patterns) {
    patterns = Object.entries(dictionary())
      .filter(([key]) => /\{\w+\}/.test(key))
      .map(([key, value]) => {
        const names = [];
        const source = key
          .split(/(\{\w+\})/)
          .map((part) => {
            const match = /^\{(\w+)\}$/.exec(part);
            if (!match) return escape(part);
            names.push(match[1]);
            return '([\\s\\S]+?)';
          })
          .join('');
        return { regex: new RegExp(`^${source}$`), names, value };
      })
      .sort((a, b) => b.regex.source.length - a.regex.source.length);
  }
  return patterns;
}

const GERMAN_SIZE = /^\d{1,3}(?:\.\d{3})*(?:,\d+)? (?:B|KB|MB|GB|TB|PB)$/;

const swapSeparators = (value) => value.replace(/[.,]/g, (mark) => (mark === '.' ? ',' : '.'));

const fill = (template, params) =>
  params ? String(template).replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match)) : template;

function translate(language, text, params) {
  if (typeof text !== 'string' || !text) return text;
  if (language !== 'en') return fill(text, params);
  const direct = dictionary()[text];
  if (direct !== undefined) return fill(direct, params);
  if (params) return fill(text, params);
  for (const pattern of compiled()) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    return pattern.value.replace(/\{(\w+)\}/g, (all, name) => {
      const index = pattern.names.indexOf(name);
      if (index < 0) return all;
      const value = match[index + 1];
      return GERMAN_SIZE.test(value) ? swapSeparators(value) : translate(language, value);
    });
  }
  return text;
}

function fromHeader(header) {
  const ranked = String(header || '')
    .split(',')
    .map((part, index) => {
      const [tag, ...rest] = part.trim().toLowerCase().split(';');
      const q = rest.map((item) => /^q=([\d.]+)$/.exec(item.trim())).find(Boolean);
      return { code: tag.slice(0, 2), q: q ? Number(q[1]) : 1, index };
    })
    .filter((entry) => LANGUAGES.includes(entry.code) && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.length ? ranked[0].code : null;
}

function detect(req, settings) {
  if (req.user && LANGUAGES.includes(req.user.language)) return req.user.language;
  const cookie = req.cookies && req.cookies.ms_lang;
  if (LANGUAGES.includes(cookie)) return cookie;
  if (settings.get('site.detectLanguage')) {
    const header = fromHeader(req.get('accept-language'));
    if (header) return header;
  }
  return settings.get('site.language');
}

function clientScript(language) {
  if (language !== 'en') return null;
  if (!clientBundle) {
    let messages = {};
    try {
      messages = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8'));
    } catch {}
    const body = `window.__MOESHARE_MESSAGES__ = ${JSON.stringify(messages)};\n`;
    clientBundle = { body, version: crypto.createHash('sha256').update(body).digest('hex').slice(0, 12) };
  }
  return clientBundle;
}

const clientScriptUrl = (language) => {
  const script = clientScript(language);
  return script ? `/i18n/${language}.js?v=${script.version}` : null;
};

const tr = (req, text, params) => translate(req && req.language, text, params);

module.exports = { LANGUAGES, translate, tr, detect, fromHeader, clientScript, clientScriptUrl };
