'use strict';

const fs = require('fs');
const sqlite3 = require('sqlite3');
const config = require('../config');
const logger = require('./logger');
const { migrate } = require('./migrations');

class Database {
  constructor(file) {
    fs.mkdirSync(config.paths.data, { recursive: true });
    this.file = file;
    this.connection = new sqlite3.Database(file);
    this.connection.configure('busyTimeout', 10000);
    this.active = 0;
    this.ready = this.init();
    this.ready.catch(() => {});
  }

  async init() {
    await this.run('PRAGMA journal_mode = WAL');
    await this.run('PRAGMA synchronous = NORMAL');
    await this.run('PRAGMA foreign_keys = ON');
    await migrate(this, { file: this.file, logger: logger.scope('db') });
    const { quick_check: check } = await this.get('PRAGMA quick_check');
    if (check !== 'ok') throw new Error(`Die Integritätsprüfung der Datenbank ist fehlgeschlagen: ${check}`);
  }

  track(executor) {
    this.active += 1;
    return new Promise(executor).finally(() => {
      this.active -= 1;
    });
  }

  run(sql, params = []) {
    return this.track((resolve, reject) => {
      this.connection.run(sql, params, function done(error) {
        if (error) reject(error);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return this.track((resolve, reject) => {
      this.connection.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
    });
  }

  all(sql, params = []) {
    return this.track((resolve, reject) => {
      this.connection.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
    });
  }

  async count(sql, params = []) {
    const row = await this.get(sql, params);
    return row ? Number(Object.values(row)[0]) || 0 : 0;
  }

  async close(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (this.active > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    return new Promise((resolve) => this.connection.close(() => resolve()));
  }
}

module.exports = new Database(config.paths.database);
