'use strict';

const config = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const STYLES = { debug: '36', info: '32', warn: '33', error: '31', bold: '1', accent: '1;35', muted: '2' };

const threshold = LEVELS[config.log.level];
const json = config.log.format === 'json';

const streamFor = (level) => (LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout);
const colored = (stream) => !json && (config.log.color ?? Boolean(stream.isTTY));

const paint = (style, text, stream = process.stdout) => (colored(stream) ? `\x1b[${STYLES[style]}m${text}\x1b[0m` : String(text));

const pad = (value) => String(value).padStart(2, '0');

const timestamp = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const singleLine = (text) =>
  String(text)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();

function formatValue(value) {
  let text = String(value);
  if (Array.isArray(value)) text = value.join(',');
  else if (typeof value === 'object') text = JSON.stringify(value);
  return /^[^\s"=\u0000-\u001f\u007f]+$/.test(text) ? text : JSON.stringify(text);
}

function separate(extra) {
  if (extra instanceof Error) return { fields: {}, error: extra };
  if (!extra || typeof extra !== 'object') return { fields: {}, error: null };
  const { error, ...fields } = extra;
  if (error instanceof Error) return { fields, error };
  return { fields: error === undefined ? fields : { ...fields, error }, error: null };
}

const present = (fields) => Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== '');

function textEntry(level, scope, message, fields, error, stream) {
  const head = [paint('muted', timestamp(new Date()), stream), paint(level, level.toUpperCase().padEnd(5), stream)];
  if (scope) head.push(paint('muted', `[${scope}]`, stream));
  let line = `${head.join(' ')} ${singleLine(message)}`;
  if (error) line += `: ${singleLine(error.message || error.name)}`;
  const pairs = present(fields).map(([key, value]) => `${key}=${formatValue(value)}`);
  if (pairs.length) line += ` ${paint('muted', pairs.join(' '), stream)}`;
  if (error && error.stack && (level === 'error' || threshold === LEVELS.debug)) {
    const frames = error.stack
      .split('\n')
      .filter((frame) => /^\s+at /.test(frame))
      .map((frame) => `    ${frame.trim()}`);
    if (frames.length) line += `\n${paint('muted', frames.join('\n'), stream)}`;
  }
  return `${line}\n`;
}

function jsonEntry(level, scope, message, fields, error) {
  const entry = { time: new Date().toISOString(), level };
  if (scope) entry.scope = scope;
  entry.msg = String(message);
  for (const [key, value] of present(fields)) entry[key] = value;
  if (error) entry.err = { message: error.message, code: error.code, stack: error.stack };
  return `${JSON.stringify(entry)}\n`;
}

const errorListeners = new Set();

function write(level, scope, message, extra, force = false) {
  const { fields, error } = separate(extra);
  if (force || LEVELS[level] >= threshold) {
    const stream = streamFor(level);
    stream.write(json ? jsonEntry(level, scope, message, fields, error) : textEntry(level, scope, message, fields, error, stream));
  }
  if (level !== 'error') return;
  for (const listener of errorListeners) {
    try {
      listener({ scope, message: String(message), fields, error });
    } catch {}
  }
}

function box(title, lines, fields = {}) {
  if (json) return write('info', null, title, fields, true);
  const body = [title, '', ...lines];
  const width = Math.max(...body.map((line) => line.length));
  const border = '─'.repeat(width + 2);
  const framed = [`┌${border}┐`, ...body.map((line) => `│ ${line.padEnd(width)} │`), `└${border}┘`];
  process.stdout.write(`\n${framed.map((line) => paint('accent', line)).join('\n')}\n\n`);
  return undefined;
}

function create(scope = null) {
  const at = (level) => (message, extra) => write(level, scope, message, extra);
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

const root = create();
for (const problem of config.log.problems) root.warn(problem);

module.exports = {
  ...root,
  scope: create,
  box,
  paint,
  enabled: (level) => LEVELS[level] >= threshold,
  onError: (listener) => errorListeners.add(listener),
  level: config.log.level,
  format: config.log.format,
};
