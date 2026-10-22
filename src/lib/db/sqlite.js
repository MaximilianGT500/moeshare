'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const ROWS = /^\s*(SELECT|WITH|PRAGMA|VALUES|EXPLAIN)\b|\bRETURNING\b/i;

class SqliteAdapter {
  constructor({ file }) {
    this.client = 'sqlite';
    this.file = file;
    this.connection = null;
    this.gate = null;
  }

  async open() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.connection = await new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(this.file, (error) => (error ? reject(error) : resolve(connection)));
    });
    this.connection.configure('busyTimeout', 10000);
    await this.raw('PRAGMA journal_mode = WAL');
    await this.raw('PRAGMA synchronous = NORMAL');
    await this.raw('PRAGMA foreign_keys = ON');
  }

  raw(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (ROWS.test(sql)) {
        this.connection.all(sql, params, (error, rows) => (error ? reject(error) : resolve({ rows, changes: 0, insertId: null })));
        return;
      }
      this.connection.run(sql, params, function done(error) {
        if (error) reject(error);
        else resolve({ rows: [], changes: this.changes, insertId: this.lastID });
      });
    });
  }

  async query(sql, params) {
    while (this.gate) await this.gate;
    return this.raw(sql, params);
  }

  async exclusive(fn) {
    while (this.gate) await this.gate;
    let release;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    try {
      return await fn((sql, params) => this.raw(sql, params));
    } finally {
      this.gate = null;
      release();
    }
  }

  transaction(fn) {
    return this.exclusive(async (exec) => {
      await exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(exec);
        await exec('COMMIT');
        return result;
      } catch (error) {
        await exec('ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  withLock(fn) {
    return this.exclusive(fn);
  }

  async version() {
    const { rows } = await this.query('SELECT sqlite_version() AS version');
    return `SQLite ${rows[0].version}`;
  }

  async close() {
    if (!this.connection) return;
    const connection = this.connection;
    this.connection = null;
    await new Promise((resolve) => connection.close(() => resolve()));
  }
}

module.exports = SqliteAdapter;
