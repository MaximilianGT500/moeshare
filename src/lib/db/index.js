'use strict';

const config = require('../../config');
const logger = require('../logger');
const { migrate } = require('../migrations');
const { build, isUniqueViolation } = require('./dialect');
const { describe } = require('./url');

const log = logger.scope('db');

const ADAPTERS = {
  sqlite: () => require('./sqlite'),
  postgres: () => require('./postgres'),
  mysql: () => require('./mysql'),
};

async function openDatabase(options) {
  const Adapter = ADAPTERS[options.client]();
  const adapter = new Adapter(options);
  await adapter.open();
  if (adapter.pool && typeof adapter.pool.on === 'function') {
    adapter.pool.on('error', (error) => log.warn('Verbindung zur Datenbank unterbrochen', { error }));
  }
  try {
    await migrate(adapter, { file: options.file, logger: log });
    if (adapter.client === 'sqlite') {
      const { rows } = await adapter.query('PRAGMA quick_check');
      const check = rows[0] && rows[0].quick_check;
      if (check !== 'ok') throw new Error(`Die Integritätsprüfung der Datenbank ist fehlgeschlagen: ${check}`);
    }
  } catch (error) {
    await adapter.close().catch(() => {});
    throw error;
  }
  return adapter;
}

const METHODS = ['run', 'get', 'all', 'count', 'insert', 'insertRow', 'upsert', 'insertIgnore', 'increment'];

class Database {
  constructor(options) {
    this.options = options;
    this.adapter = null;
    this.active = 0;
    this.api = build((sql, params) => this.exec(sql, params), options.client);
    this.ready = this.init();
    this.ready.catch(() => {});
    for (const method of METHODS) this[method] = (...args) => this.api[method](...args);
  }

  async init() {
    if (this.options.error) throw new Error(this.options.error);
    this.adapter = await openDatabase(this.options);
  }

  get client() {
    return this.adapter ? this.adapter.client : this.options.client;
  }

  escapeLike(text) {
    return this.api.escapeLike(text);
  }

  isUniqueViolation(error) {
    return isUniqueViolation(error);
  }

  async exec(sql, params) {
    await this.ready;
    this.active += 1;
    try {
      return await this.adapter.query(sql, params);
    } finally {
      this.active -= 1;
    }
  }

  async transaction(fn) {
    await this.ready;
    this.active += 1;
    try {
      return await this.adapter.transaction((exec) => fn(build(exec, this.adapter.client)));
    } finally {
      this.active -= 1;
    }
  }

  describe() {
    return describe(this.options, config.paths.root);
  }

  async info() {
    await this.ready;
    return { client: this.client, label: this.describe(), version: await this.adapter.version(), source: this.options.source };
  }

  async replace(options) {
    await this.ready;
    const next = await openDatabase(options);
    const previous = this.adapter;
    this.adapter = next;
    this.options = options;
    this.api = build((sql, params) => this.exec(sql, params), next.client);
    const deadline = Date.now() + 3000;
    while (this.active > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    await previous.close().catch(() => {});
  }

  async close(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (this.active > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    if (this.adapter) await this.adapter.close().catch(() => {});
  }
}

module.exports = new Database(config.database);
module.exports.openDatabase = openDatabase;
module.exports.Database = Database;
