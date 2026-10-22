'use strict';

const { badRequest } = require('./errors');

const LAYOUTS = ['standard', 'minimal', 'stage', 'split', 'polaroid', 'magazine'];
const SCHEMES = ['visitor', 'dark', 'light'];
const BACKGROUNDS = ['ambient', 'gradient', 'plain', 'dots'];
const FONTS = ['rounded', 'system', 'serif', 'mono'];
const CORNERS = ['round', 'soft', 'sharp'];
const ELEMENTS = ['header', 'title', 'owner', 'date', 'size', 'resolution', 'views', 'download', 'copy', 'share', 'original', 'footer'];

const MAX_NOTE = 280;
const MAX_LABEL = 40;
const MAX_URL = 300;
const MAX_CSS = 20000;
const MAX_DEPTH = 8;
const ROOT = '.ms-page';

const DEFAULT_DESIGN = Object.freeze({
  layout: 'standard',
  accent: 'auto',
  scheme: 'visitor',
  background: 'ambient',
  font: 'rounded',
  corners: 'round',
  show: Object.freeze(Object.fromEntries(ELEMENTS.map((key) => [key, true]))),
  note: '',
  button: Object.freeze({ label: '', url: '' }),
  css: '',
});

const invalid = (message, field) => badRequest(message, { field });

const pick = (value, allowed, fallback, field) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) throw invalid('Ungültige Auswahl.', field);
  return value;
};

function cleanText(value, field, max, { multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw invalid('Ungültiger Text.', field);
  let text = value.replace(/\r\n?/g, '\n');
  text = multiline ? text.replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ');
  text = text.trim();
  if (text.length > max) throw invalid(`Maximal ${max} Zeichen.`, field);
  return text;
}

function cleanAccent(value) {
  if (value === undefined || value === null || value === '') return 'auto';
  if (value === 'auto' || value === 'site') return value;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim().toLowerCase();
  throw invalid('Bitte eine Farbe als Hex-Wert wie #8b5cf6 wählen.', 'accent');
}

function cleanButton(value) {
  const input = value && typeof value === 'object' ? value : {};
  const label = cleanText(input.label, 'button.label', MAX_LABEL);
  const url = cleanText(input.url, 'button.url', MAX_URL);
  if (!url) return { label: '', url: '' };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid('Bitte eine vollständige Adresse mit https:// eingeben.', 'button.url');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw invalid('Nur http- und https-Adressen sind erlaubt.', 'button.url');
  if (!label) throw invalid('Gib dem Knopf eine Beschriftung.', 'button.label');
  return { label, url: parsed.href };
}

function scan(source) {
  let text = '';
  let masked = '';
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === '\\' && i + 1 < source.length) {
        text += char + source[i + 1];
        masked += '  ';
        i += 1;
        continue;
      }
      if (char === '\n') throw invalid('Eine Zeichenkette ist nicht geschlossen.', 'css');
      text += char;
      masked += char === quote ? char : ' ';
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw invalid('Ein Kommentar ist nicht geschlossen.', 'css');
      text += ' ';
      masked += ' ';
      i = end + 1;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    text += char;
    masked += char;
  }
  if (quote) throw invalid('Eine Zeichenkette ist nicht geschlossen.', 'css');
  return { text, masked };
}

