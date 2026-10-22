'use strict';

const config = require('../config');
const settings = require('../services/settingsService');
const { tagsFor } = require('./uiAssets');
const { escapeHtml } = require('./format');
const i18n = require('./i18n');

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

const legalLinks = (language) =>
  LEGAL_PAGES.map(({ key, label, path }) => {
    const url = settings.get(`legal.${key}Url`);
    const text = i18n.translate(language, label);
    if (url) return { label: text, url };
    return settings.get(`legal.${key}Text`) ? { label: text, url: path } : null;
  }).filter(Boolean);

const siteInfo = (language = settings.get('site.language'), custom = false) => ({
  title: settings.get('site.title'),
  favicon: settings.get('site.favicon'),
  version: config.version,
  baseUrl: settings.get('site.baseUrl'),
  seedColor: settings.get('site.uiColor'),
  copyright: settings.get('site.copyright'),
  links: settings.get('site.links'),
  legal: legalLinks(language),
  pwa: settings.get('site.pwa') && !custom,
  language: settings.get('site.language'),
  report: settings.get('reports.enabled'),
  custom,
});

const missingUiPage = (title) => `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15121b;color:#e7e0ed;font-family:system-ui,sans-serif;padding:24px}
main{max-width:520px;line-height:1.6}code{background:#2c2832;padding:2px 6px;border-radius:6px}</style></head>
<body><main><h1>Die Weboberfläche fehlt</h1><p>Der Build von <code>client/</code> wurde nicht gefunden.
Führe im Projektordner <code>npm run build</code> aus und starte den Server neu.</p></main></body></html>`;

const NOSCRIPT = 'Bitte aktiviere JavaScript, um diese Seite zu nutzen.';

const themeScript = (forced) => `(function () {
      try {
        var root = document.documentElement;
        var mode = ${forced ? JSON.stringify(forced) : "localStorage.getItem('mui-mode') || 'dark'"};
        var scheme = mode === 'system'
          ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
          : mode;
        if (scheme !== 'light') scheme = 'dark';
        root.setAttribute('data-mui-color-scheme', scheme);
        root.style.colorScheme = scheme;
      } catch (e) {}
    })();`;

function appShell({
  lang = 'de',
  locale = 'de_DE',
  title,
  siteTitle,
  favicon,
  head,
  noscript,
  nonce,
  assets,
  boot,
  messages = null,
  pwa = false,
  themeColor = '#15121b',
  scheme = null,
}) {
  const meta = head
    ? `  ${head}`
    : [
        `  <meta property="og:title" content="${escapeHtml(siteTitle)}" />`,
        `  <meta property="og:locale" content="${escapeHtml(locale)}" />`,
        '  <meta name="robots" content="noindex" />',
      ].join('\n');
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" data-mui-color-scheme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
${meta}
  <link rel="icon" href="${escapeHtml(favicon || '/favicon.svg')}" />
${pwa ? `  <link rel="manifest" href="/manifest.webmanifest" />\n  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />\n  <meta name="theme-color" content="${escapeHtml(themeColor)}" />\n` : ''}  <meta name="color-scheme" content="dark light" />
  <script nonce="${escapeHtml(nonce)}">
    ${themeScript(scheme)}
  </script>
  <style>
    html, body { margin: 0; background: #15121b; color: #e7e0ed; }
    html[data-mui-color-scheme="light"], html[data-mui-color-scheme="light"] body { background: #fef7ff; color: #1d1a23; }
  </style>
${messages ? `  <script nonce="${escapeHtml(nonce)}" src="${escapeHtml(messages)}"></script>\n` : ''}  ${assets.head}
</head>
<body>
  <div id="root"></div>
  <noscript>${/^</.test(noscript) ? noscript : `<p style="font-family:system-ui,sans-serif;padding:24px">${escapeHtml(noscript)}</p>`}</noscript>
  <script id="moeshare-data" type="application/json">${boot}</script>
  ${assets.body}
</body>
</html>
`;
}

const languageOf = (res) => (res.req && res.req.language) || settings.get('site.language');

const SCHEMES = ['dark', 'light'];

function renderPage(res, { page, title, titleRaw = null, data = {}, head = '', noscript = NOSCRIPT, status = 200, scheme = null }) {
  const language = languageOf(res);
  const custom = Boolean(res.req && res.req.customDomain);
  const site = siteInfo(language, custom);
  const assets = tagsFor(page, res.locals.cspNonce);
  if (!assets) return res.status(503).type('html').send(missingUiPage(site.title));
  const label = titleRaw || (title ? i18n.translate(language, title) : '');
  const html = appShell({
    lang: language,
    locale: language === 'en' ? 'en_GB' : 'de_DE',
    nonce: res.locals.cspNonce || '',
    title: label ? `${label} » ${site.title}` : site.title,
    favicon: site.favicon,
    siteTitle: site.title,
    head,
    noscript: i18n.translate(language, noscript),
    assets,
    pwa: site.pwa,
    themeColor: settings.get('site.uiColor'),
    messages: i18n.clientScriptUrl(language),
    scheme: SCHEMES.includes(scheme) ? scheme : null,
    boot: serialize({ page, site, language, ...data }),
  });
  return res.status(status).type('html').send(html);
}

const renderMessage = (res, status, message, { title = 'Nicht gefunden', requestId } = {}) =>
  renderPage(res, { page: 'notfound', title, status, data: { message: i18n.translate(languageOf(res), message), status, requestId } });

module.exports = { renderPage, renderMessage, LEGAL_PAGES };
