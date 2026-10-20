'use strict';

const config = require('../config');
const settings = require('../services/settingsService');
const { tagsFor } = require('./uiAssets');
const { escapeHtml } = require('./format');

const serialize = (data) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const LEGAL_PAGES = [
  { key: 'imprint', label: 'Impressum', path: '/impressum' },
  { key: 'privacy', label: 'Datenschutz', path: '/datenschutz' },
];

const legalLinks = () =>
  LEGAL_PAGES.map(({ key, label, path }) => {
    const url = settings.get(`legal.${key}Url`);
    if (url) return { label, url };
    return settings.get(`legal.${key}Text`) ? { label, url: path } : null;
  }).filter(Boolean);

const siteInfo = () => ({
  title: settings.get('site.title'),
  favicon: settings.get('site.favicon'),
  version: config.version,
  baseUrl: settings.get('site.baseUrl'),
  seedColor: settings.get('site.uiColor'),
  copyright: settings.get('site.copyright'),
  links: settings.get('site.links'),
  legal: legalLinks(),
});

const missingUiPage = (title) => `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15121b;color:#e7e0ed;font-family:system-ui,sans-serif;padding:24px}
main{max-width:520px;line-height:1.6}code{background:#2c2832;padding:2px 6px;border-radius:6px}</style></head>
<body><main><h1>Die Weboberfläche fehlt</h1><p>Der Build von <code>client/</code> wurde nicht gefunden.
Führe im Projektordner <code>npm run build</code> aus und starte den Server neu.</p></main></body></html>`;

const NOSCRIPT = '<p style="font-family:system-ui,sans-serif;padding:24px">Bitte aktiviere JavaScript, um diese Seite zu nutzen.</p>';

function renderPage(res, { page, title, data = {}, head = '', noscript = NOSCRIPT, status = 200 }) {
  const site = siteInfo();
  const assets = tagsFor(page, res.locals.cspNonce);
  if (!assets) return res.status(503).type('html').send(missingUiPage(site.title));
  return res.status(status).render('app', {
    cspNonce: res.locals.cspNonce || '',
    title: title ? `${title} » ${site.title}` : site.title,
    favicon: site.favicon,
    siteTitle: site.title,
    head,
    noscript,
    assets,
    boot: serialize({ page, site, ...data }),
  });
}

const renderMessage = (res, status, message, { title = 'Nicht gefunden', requestId } = {}) =>
  renderPage(res, { page: 'notfound', title, status, data: { message, status, requestId } });

module.exports = { renderPage, renderMessage, LEGAL_PAGES };
