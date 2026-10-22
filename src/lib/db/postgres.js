'use strict';

const { Pool, types } = require('pg');

types.setTypeParser(20, (value) => (value === null ? null : Number(value)));
types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

const LOCK_KEY = 726374658;

function positional(sql) {
  let out = '';
  let index = 0;
  let quote = null;
  for (const char of sql) {
    if (quote) {
      if (char === quote) quote = null;
      out += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      out += char;
    } else if (char === '?') {
      index += 1;
      out += `$${index}`;
    } else {
      out += char;
    }
  }
  return out;
}

const result = (response) => ({ rows: response.rows || [], changes: response.rowCount || 0, insertId: null });

class PostgresAdapter {
  constructor(options) {
    this.client = 'postgres';
    this.options = options;
    this.pool = null;
  }

  async open() {
    const { host, port, user, password, database, ssl } = this.options;
    this.pool = new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      application_name: 'moeshare',
    });
    this.pool.on('error', () => {});
    await this.pool.query('SELECT 1');
  }

  async query(sql, params = []) {
    return result(await this.pool.query(positional(sql), params));
  }

  async session(fn) {
    const client = await this.pool.connect();
    try {
      return await fn(async (sql, params = []) => result(await client.query(positional(sql), params)));
    } finally {
      client.release();
    }
  }

  transaction(fn) {
    return this.session(async (exec) => {
      await exec('BEGIN');
      try {
        const value = await fn(exec);
        await exec('COMMIT');
        return value;
      } catch (error) {
        await exec('ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  withLock(fn) {
    return this.session(async (exec) => {
      await exec('SELECT pg_advisory_lock(?)', [LOCK_KEY]);
      try {
        return await fn(exec);
      } finally {
        await exec('SELECT pg_advisory_unlock(?)', [LOCK_KEY]).catch(() => {});
      }
    });
  }

  async version() {
    const { rows } = await this.query('SHOW server_version');
    return `PostgreSQL ${String(rows[0].server_version).split(' ')[0]}`;
  }

  async close() {
    if (!this.pool) return;
    const pool = this.pool;
    this.pool = null;
    await pool.end();
  }
}

module.exports = PostgresAdapter;
module.exports.positional = positional;
