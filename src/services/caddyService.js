'use strict';

const config = require('../config');
const dns = require('dns');
const tls = require('tls');
const axios = require('axios');
const db = require('../lib/db');
const logger = require('../lib/logger');
const { translate } = require('../lib/i18n');
const { isPrivateAddress } = require('../lib/safeFetch');
const { badRequest, badGateway, serviceUnavailable } = require('../lib/errors');
const settings = require('./settingsService');
const mail = require('./mailService');
const webhook = require('./webhookService');

const log = logger.scope('caddy');

const CANDIDATES = ['http://caddy:2019', 'http://127.0.0.1:2019', 'http://localhost:2019'];
const DETECT_MS = 5 * 60 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const HANDSHAKE_MS = 20000;
const KEEP_REQUESTS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REQUESTS = 2000;
const DAY = 24 * 60 * 60 * 1000;
const CADDYFILE_LIMIT = 256 * 1024;

let detected = { url: null, at: 0 };
let timer = null;
let running = null;

function configuredUrl() {
  const value = settings.get('caddy.adminUrl');
  return value ? value.replace(/\/+$/, '') : null;
}

async function call(base, method, path, { data, type, timeout = 4000 } = {}) {
  const response = await axios({
    method,
    url: `${base}${path}`,
    data,
    timeout,
    proxy: false,
    maxRedirects: 0,
    transformResponse: (body) => body,
    headers: type ? { 'Content-Type': type } : {},
    validateStatus: () => true,
  });
  return response;
}

async function probe(base) {
  try {
    const response = await call(base, 'get', '/config/', { timeout: 1500 });
    return response.status === 200 ? base : null;
  } catch {
    return null;
  }
}

