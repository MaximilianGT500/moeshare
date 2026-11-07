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
const avatars = require('../services/avatarService');
const legalService = require('../services/legalService');
const appIcon = require('../lib/appIcon');

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
      user: req.user ? { username: req.user.username, avatar: avatars.urlFor(req.user) } : null,
      registration: settings.get('auth.registration') === 'open',
    },
  });
});

for (const { key, label, path } of LEGAL_PAGES) {
  router.get(path, (req, res, next) => {
    const domain = req.customDomain;
    if (domain && domain.legal) {
      const external = legalService.pageUrl(key, domain.legal);
      if (external) return res.redirect(external);
      const own = legalService.pageText(key, domain.legal, req.language === 'en' ? 'en' : 'de');
      if (!own) return next();
      return renderPage(res, {
        page: 'legal',
        title: label,
        data: { legal: { title: tr(req, label), text: own, heading: domain.domain } },
      });
    }
    if (domain) {
      const fallback =
        settings.get(`legal.${key}Url`) || (settings.get(`legal.${key}Text`) ? `${settings.get('site.baseUrl')}${path}` : null);
      if (fallback) return res.redirect(/^https?:\/\//.test(fallback) ? fallback : `${settings.get('site.baseUrl')}${fallback}`);
      return next();
    }
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

router.get('/favicon.svg', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/svg+xml').send(appIcon.SVG);
});

router.post('/api/language', sameOriginOnly, async (req, res) => {
  const language = req.body && req.body.language;
  if (!['de', 'en'].includes(language)) throw badRequest('Diese Sprache gibt es nicht.');
  res.cookie('ms_lang', language, { path: '/', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000 });
  if (req.user) await preferences.update(req.user.id, { language });
  res.json({ ok: true, language });
});

router.get('/healthz', (req, res) =>
  res.json({
    status: 'ok',
    ...(settings.get('site.showVersion') ? { version: config.version } : {}),
    uptime: Math.round(process.uptime()),
  })
);

module.exports = router;
