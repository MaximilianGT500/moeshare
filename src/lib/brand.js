'use strict';

const config = require('../config');
const settings = require('../services/settingsService');

const FALLBACK = 'moeshare';
const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

const plain = (text) =>
  String(text || '')
    .replace(/[äöüÄÖÜß]/g, (char) => UMLAUTS[char])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

function slugify(text, max = 40) {
  return plain(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

function hostLabel() {
  try {
    return new URL(settings.get('site.baseUrl')).hostname.split('.')[0];
  } catch {
    return '';
  }
}

const slug = () => slugify(settings.get('site.title')) || slugify(hostLabel()) || FALLBACK;

function product() {
  const token = plain(settings.get('site.title'))
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return token || 'MoeShare';
}

const showVersion = () => settings.get('site.showVersion') !== false;

const userAgent = () => (showVersion() ? `${product()}/${config.version}` : product());

module.exports = { FALLBACK, slugify, slug, product, showVersion, userAgent };
