'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const config = require('../config');
const logger = require('../lib/logger');
const { client: safeHttp } = require('../lib/safeFetch');
const settings = require('../services/settingsService');
const i18n = require('../lib/i18n');
const { escapeHtml } = require('../lib/format');

const router = express.Router();
const log = logger.scope('pwa');

const ICON_DIR = path.join(config.paths.public, 'icons');
const VARIANTS = {
  'icon-192.png': { size: 192 },
  'icon-512.png': { size: 512 },
  'maskable-512.png': { size: 512, maskable: true },
  'apple-touch-icon.png': { size: 180, maskable: true },
};
const BACKGROUND = '#2b2235';
const cache = new Map();

const customFavicon = () => {
  const favicon = settings.get('site.favicon');
  return favicon && favicon !== '/favicon.svg' ? favicon : null;
};

async function sourceImage(favicon) {
  if (favicon.startsWith('/')) {
    const file = path.normalize(path.join(config.paths.public, favicon));
    if (!file.startsWith(config.paths.public + path.sep) || !fs.existsSync(file)) return null;
    return fs.promises.readFile(file);
  }
  const response = await safeHttp({
    method: 'get',
    url: favicon,
    responseType: 'arraybuffer',
    timeout: 5000,
    maxContentLength: 5 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

async function renderIcon(name) {
  const favicon = customFavicon();
  const variant = VARIANTS[name];
  if (!favicon) return fs.promises.readFile(path.join(ICON_DIR, name));
  const key = `${favicon}|${name}|${settings.get('site.uiColor')}`;
  if (cache.has(key)) return cache.get(key);
  let output;
  try {
    const input = await sourceImage(favicon);
    if (!input) throw new Error('Das Logo wurde nicht gefunden.');
    const inner = Math.round(variant.size * (variant.maskable ? 0.78 : 1));
    const logo = await sharp(input, { density: 300 })
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    output = variant.maskable
      ? await sharp({ create: { width: variant.size, height: variant.size, channels: 4, background: BACKGROUND } })
          .composite([{ input: logo, gravity: 'centre' }])
          .png()
          .toBuffer()
      : logo;
  } catch (error) {
    log.debug('App-Symbol aus dem Logo nicht möglich, nutze das Standardsymbol', { error });
    output = await fs.promises.readFile(path.join(ICON_DIR, name));
  }
  if (cache.size > 40) cache.clear();
  cache.set(key, output);
  return output;
}

router.get('/icons/:name', async (req, res, next) => {
  if (!VARIANTS[req.params.name]) return next();
  res.set('Cache-Control', 'public, max-age=3600');
  return res.type('image/png').send(await renderIcon(req.params.name));
});

router.get('/manifest.webmanifest', (req, res, next) => {
  if (!settings.get('site.pwa')) return next();
  const title = settings.get('site.title');
  const language = settings.get('site.language');
  const english = language === 'en';
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(
    JSON.stringify({
      id: '/',
      name: title,
      short_name: title.length > 12 ? title.slice(0, 12) : title,
      description: english ? 'Share screenshots, videos and files.' : 'Screenshots, Videos und Dateien teilen.',
      lang: language,
      start_url: '/dashboard?quelle=app',
      scope: '/',
      display: 'standalone',
      background_color: '#15121b',
      theme_color: settings.get('site.uiColor'),
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        {
          name: english ? 'Upload' : 'Hochladen',
          url: '/dashboard?aktion=hochladen',
          icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
        },
        {
          name: english ? 'New text' : 'Neuer Text',
          url: '/dashboard?aktion=text',
          icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
        },
        {
          name: english ? 'Shorten link' : 'Link kürzen',
          url: '/dashboard?aktion=link',
          icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
        },
      ],
      share_target: {
        action: '/share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: {
          title: 'title',
          text: 'text',
          url: 'url',
          files: [{ name: 'files', accept: ['image/*', 'video/*', 'audio/*', 'text/*', 'application/pdf', '*/*'] }],
        },
      },
    })
  );
  return undefined;
});

const offlinePage = (language) =>
  `<!DOCTYPE html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>` +
  '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15121b;color:#e7e0ed;font-family:system-ui,sans-serif;padding:24px;text-align:center}</style></head>' +
  `<body><main><h1>${escapeHtml(i18n.translate(language, 'Keine Verbindung'))}</h1><p>${escapeHtml(i18n.translate(language, 'Sobald du wieder online bist, geht es weiter.'))}</p></main></body></html>`;

const workerLanguage = (req) => {
  const match = /(?:^|;\s*)ms_lang=(de|en)(?:;|$)/.exec(req.get('cookie') || '');
  return match ? match[1] : i18n.detect(req, settings);
};

const serviceWorker = (language) => `'use strict';
const SHARE_CACHE = 'moeshare-share';
const OFFLINE = ${JSON.stringify(offlinePage(language))};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function storeShare(request) {
  const data = await request.formData();
  const cache = await caches.open(SHARE_CACHE);
  for (const key of await cache.keys()) await cache.delete(key);
  let index = 0;
  for (const file of data.getAll('files')) {
    if (!file || typeof file === 'string' || !file.size) continue;
    await cache.put('/__share/file/' + index, new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream', 'x-name': encodeURIComponent(file.name || 'datei') } }));
    index += 1;
  }
  const text = ['title', 'text', 'url'].map((name) => data.get(name)).filter((value) => typeof value === 'string' && value.trim()).join('\\n');
  if (text) await cache.put('/__share/text', new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
  return Response.redirect('/dashboard?teilen=1', 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(storeShare(event.request).catch(() => Response.redirect('/dashboard?teilen=fehler', 303)));
    return;
  }
  if (event.request.mode === 'navigate' && event.request.method === 'GET') {
    event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
  }
});
`;

router.get('/sw.js', (req, res) => {
  if (!settings.get('site.pwa')) {
    res.set('Cache-Control', 'no-cache');
    return res
      .type('application/javascript')
      .send(
        "self.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', () => self.registration.unregister());\n"
      );
  }
  res.set('Cache-Control', 'no-cache');
  res.set('Service-Worker-Allowed', '/');
  return res.type('application/javascript').send(serviceWorker(workerLanguage(req)));
});

router.post('/share-target', (req, res) => res.redirect(303, '/dashboard?teilen=fehler'));

module.exports = router;