const BLOCKED_FUNCTION =
  /(?:^|[^\w-])(url|image|image-set|-webkit-image-set|cross-fade|-webkit-cross-fade|src|expression|element|-moz-element)\s*\(/i;
const AT_RULE = /@([\w-]*)/g;
const ALLOWED_AT_RULES = new Set(['media', 'supports', 'container']);

function inspect(masked) {
  if (masked.includes('\\')) throw invalid('Rückwärtsschrägstriche sind nur in Zeichenketten erlaubt.', 'css');
  const blocked = BLOCKED_FUNCTION.exec(masked);
  if (blocked) throw invalid(`${blocked[1]}() ist nicht erlaubt. Externe Dateien lädt die Vorschauseite nicht.`, 'css');
  if (/javascript\s*:|-moz-binding|behavior\s*:/i.test(masked)) throw invalid('Diese Anweisung ist nicht erlaubt.', 'css');
  for (const match of masked.matchAll(AT_RULE)) {
    const name = match[1].toLowerCase();
    if (!ALLOWED_AT_RULES.has(name))
      throw invalid(`@${name || '?'} ist nicht erlaubt. Möglich sind @media, @supports und @container.`, 'css');
  }
}

function closing(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw invalid('Eine geschweifte Klammer ist nicht geschlossen.', 'css');
}

function nextBoundary(masked, from, end) {
  let round = 0;
  let square = 0;
  for (let i = from; i < end; i++) {
    const char = masked[i];
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (round <= 0 && square <= 0 && (char === '{' || char === ';' || char === '}')) return i;
  }
  return -1;
}

function splitSelectors(text, masked) {
  const parts = [];
  let round = 0;
  let square = 0;
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    const char = masked[i];
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === ',' && round === 0 && square === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function scopeSelector(raw) {
  let selector = raw.trim().replace(/\s+/g, ' ');
  if (!selector) throw invalid('Ein Selektor ist leer.', 'css');
  if (selector.startsWith('&')) return `${ROOT}${selector.slice(1)}`;
  for (;;) {
    const match = /^(:root|html|body)(?![\w-])/i.exec(selector);
    if (!match) break;
    selector = selector.slice(match[0].length).trim();
  }
  return selector ? `${ROOT} ${selector}` : ROOT;
}

function compileBlock(text, masked, start, end, depth) {
  if (depth > MAX_DEPTH) throw invalid('Die Regeln sind zu tief verschachtelt.', 'css');
  let output = '';
  let i = start;
  while (i < end) {
    if (/\s/.test(masked[i])) {
      i += 1;
      continue;
    }
    if (masked[i] === '}' || masked[i] === ';') {
      if (masked[i] === '}') throw invalid('Hier steht eine schließende Klammer zu viel.', 'css');
      i += 1;
      continue;
    }
    const boundary = nextBoundary(masked, i, end);
    if (boundary < 0 || masked[boundary] !== '{') {
      throw invalid('Außerhalb einer Regel stehen Angaben ohne Selektor. Schreibe sie in einen Block wie & { … }.', 'css');
    }
    const close = closing(masked, boundary);
    if (close >= end) throw invalid('Eine geschweifte Klammer ist nicht geschlossen.', 'css');
    const prelude = text.slice(i, boundary);
    if (masked[i] === '@') {
      output += `${prelude.trim()} {\n${compileBlock(text, masked, boundary + 1, close, depth + 1)}}\n`;
    } else {
      const selectors = splitSelectors(prelude, masked.slice(i, boundary)).map(scopeSelector);
      output += `${selectors.join(', ')} {${text.slice(boundary + 1, close)}}\n`;
    }
    i = close + 1;
  }
  return output;
}

function compileCss(source) {
  if (source === undefined || source === null || source === '') return '';
  if (typeof source !== 'string') throw invalid('Ungültiger Text.', 'css');
  const input = source.replace(/\r\n?/g, '\n');
  if (input.length > MAX_CSS) throw invalid(`Maximal ${MAX_CSS} Zeichen.`, 'css');
  if (input.includes('\u0000')) throw invalid('Ungültige Zeichen im CSS.', 'css');
  const { text, masked } = scan(input);
  inspect(masked);
  let depth = 0;
  for (const char of masked) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth < 0) throw invalid('Hier steht eine schließende Klammer zu viel.', 'css');
  }
  if (depth !== 0) throw invalid('Eine geschweifte Klammer ist nicht geschlossen.', 'css');
  return compileBlock(text, masked, 0, text.length, 0).trim();
}

const compiled = new Map();

function compiledCss(source) {
  if (!source) return '';
  if (compiled.has(source)) return compiled.get(source);
  let result = '';
  try {
    result = compileCss(source);
  } catch {
    result = '';
  }
  if (compiled.size > 200) compiled.clear();
  compiled.set(source, result);
  return result;
}

function normalizeDesign(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Ungültiges Design.', 'design');
  const show = {};
  const shown = input.show && typeof input.show === 'object' ? input.show : {};
  for (const key of ELEMENTS) {
    const value = shown[key];
    if (value !== undefined && typeof value !== 'boolean') throw invalid('Erwartet wird an oder aus.', `show.${key}`);
    show[key] = value === undefined ? true : value;
  }
  const css = input.css === undefined || input.css === null ? '' : input.css;
  if (typeof css !== 'string') throw invalid('Ungültiger Text.', 'css');
  const trimmed = css.replace(/\r\n?/g, '\n').trim();
  compileCss(trimmed);
  return {
    layout: pick(input.layout, LAYOUTS, DEFAULT_DESIGN.layout, 'layout'),
    accent: cleanAccent(input.accent),
    scheme: pick(input.scheme, SCHEMES, DEFAULT_DESIGN.scheme, 'scheme'),
    background: pick(input.background, BACKGROUNDS, DEFAULT_DESIGN.background, 'background'),
    font: pick(input.font, FONTS, DEFAULT_DESIGN.font, 'font'),
    corners: pick(input.corners, CORNERS, DEFAULT_DESIGN.corners, 'corners'),
    show,
    note: cleanText(input.note, 'note', MAX_NOTE, { multiline: true }),
    button: cleanButton(input.button),
    css: trimmed,
  };
}

function parseDesign(raw) {
  if (!raw) return null;
  try {
    return normalizeDesign(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

module.exports = {
  LAYOUTS,
  SCHEMES,
  BACKGROUNDS,
  FONTS,
  CORNERS,
  ELEMENTS,
  DEFAULT_DESIGN,
  MAX_CSS,
  normalizeDesign,
  parseDesign,
  compileCss,
  compiledCss,
};
