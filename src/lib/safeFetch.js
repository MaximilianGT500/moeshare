'use strict';

const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const axios = require('axios');
const config = require('../config');

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return /^(fe[89ab]|f[cd])/.test(lower);
  }
  return true;
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    if (!config.allowPrivateFetch && list.some((entry) => isPrivateAddress(entry.address))) {
      const blocked = new Error('Adressen im internen Netz sind für den Abruf gesperrt.');
      blocked.code = 'EPRIVATE';
      return callback(blocked);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function assertPublicHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !config.allowPrivateFetch && isPrivateAddress(host)) {
    const blocked = new Error('Adressen im internen Netz sind für den Abruf gesperrt.');
    blocked.code = 'EPRIVATE';
    throw blocked;
  }
}

const client = axios.create({
  proxy: false,
  httpAgent: new http.Agent({ lookup: safeLookup }),
  httpsAgent: new https.Agent({ lookup: safeLookup }),
  beforeRedirect: (options) => assertPublicHost(options.hostname),
});

client.interceptors.request.use((request) => {
  assertPublicHost(new URL(request.url).hostname);
  return request;
});

module.exports = { client };
