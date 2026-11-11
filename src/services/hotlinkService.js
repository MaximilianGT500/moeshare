'use strict';

const settings = require('./settingsService');
const domains = require('./domainService');
const { isCrawler } = require('../lib/crawlers');

const enabled = () => Boolean(settings.get('hotlink.enabled'));

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function ownHosts() {
  return [settings.get('site.baseUrl'), ...settings.get('site.domains')].map(hostOf).filter(Boolean);
}

function matches(host, pattern) {
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === pattern;
}

function trustedHost(host, req) {
  if (!host) return false;
  if (host === domains.hostOf(req) || ownHosts().includes(host) || domains.ownerOfHost(host)) return true;
  return settings.get('hotlink.allowed').some((pattern) => matches(host, pattern));
}

function allowed(req) {
  if (!enabled()) return true;
  const site = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (site === 'same-origin' || site === 'none') return true;
  const referer = req.get('referer');
  if (referer) return trustedHost(hostOf(referer), req);
  if (site === 'same-site' || isCrawler(req.get('user-agent'))) return true;
  if (site === 'cross-site') return false;
  return Boolean(settings.get('hotlink.allowEmpty'));
}

function isNavigation(req) {
  const dest = String(req.get('sec-fetch-dest') || '').toLowerCase();
  if (dest) return dest === 'document';
  return /text\/html/.test(String(req.get('accept') || ''));
}

module.exports = { enabled, allowed, isNavigation, matches };
