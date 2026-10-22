'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

for (const file of [...new Set([path.join(root, '.env'), path.join(process.cwd(), '.env')])]) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const env = process.env;
const pkg = require('../package.json');

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const LOG_FORMATS = ['text', 'json'];

const option = (name, allowed, fallback) => {
  const value = String(env[name] || '')
    .trim()
    .toLowerCase();
  if (!value) return { value: fallback, invalid: null };
  if (allowed.includes(value)) return { value, invalid: null };
  return { value: fallback, invalid: `${name}=${env[name]} ist unbekannt (erlaubt: ${allowed.join(', ')}), verwendet wird ${fallback}.` };
};

const logLevel = option('LOG_LEVEL', LOG_LEVELS, 'info');
const logFormat = option('LOG_FORMAT', LOG_FORMATS, 'text');

const colorPreference = () => {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return null;
};

const PROJECT_DSN = 'https://462365ce49a643f6b8269646dc173020@app.glitchtip.com/28998';
const DISABLED = ['off', 'false', '0', 'none', 'aus'];

function parseDsn(value) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    const project = segments.pop();
    if (!/^https?:$/.test(url.protocol) || !url.username || !/^\d+$/.test(project || '')) return null;
    const base = `${url.origin}${segments.map((segment) => `/${segment}`).join('')}/api/${project}`;
    return { key: url.username, store: `${base}/store/`, security: `${base}/security/?glitchtip_key=${url.username}` };
  } catch {
    return null;
  }
}

function glitchtipTarget() {
  const value = String(env.GLITCHTIP_DSN || '').trim();
  if (!value) return { target: { ...parseDsn(PROJECT_DSN), source: 'project' }, problem: null };
  if (DISABLED.includes(value.toLowerCase())) return { target: null, problem: null };
  const parsed = parseDsn(value);
  if (parsed) return { target: { ...parsed, source: 'custom' }, problem: null };
  return { target: null, problem: 'GLITCHTIP_DSN ist keine gültige DSN (https://schlüssel@host/projekt), Fehlerberichte bleiben aus.' };
}

const glitchtip = glitchtipTarget();

const DATABASE_FILE = path.join(root, 'db', 'database.json');
const DEFAULT_DATABASE = path.join(root, 'db', 'datenbank.sqlite');

function databaseOptions() {
  const { parseDatabaseUrl } = require('./lib/db/url');
  let url = String(env.DATABASE_URL || '').trim();
  let source = url ? 'env' : 'default';
  if (!url) {
    try {
      const stored = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      if (stored && typeof stored.url === 'string' && stored.url.trim()) {
        url = stored.url.trim();
        source = 'file';
      }
    } catch {}
  }
  if (!url) return { client: 'sqlite', file: DEFAULT_DATABASE, source };
  try {
    return { ...parseDatabaseUrl(url, root), source };
  } catch (error) {
    return {
      client: 'sqlite',
      file: DEFAULT_DATABASE,
      source,
      error: `${source === 'env' ? 'DATABASE_URL' : 'db/database.json'}: ${error.message}`,
    };
  }
}

function githubRepository(url) {
  const match = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url || '');
  return match ? `${match[1]}/${match[2]}` : null;
}

module.exports = {
  version: pkg.version,
  repository: githubRepository(pkg.repository && pkg.repository.url),
  port: Number.parseInt(env.PORT, 10) || 3000,
  devServer: (env.UI_DEV_SERVER || '').replace(/\/+$/, ''),
  allowPrivateFetch: env.URL_FETCH_ALLOW_PRIVATE === 'true',
  glitchtip: glitchtip.target,
  database: databaseOptions(),
  databaseFile: DATABASE_FILE,
  defaultDatabase: DEFAULT_DATABASE,
  ffmpegPath: String(env.FFMPEG_PATH || '').trim() || null,
  dnsServers: String(env.DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean),
  log: {
    level: logLevel.value,
    format: logFormat.value,
    color: colorPreference(),
    problems: [logLevel.invalid, logFormat.invalid, glitchtip.problem].filter(Boolean),
  },
  discord: {
    api: (env.DISCORD_API_BASE || 'https://discord.com/api').replace(/\/+$/, ''),
    authorize: env.DISCORD_AUTHORIZE_URL || 'https://discord.com/oauth2/authorize',
  },
  paths: {
    root,
    uploads: path.join(root, 'uploads'),
    data: path.join(root, 'db'),
    secret: path.join(root, 'db', '.secret'),
    public: path.join(root, 'public'),
    ui: path.join(root, 'public', 'app'),
  },
};
