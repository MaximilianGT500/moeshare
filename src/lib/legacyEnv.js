'use strict';

const { DEFAULT_TEMPLATE } = require('./embedTemplate');

const MB = 1024 * 1024;
const PLACEHOLDERS = ['https://example.com', 'http://example.com', 'EXAMPLE', 'EXAMPLE.COM'];

const clean = (value) => String(value).trim();
const favicon = (value) =>
  clean(value).replace(/^https?:\/\/(www\.)?moeshare\.de\/assets\/img\/logo\.png$/i, 'https://moeshare.eu/assets/img/logo.png');
const unlessPlaceholder = (value) => (PLACEHOLDERS.includes(clean(value).replace(/\/+$/, '')) ? undefined : clean(value));
const bool = (value) => clean(value).toLowerCase() === 'true';
const list = (value) =>
  clean(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function color(value) {
  const hex = clean(value).replace(/^(0x|#)/i, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : undefined;
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

const decodeEntities = (value) =>
  String(value)
    .replace(/&#(\d{1,6});/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/<[^>]*>/g, '')
    .trim();

const VARIABLES = {
  SITE_TITLE: ['site.title', clean],
  SITE_FAVICON: ['site.favicon', favicon],
  BASE_URL: ['site.baseUrl', clean],
  REDIRECT_URL: ['site.redirectUrl', unlessPlaceholder],
  COPYRIGHT_TEXT: ['site.copyright', decodeEntities],
  UI_COLOR: ['site.uiColor', clean],
  MAX_FILE_SIZE_MB: ['uploads.maxFileBytes', (value) => (clean(value) ? Math.round(Number.parseFloat(value) * MB) : null)],
  USE_PREVIEW: ['uploads.preview', bool],
  REMOVE_METADATA: ['uploads.removeMetadata', bool],
  USE_HLS: ['uploads.hls', bool],
  USE_DOMINANT_COLOR: ['uploads.dominantColor', bool],
  IMAGE_FORMATS: ['uploads.formats.image', list],
  VIDEO_FORMATS: ['uploads.formats.video', list],
  AUDIO_FORMATS: ['uploads.formats.audio', list],
  LOGS: ['webhook.enabled', bool],
  DISCORD_WEBHOOK_URL: ['webhook.url', (value) => (clean(value).includes('XXXX') ? undefined : clean(value))],
  DISCORD_WEBHOOK_NAME: ['webhook.name', clean],
  DISCORD_WEBHOOK_SUCCESS_COLOR: ['webhook.successColor', color],
  DISCORD_WEBHOOK_ERROR_COLOR: ['webhook.errorColor', color],
  TRUST_PROXY: ['system.trustProxy', bool],
  ALLOW_METRICS: ['system.errorReports', bool],
};

const EMBED_VARIABLES = ['OG_TITLE', 'OG_DESCRIPTION', 'THEME_COLOR', 'AUTHOR_NAME', 'AUTHOR_URL', 'PROVIDER_NAME', 'PROVIDER_URL'];
const RETIRED = ['JWT_TOKEN', 'USE_DASHBOARD', 'FONT_COLOR', 'BOX_SHADOW_COLOR', 'DOMINANT_COLOR_STATIC'];

const isSet = (env, name) => env[name] !== undefined && clean(env[name]) !== '';

function embedTemplate(env) {
  const pick = (name) => (isSet(env, name) ? unlessPlaceholder(env[name]) : undefined);
  const theme = clean(env.THEME_COLOR || '');
  const themeColor = color(theme);
  return {
    ...DEFAULT_TEMPLATE,
    title: pick('OG_TITLE') ?? DEFAULT_TEMPLATE.title,
    description: pick('OG_DESCRIPTION') ?? DEFAULT_TEMPLATE.description,
    author: pick('AUTHOR_NAME') ?? DEFAULT_TEMPLATE.author,
    authorUrl: pick('AUTHOR_URL') ?? '',
    siteName: pick('PROVIDER_NAME') ?? DEFAULT_TEMPLATE.siteName,
    siteUrl: pick('PROVIDER_URL') ?? '',
    color: theme.includes('&random')
      ? { mode: 'random', value: DEFAULT_TEMPLATE.color.value }
      : themeColor
        ? { mode: 'fixed', value: themeColor }
        : { mode: 'dominant', value: DEFAULT_TEMPLATE.color.value },
  };
}

function readLegacyEnv(env) {
  const values = {};
  for (const [name, [key, convert]] of Object.entries(VARIABLES)) {
    if (!isSet(env, name)) continue;
    const value = convert(env[name]);
    if (value !== undefined) values[key] = { value, source: name };
  }
  if (EMBED_VARIABLES.some((name) => isSet(env, name))) {
    values['embed.default'] = { value: embedTemplate(env), source: EMBED_VARIABLES.filter((name) => isSet(env, name)).join('/') };
  }
  const present = [...Object.keys(VARIABLES), ...EMBED_VARIABLES, ...RETIRED].filter((name) => isSet(env, name));
  return { values, present };
}

module.exports = { readLegacyEnv };
