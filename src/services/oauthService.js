'use strict';

const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const ephemeral = require('../lib/ephemeral');
const { HttpError } = require('../lib/errors');
const { randomToken } = require('../lib/secrets');
const settings = require('./settingsService');

const STATE = 'oauth-state';
const SIGNUP = 'oauth-signup';
const STATE_TTL_MS = 10 * 60 * 1000;
const SIGNUP_TTL_MS = 15 * 60 * 1000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

const http = axios.create({ timeout: 10000, headers: { 'User-Agent': `MoeShare/${config.version}`, Accept: 'application/json' } });

const failure = (message, code) => new HttpError(400, message, { code });
const option = (provider, key) => settings.get(`auth.${provider}.${key}`);
const trimSlash = (url) => String(url || '').replace(/\/+$/, '');
const bearer = (token, accept = 'application/json') => ({ headers: { Authorization: `Bearer ${token}`, Accept: accept } });

async function discordProfile(tokens) {
  const { data } = await http.get(`${config.discord.api}/users/@me`, bearer(tokens.access_token));
  const profile = { subject: String(data.id), name: data.global_name || data.username, username: data.username };
  const guildId = option('discord', 'guildId');
  if (!guildId) return { profile, membership: null };
  try {
    const member = await http.get(`${config.discord.api}/users/@me/guilds/${guildId}/member`, bearer(tokens.access_token));
    return { profile, membership: { member: true, roles: Array.isArray(member.data.roles) ? member.data.roles.map(String) : [] } };
  } catch (error) {
    const status = error.response ? error.response.status : 0;
    if ([400, 403, 404].includes(status)) return { profile, membership: { member: false, roles: [] } };
    throw failure('Die Mitgliedschaft auf dem Discord-Server konnte nicht geprüft werden.', 'guild');
  }
}

function githubEndpoints() {
  const base = trimSlash(option('github', 'baseUrl'));
  const api = base === 'https://github.com' ? 'https://api.github.com' : `${base}/api/v3`;
  return { authorize: `${base}/login/oauth/authorize`, token: `${base}/login/oauth/access_token`, api };
}

async function githubProfile(tokens) {
  const { data } = await http.get(`${githubEndpoints().api}/user`, bearer(tokens.access_token, 'application/vnd.github+json'));
  return { profile: { subject: String(data.id), name: data.name || data.login, username: data.login } };
}

const PROVIDERS = {
  discord: {
    label: () => 'Discord',
    scopes: () => (option('discord', 'guildId') ? ['identify', 'guilds.members.read'] : ['identify']),
    endpoints: () => ({ authorize: config.discord.authorize, token: `${config.discord.api}/oauth2/token` }),
    extra: { prompt: 'none' },
    profile: discordProfile,
  },
  github: {
    label: () => 'GitHub',
    scopes: () => ['read:user'],
    endpoints: githubEndpoints,
    profile: githubProfile,
  },
  google: {
    label: () => 'Google',
    issuer: () => 'https://accounts.google.com',
    scopes: () => ['openid', 'profile', 'email'],
    extra: { prompt: 'select_account' },
  },
  microsoft: {
    label: () => 'Microsoft',
    issuer: () => `https://login.microsoftonline.com/${option('microsoft', 'tenant')}/v2.0`,
    scopes: () => ['openid', 'profile', 'email'],
    extra: { prompt: 'select_account' },
  },
  gitlab: {
    label: () => 'GitLab',
    issuer: () => trimSlash(option('gitlab', 'baseUrl')),
    scopes: () => ['openid', 'profile'],
  },
  oidc: {
    label: () => option('oidc', 'name') || 'SSO',
    issuer: () => trimSlash(option('oidc', 'issuer')),
    scopes: () => option('oidc', 'scopes').split(' '),
  },
};

const PROVIDER_KEYS = Object.keys(PROVIDERS);
const isKnown = (key) => PROVIDER_KEYS.includes(key);
const labelOf = (key) => PROVIDERS[key].label();
const redirectUri = (key) => `${settings.get('site.baseUrl')}/auth/${key}/callback`;

