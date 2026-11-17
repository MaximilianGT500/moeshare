'use strict';

const settings = require('../services/settingsService');

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function discoveryTag(url, title) {
  const href = `${settings.get('site.baseUrl')}/oembed?url=${encodeURIComponent(url)}&format=json`;
  return `<link rel="alternate" type="application/json+oembed" href="${escapeAttr(href)}" title="${escapeAttr(title)}" />`;
}

module.exports = { discoveryTag };
