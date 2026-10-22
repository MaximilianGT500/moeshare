'use strict';

const express = require('express');
const { tr } = require('../lib/i18n');
const config = require('../config');
const { badRequest, notFound } = require('../lib/errors');
const { sameOriginOnly } = require('../middleware/auth');
const preferences = require('../services/preferenceService');
const { escapeHtml } = require('../lib/format');
const { renderPage, LEGAL_PAGES } = require('../lib/render');
const settings = require('../services/settingsService');
const setup = require('../services/setupService');
const home = require('../services/homeService');

const router = express.Router();

router.get('/', async (req, res) => {
  if (await setup.isOpen()) return res.redirect('/setup');
  if (!settings.get('home.enabled')) {
    return res.redirect(settings.get('site.redirectUrl') || (req.user ? '/dashboard' : '/login'));
  }
  const meta = (key, value) => `<meta ${key} content="${escapeHtml(value)}" />`;
  const text = tr(req, settings.get('home.text'));
  const head = [
    meta('property="og:title"', settings.get('home.headline') || settings.get('site.title')),
    text && meta('property="og:description"', text),
    text && meta('name="description"', text),
    meta('property="og:type"', 'website'),
    meta('property="og:locale"', req.language === 'en' ? 'en_GB' : 'de_DE'),
    meta('name="theme-color"', settings.get('site.uiColor')),
  ].filter(Boolean);
  return renderPage(res, {
    page: 'home',
    head: head.join('\n  '),
    data: {
      home: { ...home.options(), text },
      stats: await home.publicStats(),
      user: req.user ? { username: req.user.username } : null,
      registration: settings.get('auth.registration') === 'open',
    },
  });
});

for (const { key, label, path } of LEGAL_PAGES) {
  router.get(path, (req, res, next) => {
    const text = settings.get(`legal.${key}Text`);
    const url = settings.get(`legal.${key}Url`);
    if (url && url !== path) return res.redirect(url);
    if (!text) return next();
    return renderPage(res, { page: 'legal', title: label, data: { legal: { title: tr(req, label), text } } });
  });
}

router.get('/api/home', async (req, res) => {
  if (!settings.get('home.enabled')) throw notFound('Die Startseite ist abgeschaltet.');
  res.json(await home.publicStats());
});

function readableOn(hex) {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1d1a23' : '#ffffff';
}

router.get('/favicon.svg', (req, res) => {
  const color = settings.get('site.uiColor');
  const letter = escapeHtml(settings.get('site.title').trim().charAt(0).toUpperCase() || 'M');
  res.set('Cache-Control', 'public, max-age=300');
  res
    .type('image/svg+xml')
    .send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${color}"/>` +
        `<text x="32" y="43" font-family="system-ui, sans-serif" font-size="32" font-weight="800" text-anchor="middle" fill="${readableOn(color)}">${letter}</text></svg>`
    );
});

router.post('/api/language', sameOriginOnly, async (req, res) => {
  const language = req.body && req.body.language;
  if (!['de', 'en'].includes(language)) throw badRequest('Diese Sprache gibt es nicht.');
  res.cookie('ms_lang', language, { path: '/', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000 });
  if (req.user) await preferences.update(req.user.id, { language });
  res.json({ ok: true, language });
});

router.get('/healthz', (req, res) => res.json({ status: 'ok', version: config.version, uptime: Math.round(process.uptime()) }));

module.exports = router;
