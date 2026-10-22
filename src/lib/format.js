'use strict';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
const TIME_ZONE = 'Europe/Berlin';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(value)} ${UNITS[exponent]}`;
}

const berlinParts = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('de-DE', {
      timeZone: TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

function berlinDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const p = berlinParts(value);
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}

function berlinOffsetMs(utcMs) {
  const p = berlinParts(new Date(utcMs));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return local - Math.floor(utcMs / 1000) * 1000;
}

function parseBerlinDate(value) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value || '').trim());
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match.map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  const first = naive - berlinOffsetMs(naive);
  return naive - berlinOffsetMs(first);
}

function berlinDay(date = new Date()) {
  const p = berlinParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function splitBerlinDate(value) {
  const match = /^(\d{2}\.\d{2}\.\d{4}),?\s+(\d{2}:\d{2})/.exec(String(value || ''));
  return match ? { date: match[1], time: match[2] } : { date: '', time: '' };
}

function greeting(date = new Date()) {
  const hour = Number(berlinParts(date).hour);
  if (hour >= 5 && hour < 12) return 'Guten Morgen';
  if (hour >= 12 && hour < 18) return 'Guten Tag';
  if (hour >= 18 && hour < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

module.exports = { formatBytes, berlinDate, berlinDay, parseBerlinDate, splitBerlinDate, greeting, escapeHtml };
