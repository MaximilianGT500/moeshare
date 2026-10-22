'use strict';

const path = require('path');

const CLIENTS = {
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  file: 'sqlite',
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  mysql: 'mysql',
  mariadb: 'mysql',
};

const DEFAULT_PORTS = { postgres: 5432, mysql: 3306 };
const LABELS = { sqlite: 'SQLite', postgres: 'PostgreSQL', mysql: 'MySQL/MariaDB' };

function sslOption(params) {
  const mode = String(params.get('sslmode') || params.get('ssl') || '').toLowerCase();
  if (!mode || mode === 'disable' || mode === 'false' || mode === '0') return false;
  if (mode === 'verify-full' || mode === 'verify-ca' || mode === 'verify') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

function parseDatabaseUrl(value, root) {
  const text = String(value || '').trim();
  const scheme = /^([a-z0-9+]+):/i.exec(text);
  const client = scheme ? CLIENTS[scheme[1].toLowerCase()] : null;
  if (!client) {
    throw new Error('Die Datenbank-Adresse muss mit sqlite:, postgres:// oder mysql:// beginnen.');
  }
  if (client === 'sqlite') {
    let file = text.slice(scheme[0].length).replace(/^\/\//, '').split('?')[0];
    if (/^\/[A-Za-z]:[\\/]/.test(file)) file = file.slice(1);
    if (!file) throw new Error('In der SQLite-Adresse fehlt der Dateipfad.');
    return { client, file: path.resolve(root, decodeURIComponent(file)), url: text };
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Die Datenbank-Adresse ist ungültig.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !database) throw new Error('In der Datenbank-Adresse fehlen Server oder Datenbankname.');
  return {
    client,
    url: text,
    host: url.hostname,
    port: Number(url.port) || DEFAULT_PORTS[client],
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: sslOption(url.searchParams),
  };
}

function maskUrl(text) {
  return String(text || '').replace(/^([a-z0-9+]+:\/\/[^:/@]*):[^@/]*@/i, '$1:***@');
}

function describe(options, root = null) {
  if (options.client === 'sqlite') {
    const relative = root ? path.relative(root, options.file) : '';
    const shown = relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative.split(path.sep).join('/') : options.file;
    return `${LABELS.sqlite} (${shown})`;
  }
  return `${LABELS[options.client]} ${options.user ? `${options.user}@` : ''}${options.host}:${options.port}/${options.database}`;
}

module.exports = { parseDatabaseUrl, maskUrl, describe, LABELS };
