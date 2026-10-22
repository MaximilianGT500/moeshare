'use strict';

const crypto = require('crypto');
const dns = require('dns');
const net = require('net');
const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const secrets = require('../lib/secrets');
const { client: safeHttp } = require('../lib/safeFetch');
const { badRequest, conflict, forbidden, notFound } = require('../lib/errors');
const audit = require('./auditService');
const settings = require('./settingsService');

const log = logger.scope('domains');

const RECORD_PREFIX = '_moeshare';
const VALUE_PREFIX = 'moeshare-verify=';
const REFRESH_MS = 30 * 1000;
const PROBE_PATH = '/.well-known/moeshare/domain';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const AUTO_CHECK_MS = 7 * 24 * HOUR;
const AUTO_BATCH = 10;

let byHost = new Map();
let byUser = new Map();
let timer = null;

const enabled = () => settings.get('domains.enabled');
const scheme = () => (settings.get('domains.https') ? 'https' : 'http');
const originOf = (domain) => `${scheme()}://${domain}`;
const baseHost = () => new URL(settings.get('site.baseUrl')).hostname.toLowerCase();
const globalHosts = () =>
  [settings.get('site.baseUrl'), ...settings.get('site.domains')].map((origin) => new URL(origin).hostname.toLowerCase());
const target = () => settings.get('domains.target') || baseHost();

function instanceId() {
  return crypto.createHmac('sha256', secrets.loadKey()).update('moeshare-domain-probe').digest('hex').slice(0, 24);
}

function normalizeHost(input) {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!raw) throw badRequest('Gib eine Domain ein, z. B. bilder.example.com.', { field: 'domain' });
  let host;
  try {
    const parsed = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
    if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash || parsed.username || parsed.port)
      throw new Error('path');
    host = parsed.hostname.replace(/\.$/, '');
  } catch {
    throw badRequest('Bitte nur die Domain eingeben, ohne Pfad oder Port.', { field: 'domain' });
  }
  if (net.isIP(host.replace(/^\[|\]$/g, ''))) throw badRequest('IP-Adressen gehen nicht, nimm eine Domain.', { field: 'domain' });
  const labels = host.split('.');
  const valid =
    host.length <= 191 &&
    labels.length >= 2 &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    /^[a-z][a-z0-9-]*$/.test(labels[labels.length - 1]);
  if (!valid) throw badRequest('Das ist keine gültige Domain.', { field: 'domain' });
  if (globalHosts().includes(host)) throw badRequest('Diese Domain gehört schon zu diesem Server.', { field: 'domain' });
  return host;
}

function present(row) {
  return {
    id: Number(row.id),
    domain: row.domain,
    origin: originOf(row.domain),
    status: row.status,
    createdAt: Number(row.created_at),
    verifiedAt: row.verified_at ? Number(row.verified_at) : null,
    checkedAt: row.checked_at ? Number(row.checked_at) : null,
    error: row.error || null,
    autoCheckUntil: row.status === 'pending' ? Number(row.created_at) + AUTO_CHECK_MS : null,
    record: { type: 'TXT', name: `${RECORD_PREFIX}.${row.domain}`, value: `${VALUE_PREFIX}${row.token}` },
    target: target(),
  };
}

async function refresh() {
  if (!enabled()) {
    byHost = new Map();
    byUser = new Map();
    return;
  }
  const rows = await db.all(
    `SELECT d.domain, d.user_id, u.username FROM user_domains d JOIN users u ON u.id = d.user_id
     WHERE d.status = 'verified' AND u.status = 'active'`
  );
  const hosts = new Map();
  const users = new Map();
  for (const row of rows) {
    const entry = { domain: row.domain, origin: originOf(row.domain), userId: Number(row.user_id), username: row.username };
    hosts.set(row.domain, entry);
    users.set(row.username, [...(users.get(row.username) || []), entry]);
  }
  byHost = hosts;
  byUser = users;
}

function start() {
  if (timer) return;
  timer = setInterval(() => refresh().catch((error) => log.debug('Domains nicht abgeglichen', { error })), REFRESH_MS);
  timer.unref();
  settings.onChange((keys) => {
    if (keys.some((key) => key.startsWith('domains.') || key === 'site.baseUrl' || key === 'site.domains')) refresh().catch(() => {});
  });
}