function isEnabled(key) {
  if (!isKnown(key) || !option(key, 'enabled') || !option(key, 'clientId') || !option(key, 'clientSecret')) return false;
  return !PROVIDERS[key].issuer || Boolean(PROVIDERS[key].issuer());
}

const enabled = () => PROVIDER_KEYS.filter(isEnabled).map((key) => ({ key, label: labelOf(key) }));
const allowsRegistration = (key) => isEnabled(key) && option(key, 'allowRegistration');
const registrationProviders = () => enabled().filter(({ key }) => option(key, 'allowRegistration'));
const redirectUris = () => Object.fromEntries(PROVIDER_KEYS.map((key) => [key, redirectUri(key)]));

const discovered = new Map();

async function discover(key) {
  const issuer = PROVIDERS[key].issuer();
  const cached = discovered.get(issuer);
  if (cached && cached.until > Date.now()) return cached.doc;
  let doc;
  try {
    ({ data: doc } = await http.get(`${issuer}/.well-known/openid-configuration`));
  } catch {
    throw failure(`${labelOf(key)} antwortet unter ${issuer} nicht wie ein OIDC-Anbieter.`, 'discovery');
  }
  if (!doc || !doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint) {
    throw failure(`Die OIDC-Konfiguration von ${labelOf(key)} ist unvollständig.`, 'discovery');
  }
  discovered.set(issuer, { doc, until: Date.now() + DISCOVERY_TTL_MS });
  return doc;
}

async function endpointsFor(key) {
  const provider = PROVIDERS[key];
  if (!provider.issuer) return provider.endpoints();
  const doc = await discover(key);
  return {
    authorize: doc.authorization_endpoint,
    token: doc.token_endpoint,
    userinfo: doc.userinfo_endpoint || null,
    issuer: doc.issuer,
    pkce: Array.isArray(doc.code_challenge_methods_supported) && doc.code_challenge_methods_supported.includes('S256'),
    basicAuth: prefersBasicAuth(doc.token_endpoint_auth_methods_supported),
  };
}

const prefersBasicAuth = (methods) => !Array.isArray(methods) || !methods.length || methods.includes('client_secret_basic');

const formEncode = (value) => encodeURIComponent(value).replace(/%20/g, '+');

async function begin(key, { intent, userId = null, invite = null, remember = true, next = null }) {
  if (!isEnabled(key)) throw failure(`Die Anmeldung mit ${isKnown(key) ? labelOf(key) : key} ist nicht aktiviert.`, 'disabled');
  const provider = PROVIDERS[key];
  const endpoints = await endpointsFor(key);
  const state = randomToken(24);
  const verifier = endpoints.pkce ? randomToken(48) : null;
  const nonce = provider.issuer ? randomToken(18) : null;
  await ephemeral.put(STATE, state, { provider: key, intent, userId, invite, remember, next, verifier, nonce }, STATE_TTL_MS);

  const query = new URLSearchParams({
    client_id: option(key, 'clientId'),
    response_type: 'code',
    redirect_uri: redirectUri(key),
    scope: provider.scopes().join(' '),
    state,
    ...(provider.extra || {}),
  });
  if (nonce) query.set('nonce', nonce);
  if (verifier) {
    query.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
    query.set('code_challenge_method', 'S256');
  }
  return { url: `${endpoints.authorize}${endpoints.authorize.includes('?') ? '&' : '?'}${query}`, state };
}

async function exchange(key, endpoints, code, verifier) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(key) });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (endpoints.basicAuth) {
    const credentials = `${formEncode(option(key, 'clientId'))}:${formEncode(option(key, 'clientSecret'))}`;
    headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
  } else {
    body.set('client_id', option(key, 'clientId'));
    body.set('client_secret', option(key, 'clientSecret'));
  }
  if (verifier) body.set('code_verifier', verifier);
  const rejected = (reason) =>
    failure(
      ['invalid_client', 'incorrect_client_credentials', 'unauthorized_client'].includes(reason)
        ? `${labelOf(key)} lehnt die Zugangsdaten ab. Prüfe Client-ID und Client-Secret in den Einstellungen.`
        : `${labelOf(key)} hat die Anmeldung nicht bestätigt. Bitte versuche es erneut.`,
      'token'
    );
  let data;
  try {
    ({ data } = await http.post(endpoints.token, body.toString(), { headers }));
  } catch (error) {
    throw rejected(error.response && error.response.data && error.response.data.error);
  }
  if (!data || data.error || !data.access_token) throw rejected(data && data.error);
  return data;
}