async function adminBase({ fresh = false } = {}) {
  const configured = configuredUrl();
  if (configured) return configured;
  if (!fresh && detected.at && Date.now() - detected.at < DETECT_MS) return detected.url;
  let found = null;
  for (const candidate of CANDIDATES) {
    found = await probe(candidate);
    if (found) break;
  }
  detected = { url: found, at: Date.now() };
  return found;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorOf(response) {
  const body = parseJson(response.data);
  return (
    (body && body.error) ||
    String(response.data || '')
      .trim()
      .slice(0, 300) ||
    `HTTP ${response.status}`
  );
}

function upstreamsOf(handlers, found = new Set()) {
  for (const handler of handlers || []) {
    if (handler.handler === 'reverse_proxy') for (const upstream of handler.upstreams || []) if (upstream.dial) found.add(upstream.dial);
    if (handler.handler === 'subroute') for (const route of handler.routes || []) upstreamsOf(route.handle, found);
  }
  return found;
}

function summarize(config) {
  const servers = (config && config.apps && config.apps.http && config.apps.http.servers) || {};
  const sites = [];
  for (const [name, server] of Object.entries(servers)) {
    for (const route of server.routes || []) {
      const hosts = (route.match || []).flatMap((match) => match.host || []);
      sites.push({ server: name, listen: server.listen || [], hosts, upstreams: [...upstreamsOf(route.handle)] });
    }
  }
  const automation = (config && config.apps && config.apps.tls && config.apps.tls.automation) || {};
  const onDemand = automation.on_demand || {};
  const permission = onDemand.permission || {};
  const policies = (automation.policies || []).map((policy) => ({
    subjects: policy.subjects || [],
    onDemand: Boolean(policy.on_demand),
    issuers: (policy.issuers || []).map((issuer) => ({ module: issuer.module, ca: issuer.ca || null, email: issuer.email || null })),
  }));
  return {
    sites,
    policies,
    onDemand: policies.some((policy) => policy.onDemand),
    ask: onDemand.ask || permission.endpoint || null,
    email: policies.flatMap((policy) => policy.issuers).find((issuer) => issuer.email)?.email || null,
    admin: (config && config.admin && config.admin.listen) || null,
  };
}

function metricOf(text, name) {
  const match = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)`, 'm').exec(text || '');
  return match ? Number(match[1]) : null;
}

function diagnose(summary, upstreams, reload) {
  const notes = [];
  if (reload && reload.successful === false)
    notes.push({ level: 'error', text: 'Die letzte Änderung der Konfiguration ist fehlgeschlagen.' });
  if (summary.onDemand && !summary.ask) {
    notes.push({
      level: 'error',
      text: 'Caddy holt Zertifikate auf Abruf, fragt aber vorher nicht nach. So bekommt jede Domain ein Zertifikat, die auf den Server zeigt.',
    });
  } else if (summary.ask && !/\/api\/domains\/tls(?:\?|$)/.test(summary.ask)) {
    notes.push({ level: 'warning', text: 'Caddy fragt vor neuen Zertifikaten eine andere Adresse als /api/domains/tls.' });
  }
  if (settings.get('domains.enabled') && !summary.onDemand) {
    notes.push({
      level: 'warning',
      text: 'Eigene Domains sind an, aber Caddy holt keine Zertifikate auf Abruf. Neue Domains bekommen dann kein HTTPS.',
    });
  }
  const broken = upstreams.filter((upstream) => upstream.fails > 0);
  if (broken.length)
    notes.push({
      level: 'warning',
      text: 'Caddy erreicht {list} gerade nicht zuverlässig.',
      params: { list: broken.map((u) => u.address).join(', ') },
    });
  if (!summary.sites.some((site) => site.upstreams.length))
    notes.push({ level: 'info', text: 'In der Konfiguration leitet keine Seite an einen Server weiter.' });
  return notes;
}

async function overview() {
  const base = await adminBase({ fresh: true });
  if (!base) {
    return { connected: false, url: configuredUrl(), detected: false, error: configuredUrl() ? 'Die Admin-API antwortet nicht.' : null };
  }
  try {
    const [configResponse, upstreamResponse, metricsResponse] = await Promise.all([
      call(base, 'get', '/config/'),
      call(base, 'get', '/reverse_proxy/upstreams').catch(() => null),
      call(base, 'get', '/metrics').catch(() => null),
    ]);
    if (configResponse.status !== 200) {
      return { connected: false, url: base, detected: !configuredUrl(), error: errorOf(configResponse) };
    }
    const config = parseJson(configResponse.data);
    const summary = summarize(config);
    const upstreams =
      upstreamResponse && upstreamResponse.status === 200
        ? (parseJson(upstreamResponse.data) || []).map((item) => ({
            address: item.address,
            requests: Number(item.num_requests) || 0,
            fails: Number(item.fails) || 0,
          }))
        : [];
    const metrics = metricsResponse && metricsResponse.status === 200 ? metricsResponse.data : '';
    const successful = metricOf(metrics, 'caddy_config_last_reload_successful');
    const reloadedAt = metricOf(metrics, 'caddy_config_last_reload_success_timestamp_seconds');
    const reload = { successful: successful === null ? null : successful === 1, at: reloadedAt ? Math.round(reloadedAt * 1000) : null };
    return {
      connected: true,
      url: base,
      detected: !configuredUrl(),
      summary,
      upstreams,
      reload,
      notes: diagnose(summary, upstreams, reload),
      config: configResponse.data.length <= 200000 ? config : null,
    };
  } catch (error) {
    return { connected: false, url: base, detected: !configuredUrl(), error: error.code || error.message };
  }
}

async function requireBase() {
  const base = await adminBase({ fresh: true });
  if (!base) throw serviceUnavailable('Die Admin-API von Caddy ist nicht erreichbar.');
  return base;
}

function cleanCaddyfile(text) {
  if (typeof text !== 'string' || !text.trim()) throw badRequest('Die Caddyfile ist leer.', { field: 'caddyfile' });
  if (Buffer.byteLength(text) > CADDYFILE_LIMIT) throw badRequest('Die Caddyfile ist zu groß.', { field: 'caddyfile' });
  return text.replace(/\r\n?/g, '\n');
}

async function adapt(text) {
  const base = await requireBase();
  const response = await call(base, 'post', '/adapt', { data: cleanCaddyfile(text), type: 'text/caddyfile', timeout: 10000 });
  if (response.status !== 200) return { ok: false, error: errorOf(response), warnings: [] };
  const body = parseJson(response.data) || {};
  return {
    ok: true,
    warnings: (body.warnings || []).map((warning) => `${warning.file || 'Caddyfile'}:${warning.line || 0} ${warning.message || ''}`.trim()),
    summary: summarize(body.result || null),
  };
}

async function load(text) {
  const checked = await adapt(text);
  if (!checked.ok) throw badRequest(`Caddy lehnt die Caddyfile ab: ${checked.error}`, { field: 'caddyfile' });
  const base = await requireBase();
  const response = await call(base, 'post', '/load', { data: cleanCaddyfile(text), type: 'text/caddyfile', timeout: 30000 });
  if (response.status !== 200) throw badGateway(`Caddy hat die Caddyfile nicht übernommen: ${errorOf(response)}`);
  log.info('Neue Caddyfile übernommen', { url: base });
  return { ok: true, warnings: checked.warnings };
}

function hostOfUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const usable = (host) => typeof host === 'string' && /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host);

async function targets(summary = null) {
  const list = new Map();
  const add = (domain, source) => {
    const host = String(domain || '')
      .toLowerCase()
      .replace(/\.$/, '');
    if (usable(host) && !list.has(host)) list.set(host, source);
  };
  if (/^https:/.test(settings.get('site.baseUrl'))) add(hostOfUrl(settings.get('site.baseUrl')), 'site');
  for (const origin of settings.get('site.domains')) if (/^https:/.test(origin)) add(hostOfUrl(origin), 'site');
  if (settings.get('domains.https')) {
    const rows = await db.all("SELECT domain FROM user_domains WHERE status = 'verified' ORDER BY domain");
    for (const row of rows) add(row.domain, 'custom');
  }
  if (summary)
    for (const site of summary.sites) for (const host of site.hosts) if (!host.includes('*') && !host.includes('{')) add(host, 'caddy');
  return [...list.entries()].map(([domain, source]) => ({ domain, source }));
}

async function tlsTarget() {
  const configured = settings.get('caddy.tlsAddress');
  if (configured) {
    const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(configured);
    return { host: match[1].replace(/^\[|\]$/g, ''), port: Number(match[2]) || 443, internal: true };
  }
  const base = await adminBase();
  if (base) {
    const host = hostOfUrl(base);
    return { host: host === 'localhost' ? '127.0.0.1' : host, port: 443, internal: true };
  }
  return null;
}

async function publicAddress(domain) {
  const addresses = await dns.promises.lookup(domain, { all: true });
  const open = addresses.find((entry) => !isPrivateAddress(entry.address));
  if (!open) {
    const error = new Error('private');
    error.code = 'EPRIVATE';
    throw error;
  }
  return open.address;
}

const HANDSHAKE_ERRORS = {
  ECONNREFUSED: 'Verbindung abgelehnt, auf Port 443 lauscht nichts.',
  ECONNRESET: 'Die Verbindung wurde getrennt, wahrscheinlich gibt es für diese Domain kein Zertifikat.',
  ENOTFOUND: 'Die Domain lässt sich nicht auflösen.',
  EAI_AGAIN: 'Die Domain lässt sich gerade nicht auflösen.',
  ETIMEDOUT: 'Keine Antwort innerhalb von 20 Sekunden.',
  EPRIVATE: 'Die Domain zeigt ins interne Netz und wird deshalb nicht direkt geprüft.',
  EHOSTUNREACH: 'Der Server ist nicht erreichbar.',
};

function describeHandshake(error) {
  if (HANDSHAKE_ERRORS[error.code]) return HANDSHAKE_ERRORS[error.code];
  if (/alert internal error|alert number 80/i.test(error.message)) return 'Caddy hat für diese Domain gerade kein Zertifikat.';
  if (/unrecognized name|alert number 112/i.test(error.message)) return 'Der Server kennt diese Domain nicht.';
  return error.message;
}

function inspect(domain, { host, port }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const socket = tls.connect({ host, port, servername: domain, rejectUnauthorized: false, ALPNProtocols: ['http/1.1'] });
    socket.setTimeout(HANDSHAKE_MS, () => {
      socket.destroy();
      finish({ error: HANDSHAKE_ERRORS.ETIMEDOUT });
    });
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate(false);
      const authorized = socket.authorized;
      const authorizationError = socket.authorizationError ? String(socket.authorizationError) : null;
      socket.end();
      if (!certificate || !certificate.valid_to) return finish({ error: 'Der Server hat kein Zertifikat geschickt.' });
      const names = String(certificate.subjectaltname || '')
        .split(',')
        .map((name) => name.trim().replace(/^DNS:/, ''))
        .filter(Boolean);
      const issuer = (certificate.issuer && (certificate.issuer.O || certificate.issuer.CN)) || '';
      return finish({
        issuer: Array.isArray(issuer) ? issuer.join(', ') : issuer,
        names,
        validFrom: Date.parse(certificate.valid_from) || null,
        validTo: Date.parse(certificate.valid_to) || null,
        fingerprint: certificate.fingerprint256 || null,
        matches: !tls.checkServerIdentity(domain, certificate),
        trusted: authorized,
        authorizationError,
      });
    });
    socket.once('error', (error) => finish({ error: describeHandshake(error) }));
  });
}

function judge(result, now = Date.now()) {
  if (result.error) return { status: 'error', error: result.error };
  const warnMs = settings.get('caddy.warnDays') * DAY;
  if (result.validTo && result.validTo <= now) return { status: 'expired', error: 'Das Zertifikat ist abgelaufen.' };
  if (!result.matches) return { status: 'error', error: 'Das Zertifikat gilt nicht für diese Domain.' };
  if (!result.trusted) {
    return {
      status: 'untrusted',
      error: 'Das Zertifikat ist nicht öffentlich vertrauenswürdig, etwa weil es von Caddys eigener Zertifizierungsstelle stammt.',
    };
  }
  if (result.validTo && result.validTo - now <= warnMs)
    return { status: 'warning', error: 'Das Zertifikat läuft bald ab und wurde noch nicht erneuert.' };
  return { status: 'ok', error: null };
}

async function checkOne(domain, source, target) {
  let address = target;
  let result;
  try {
    if (!address) address = { host: source === 'custom' ? await publicAddress(domain) : domain, port: 443 };
    result = await inspect(domain, address);
  } catch (error) {
    result = { error: describeHandshake(error) };
  }
  const verdict = judge(result);
  const row = {
    domain,
    source,
    status: verdict.status,
    issuer: result.issuer || null,
    names: result.names ? result.names.join(',').slice(0, 4000) : null,
    valid_from: result.validFrom || null,
    valid_to: result.validTo || null,
    fingerprint: result.fingerprint || null,
    error: verdict.error,
    checked_at: Date.now(),
  };
  const existing = await db.get('SELECT id FROM certificates WHERE domain = ?', [domain]);
  if (existing) {
    await db.run(
      'UPDATE certificates SET source = ?, status = ?, issuer = ?, names = ?, valid_from = ?, valid_to = ?, fingerprint = ?, error = ?, checked_at = ? WHERE id = ?',
      [row.source, row.status, row.issuer, row.names, row.valid_from, row.valid_to, row.fingerprint, row.error, row.checked_at, existing.id]
    );
  } else {
    await db.insertRow('certificates', row);
  }
  return row;
}

function present(row) {
  const validTo = row.valid_to ? Number(row.valid_to) : null;
  return {
    domain: row.domain,
    source: row.source,
    status: row.status,
    issuer: row.issuer || null,
    names: row.names ? String(row.names).split(',').filter(Boolean) : [],
    validFrom: row.valid_from ? Number(row.valid_from) : null,
    validTo,
    daysLeft: validTo ? Math.floor((validTo - Date.now()) / DAY) : null,
    fingerprint: row.fingerprint || null,
    error: row.error || null,
    checkedAt: Number(row.checked_at),
  };
}

async function certificates() {
  const known = new Map((await targets()).map((item) => [item.domain, item.source]));
  const rows = await db.all('SELECT * FROM certificates ORDER BY domain');
  const listed = rows.filter((row) => known.has(row.domain) || row.source === 'caddy').map(present);
  const pending = [...known.entries()].filter(([domain]) => !rows.some((row) => row.domain === domain));
  return [...listed, ...pending.map(([domain, source]) => ({ domain, source, status: 'unchecked', names: [], checkedAt: null }))];
}

async function checkAll({ domain = null } = {}) {
  if (running && !domain) return running;
  const task = (async () => {
    const info = await overview().catch(() => ({ connected: false }));
    const list = await targets(info.connected ? info.summary : null);
    const selected = domain ? list.filter((item) => item.domain === domain) : list;
    if (domain && !selected.length) throw badRequest('Diese Domain gehört nicht zu diesem Server.', { field: 'domain' });
    const target = await tlsTarget();
    const results = [];
    for (const item of selected) results.push(present(await checkOne(item.domain, item.source, target)));
    if (!domain) {
      const keep = new Set(list.map((item) => item.domain));
      for (const row of await db.all('SELECT id, domain FROM certificates'))
        if (!keep.has(row.domain)) await db.run('DELETE FROM certificates WHERE id = ?', [row.id]);
      await warn();
    }
    return results;
  })();
  if (!domain) {
    running = task;
    task.finally(() => {
      running = null;
    });
  }
  return task;
}

const PROBLEMS = new Set(['warning', 'expired', 'error']);

async function warn() {
  if (!settings.get('caddy.monitor')) return;
  const rows = await db.all('SELECT * FROM certificates ORDER BY domain');
  const fresh = rows.filter((row) => PROBLEMS.has(row.status) && row.notified_state !== row.status);
  for (const row of rows.filter((item) => !PROBLEMS.has(item.status) && item.notified_state)) {
    await db.run('UPDATE certificates SET notified_state = NULL, notified_at = NULL WHERE id = ?', [row.id]);
  }
  if (!fresh.length) return;
  const lines = fresh.map((row) => `${row.domain}: ${row.error || row.status}`);
  log.warn('Probleme mit Zertifikaten', { domains: fresh.map((row) => row.domain).join(', ') });
  webhook.notify(
    'system',
    'Zertifikate',
    lines.map((line) => `**${line.split(':')[0]}**:${line.slice(line.indexOf(':') + 1)}`).join('\n'),
    'error'
  );
  await mail
    .notifyAdmins('system', (language) => {
      const t = (text, values) => translate(language, text, values);
      return {
        subject: t('Zertifikate brauchen Aufmerksamkeit'),
        title: t('Zertifikate brauchen Aufmerksamkeit'),
        paragraphs: [
          t('Bei diesen Domains stimmt mit dem HTTPS-Zertifikat etwas nicht:'),
          ...fresh.map((row) => `${row.domain}: ${t(row.error || row.status)}`),
        ],
        button: { label: t('Caddy öffnen'), url: `${settings.get('site.baseUrl')}/admin#caddy` },
        push: {
          body: t('Bei {domains} stimmt mit dem HTTPS-Zertifikat etwas nicht.', { domains: fresh.map((row) => row.domain).join(', ') }),
        },
      };
    })
    .catch(() => 0);
  const now = Date.now();
  for (const row of fresh)
    await db.run('UPDATE certificates SET notified_state = ?, notified_at = ? WHERE id = ?', [row.status, now, row.id]);
}