const ownerOfHost = (host) => byHost.get(String(host || '').toLowerCase()) || null;

const originsFor = (username) => (byUser.get(username) || []).map((entry) => entry.origin);

function hostOf(req) {
  return String(req.hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');
}

function requestOrigin(req) {
  if (req.customDomain) return req.customDomain.origin;
  const origin = `${req.protocol}://${req.get('host')}`;
  return [settings.get('site.baseUrl'), ...settings.get('site.domains')].includes(origin) ? origin : null;
}

function servesOwner(req, username) {
  return !req.customDomain || req.customDomain.username === username;
}

async function listForUser(userId) {
  const rows = await db.all('SELECT * FROM user_domains WHERE user_id = ? ORDER BY id', [userId]);
  return rows.map(present);
}

async function owned(userId, id) {
  const row = Number.isSafeInteger(Number(id))
    ? await db.get('SELECT * FROM user_domains WHERE id = ? AND user_id = ?', [Number(id), userId])
    : null;
  if (!row) throw notFound('Diese Domain gibt es nicht (mehr).');
  return row;
}

async function add(user, input) {
  if (!enabled()) throw forbidden('Eigene Domains sind auf diesem Server abgeschaltet.');
  const domain = normalizeHost(input);
  const count = await db.count('SELECT COUNT(*) FROM user_domains WHERE user_id = ?', [user.id]);
  const max = settings.get('domains.maxPerUser');
  if (count >= max) throw badRequest(`Du kannst höchstens ${max} Domains verbinden.`, { field: 'domain' });
  const existing = await db.get('SELECT * FROM user_domains WHERE domain = ?', [domain]);
  if (existing) {
    if (Number(existing.user_id) === Number(user.id)) throw conflict('Diese Domain hast du schon eingetragen.', { field: 'domain' });
    if (existing.status === 'verified') {
      throw conflict('Diese Domain ist schon mit einem anderen Konto verbunden. Wende dich an einen Admin.', { field: 'domain' });
    }
    await db.run('DELETE FROM user_domains WHERE id = ?', [existing.id]);
  }
  const id = await db.insertRow('user_domains', {
    user_id: user.id,
    domain,
    token: secrets.randomToken(18),
    status: 'pending',
    created_at: Date.now(),
  });
  log.info('Domain eingetragen', { user: user.username, domain });
  return present(await db.get('SELECT * FROM user_domains WHERE id = ?', [id]));
}

function resolver() {
  const instance = new dns.promises.Resolver({ timeout: 5000, tries: 2 });
  if (config.dnsServers.length) instance.setServers(config.dnsServers);
  return instance;
}

async function lookupTxt(domain) {
  try {
    const records = await resolver().resolveTxt(`${RECORD_PREFIX}.${domain}`);
    return { values: records.map((chunks) => chunks.join('').trim()) };
  } catch (error) {
    if (['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(error.code)) return { values: [] };
    return { error: error.code || error.message };
  }
}

async function addresses(host) {
  const instance = resolver();
  const found = new Set();
  for (const method of ['resolve4', 'resolve6']) {
    try {
      for (const address of await instance[method](host)) found.add(address);
    } catch {}
  }
  return found;
}

async function pointsHere(domain) {
  const [mine, theirs] = await Promise.all([addresses(target()), addresses(domain)]);
  if (!mine.size || !theirs.size) return null;
  return [...theirs].some((address) => mine.has(address));
}

async function reachable(domain) {
  try {
    const response = await safeHttp({
      method: 'get',
      url: `${originOf(domain)}${PROBE_PATH}`,
      timeout: 5000,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { Accept: 'application/json' },
    });
    return response.status === 200 && response.data && response.data.instance === instanceId();
  } catch {
    return null;
  }
}

async function check(row) {
  const expected = `${VALUE_PREFIX}${row.token}`;
  const name = `${RECORD_PREFIX}.${row.domain}`;
  const result = await lookupTxt(row.domain);
  const now = Date.now();
  let error = null;
  if (result.error) error = `Die DNS-Abfrage ist fehlgeschlagen (${result.error}).`;
  else if (!result.values.length) error = `Kein TXT-Eintrag bei ${name} gefunden. Neue Einträge brauchen manchmal ein paar Minuten.`;
  else if (!result.values.includes(expected)) error = 'Der TXT-Eintrag ist da, enthält aber einen anderen Wert.';
  if (error) {
    await db.run('UPDATE user_domains SET checked_at = ?, error = ? WHERE id = ?', [now, error, row.id]);
    return { error, newly: false };
  }
  await db.run(
    "UPDATE user_domains SET status = 'verified', verified_at = COALESCE(verified_at, ?), checked_at = ?, error = NULL WHERE id = ?",
    [now, now, row.id]
  );
  const newly = row.status !== 'verified';
  if (newly) await refresh();
  return { error: null, newly };
}

async function verify(user, id) {
  const row = await owned(user.id, id);
  const outcome = await check(row);
  if (outcome.newly) log.info('Domain bestätigt', { user: user.username, domain: row.domain });
  const fresh = present(await db.get('SELECT * FROM user_domains WHERE id = ?', [row.id]));
  const [points, reach] = outcome.error ? [null, null] : await Promise.all([pointsHere(row.domain), reachable(row.domain)]);
  return { ...fresh, verified: !outcome.error, newlyVerified: outcome.newly, points, reachable: reach };
}

function dueForCheck(row, now) {
  const age = now - Number(row.created_at);
  const every = age < HOUR ? 2 * MINUTE : 15 * MINUTE;
  return !row.checked_at || now - Number(row.checked_at) >= every;
}

async function checkPending() {
  if (!enabled()) return [];
  const now = Date.now();
  const rows = await db.all(
    `SELECT d.*, u.username FROM user_domains d JOIN users u ON u.id = d.user_id
     WHERE d.status = 'pending' AND d.created_at > ? AND u.status = 'active' ORDER BY d.id`,
    [now - AUTO_CHECK_MS]
  );
  const due = rows.filter((row) => dueForCheck(row, now)).slice(0, AUTO_BATCH);
  const outcomes = await Promise.all(due.map((row) => check(row).catch((error) => ({ error: error.message, newly: false }))));
  const verified = [];
  due.forEach((row, index) => {
    if (!outcomes[index].newly) return;
    log.info('Domain automatisch bestätigt', { user: row.username, domain: row.domain });
    audit.log('domain_verified', { userId: Number(row.user_id), details: { domain: row.domain, automatic: true } });
    verified.push(row.domain);
  });
  return verified;
}

async function remove(user, id) {
  const row = await owned(user.id, id);
  await db.run('DELETE FROM user_domains WHERE id = ?', [row.id]);
  await refresh();
  log.info('Domain entfernt', { user: user.username, domain: row.domain });
  return present(row);
}

async function listAll() {
  const rows = await db.all(
    'SELECT d.*, u.username FROM user_domains d LEFT JOIN users u ON u.id = d.user_id ORDER BY d.status DESC, d.domain'
  );
  return rows.map((row) => ({ ...present(row), username: row.username || null, userId: Number(row.user_id) }));
}

async function removeAny(id) {
  const row = Number.isSafeInteger(Number(id)) ? await db.get('SELECT * FROM user_domains WHERE id = ?', [Number(id)]) : null;
  if (!row) throw notFound('Diese Domain gibt es nicht (mehr).');
  await db.run('DELETE FROM user_domains WHERE id = ?', [row.id]);
  await refresh();
  return { ...present(row), userId: Number(row.user_id) || null };
}

function allowsCertificate(host) {
  const name = String(host || '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!name) return false;
  if (globalHosts().includes(name)) return true;
  return Boolean(ownerOfHost(name));
}

module.exports = {
  PROBE_PATH,
  RECORD_PREFIX,
  enabled,
  refresh,
  start,
  ownerOfHost,
  originsFor,
  originOf,
  hostOf,
  requestOrigin,
  servesOwner,
  listForUser,
  add,
  verify,
  checkPending,
  remove,
  listAll,
  removeAny,
  allowsCertificate,
  instanceId,
};