function claimsOf(idToken) {
  const part = String(idToken || '').split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function oidcProfile(key, tokens, endpoints, nonce) {
  const claims = claimsOf(tokens.id_token);
  const invalid = () => failure(`${labelOf(key)} hat kein gültiges ID-Token geliefert.`, 'token');
  if (!claims || !claims.sub) throw invalid();
  const issuer = endpoints.issuer.replace('{tenantid}', String(claims.tid || ''));
  const clientId = option(key, 'clientId');
  const audience = [].concat(claims.aud);
  const authorized = audience.includes(clientId) && (audience.length === 1 || !claims.azp || claims.azp === clientId);
  const fresh = Number(claims.exp) * 1000 > Date.now() - 60 * 1000;
  if (claims.iss !== issuer || !authorized || !fresh || claims.nonce !== nonce) throw invalid();

  let info = {};
  if (endpoints.userinfo) {
    try {
      const { data } = await http.get(endpoints.userinfo, bearer(tokens.access_token));
      if (data && String(data.sub) === String(claims.sub)) info = data;
    } catch {}
  }
  const merged = { ...claims, ...info };
  const username = merged.preferred_username || merged.nickname || (merged.email ? String(merged.email).split('@')[0] : '');
  return { profile: { subject: String(claims.sub), name: merged.name || username || labelOf(key), username } };
}

async function complete(key, { code, state }) {
  const flow = await ephemeral.take(STATE, state);
  if (!flow || flow.provider !== key) throw failure('Die Anmeldung ist abgelaufen. Bitte versuche es erneut.', 'expired');
  if (typeof code !== 'string' || !code) throw failure(`${labelOf(key)} hat keinen Code geliefert.`, 'denied');
  const provider = PROVIDERS[key];
  const endpoints = await endpointsFor(key);
  const tokens = await exchange(key, endpoints, code, flow.verifier);
  try {
    const result = provider.issuer ? await oidcProfile(key, tokens, endpoints, flow.nonce) : await provider.profile(tokens);
    return { flow, profile: result.profile, membership: result.membership || null };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw failure(`Dein Profil bei ${labelOf(key)} konnte nicht gelesen werden.`, 'profile');
  }
}

function meetsRequirements(key, membership) {
  if (key !== 'discord' || !option('discord', 'guildId')) return true;
  if (!membership || !membership.member) return false;
  const required = option('discord', 'roleIds');
  return required.length === 0 || membership.roles.some((role) => required.includes(role));
}

const membershipCountsAsInvite = (key) =>
  key === 'discord' && Boolean(option('discord', 'guildId')) && option('discord', 'guildSkipsInvite');

async function holdSignup(data) {
  const id = randomToken(18);
  await ephemeral.put(SIGNUP, id, data, SIGNUP_TTL_MS);
  return id;
}

const peekSignup = (id) => ephemeral.get(SIGNUP, id);
const dropSignup = (id) => ephemeral.remove(SIGNUP, id);

function suggestUsername(profile) {
  const base = String(profile.username || profile.name || '')
    .split('@')[0]
    .normalize('NFKD')
    .replace(/[^\w.-]/g, '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 32);
  return base.length >= 2 ? base : `nutzer${String(profile.subject).slice(-4)}`;
}

module.exports = {
  PROVIDER_KEYS,
  isKnown,
  isEnabled,
  labelOf,
  enabled,
  allowsRegistration,
  registrationProviders,
  redirectUris,
  begin,
  complete,
  meetsRequirements,
  membershipCountsAsInvite,
  holdSignup,
  peekSignup,
  dropSignup,
  suggestUsername,
};
