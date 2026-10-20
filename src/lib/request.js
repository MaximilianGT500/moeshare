'use strict';

const settings = require('../services/settingsService');

function clientIp(req) {
  const ip = String(req.ip || (req.socket && req.socket.remoteAddress) || '');
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

const storedIp = (req) => (settings.get('system.logIps') ? clientIp(req) || null : null);

const isSecure = (req) =>
  Boolean(
    req.secure ||
    String(req.get('x-forwarded-proto') || '')
      .split(',')[0]
      .trim() === 'https'
  );

function deviceLabel(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'Unbekanntes Gerät';
  if (/ShareX/i.test(ua)) return 'ShareX';

  let browser = '';
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/Vivaldi\//.test(ua)) browser = 'Vivaldi';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
  else if (/curl\//i.test(ua)) browser = 'curl';

  let os = '';
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (browser && os) return `${browser} auf ${os}`;
  return browser || os || 'Unbekanntes Gerät';
}

function isSameOrigin(req) {
  const site = req.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function safeNext(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/^\/(login|logout|setup|register)\b/.test(value)) return fallback;
  return value.slice(0, 500);
}

module.exports = { storedIp, isSecure, deviceLabel, isSameOrigin, safeNext };