const recent = new Map();

async function recordRequest(domain, allowed, reason) {
  const name = String(domain || '')
    .toLowerCase()
    .slice(0, 253);
  const key = `${name}|${allowed ? 1 : 0}`;
  const now = Date.now();
  if (recent.has(key) && now - recent.get(key) < 10 * 60 * 1000) return false;
  recent.set(key, now);
  if (recent.size > 5000) for (const [entry, at] of recent) if (now - at > 10 * 60 * 1000) recent.delete(entry);
  await db.insertRow('tls_requests', { domain: name, allowed: allowed ? 1 : 0, reason, created_at: now });
  return true;
}

async function requests({ limit = 100 } = {}) {
  const rows = await db.all('SELECT * FROM tls_requests ORDER BY id DESC LIMIT ?', [Math.min(500, Math.max(1, limit))]);
  return rows.map((row) => ({
    id: Number(row.id),
    domain: row.domain,
    allowed: Boolean(Number(row.allowed)),
    reason: row.reason,
    at: Number(row.created_at),
  }));
}

async function prune() {
  await db.run('DELETE FROM tls_requests WHERE created_at < ?', [Date.now() - KEEP_REQUESTS_MS]);
  const total = await db.count('SELECT COUNT(*) FROM tls_requests');
  if (total > MAX_REQUESTS) {
    const cutoff = await db.get('SELECT id FROM tls_requests ORDER BY id DESC LIMIT 1 OFFSET ?', [MAX_REQUESTS]);
    if (cutoff) await db.run('DELETE FROM tls_requests WHERE id <= ?', [cutoff.id]);
  }
}

