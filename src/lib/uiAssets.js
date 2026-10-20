'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');
const { escapeHtml } = require('./format');

const log = logger.scope('ui');

const BASE = '/app/';
const MANIFEST_FILE = path.join(config.paths.ui, '.vite', 'manifest.json');
const PRELOAD_FONTS = /m-plus-rounded-1c-latin-(400|700)-normal-[^/]+\.woff2$/;

let manifest = null;
let manifestMtime = 0;
let warned = false;

function loadManifest() {
  try {
    const { mtimeMs } = fs.statSync(MANIFEST_FILE);
    if (!manifest || mtimeMs !== manifestMtime) {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
      manifestMtime = mtimeMs;
      warned = false;
    }
  } catch (error) {
    if (!warned) log.error('Die Weboberfläche fehlt, baue sie mit „npm run build“', { manifest: MANIFEST_FILE, error });
    warned = true;
    manifest = null;
  }
  return manifest;
}

function devTags(key, nonce) {
  const origin = `${config.devServer}${BASE}`;
  return {
    head: '',
    body: [
      `<script type="module" nonce="${escapeHtml(nonce)}">`,
      `import RefreshRuntime from "${origin}@react-refresh";`,
      'RefreshRuntime.injectIntoGlobalHook(window);',
      'window.$RefreshReg$ = () => {};',
      'window.$RefreshSig$ = () => (type) => type;',
      'window.__vite_plugin_react_preamble_installed__ = true;',
      '</script>',
      `<script type="module" src="${origin}@vite/client"></script>`,
      `<script type="module" src="${origin}${key}"></script>`,
    ].join('\n'),
  };
}

function tagsFor(entry, nonce = '') {
  const key = `src/entries/${entry}.tsx`;
  if (config.devServer) return devTags(key, nonce);

  const files = loadManifest();
  if (!files || !files[key]) return null;

  const css = new Set();
  const preload = new Set();
  const fonts = new Set();
  const seen = new Set();
  const walk = (name, isEntry) => {
    const chunk = files[name];
    if (!chunk || seen.has(name)) return;
    seen.add(name);
    for (const file of chunk.css || []) css.add(file);
    for (const file of chunk.assets || []) if (PRELOAD_FONTS.test(file)) fonts.add(file);
    if (!isEntry) preload.add(chunk.file);
    for (const child of chunk.imports || []) walk(child, false);
  };
  walk(key, true);

  const href = (file) => escapeHtml(BASE + file);
  return {
    head: [
      ...[...fonts].map((file) => `<link rel="preload" href="${href(file)}" as="font" type="font/woff2" crossorigin>`),
      ...[...css].map((file) => `<link rel="stylesheet" href="${href(file)}">`),
      ...[...preload].map((file) => `<link rel="modulepreload" href="${href(file)}">`),
    ].join('\n'),
    body: `<script type="module" src="${href(files[key].file)}"></script>`,
  };
}

module.exports = { tagsFor };