const siteAddress = (url) => {
  const host = hostOfUrl(url);
  if (!host) return null;
  return /^http:\/\//i.test(url) ? `http://${host}` : host;
};

function caddyfile({ mode = 'docker', email = '' } = {}) {
  const docker = mode === 'docker';
  const own = siteAddress(settings.get('site.baseUrl'));
  const main = docker ? '{$DOMAIN}' : own || 'localhost';
  const upstream = docker ? 'moeshare:3000' : `127.0.0.1:${config.port}`;
  const extras = settings
    .get('site.domains')
    .map(siteAddress)
    .filter((address) => address && address !== own && address !== main);
  const lines = ['{'];
  if (docker) lines.push('\tadmin :2019 {', '\t\torigins caddy:2019 localhost:2019', '\t}');
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) lines.push(`\temail ${email}`);
  lines.push('\ton_demand_tls {', `\t\task http://${upstream}/api/domains/tls`, '\t}', '}', '');
  lines.push(`${[main, ...extras].join(', ')} {`, `\treverse_proxy ${upstream}`, '}', '');
  if (settings.get('domains.enabled')) lines.push('https:// {', '\ttls {', '\t\ton_demand', '\t}', `\treverse_proxy ${upstream}`, '}', '');
  return lines.join('\n');
}

function start() {
  if (timer) return;
  const run = () => {
    prune().catch((error) => log.debug('Protokoll der Zertifikatsanfragen nicht aufgeräumt', { error }));
    if (!settings.get('caddy.monitor')) return;
    checkAll().catch((error) => log.debug('Zertifikate nicht geprüft', { error }));
  };
  setTimeout(run, 60 * 1000).unref();
  timer = setInterval(run, CHECK_EVERY_MS);
  timer.unref();
}

const isRunning = () => Boolean(running);

module.exports = {
  overview,
  adapt,
  load,
  certificates,
  checkAll,
  recordRequest,
  requests,
  caddyfile,
  start,
  isRunning,
  summarize,
  judge,
  domainsTargets: targets,
};
