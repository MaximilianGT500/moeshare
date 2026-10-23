'use strict';

const mysql = require('mysql2/promise');

const LOCK_NAME = 'moeshare_migrate';

function result([response]) {
  if (Array.isArray(response)) return { rows: response, changes: 0, insertId: null };
  return { rows: [], changes: response.affectedRows || 0, insertId: response.insertId || null };
}

class MysqlAdapter {
  constructor(options) {
    this.client = 'mysql';
    this.options = options;
    this.pool = null;
  }

  async open() {
    const { host, port, user, password, database, ssl } = this.options;
    this.pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      ssl: ssl || undefined,
      connectionLimit: 10,
      waitForConnections: true,
      enableKeepAlive: true,
      charset: 'utf8mb4',
      timezone: 'Z',
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
    await this.pool.query('SELECT 1');
  }

  async query(sql, params = []) {
    return result(await this.pool.query(sql, params));
  }

  async session(fn) {
    const connection = await this.pool.getConnection();
    try {
      return await fn(async (sql, params = []) => result(await connection.query(sql, params)));
    } finally {
      connection.release();
    }
  }

  transaction(fn) {
    return this.session(async (exec) => {
      await exec('START TRANSACTION');
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
      const { rows } = await exec('SELECT GET_LOCK(?, 120) AS locked', [LOCK_NAME]);
      if (!rows[0] || Number(rows[0].locked) !== 1)
        throw new Error('Die Datenbank ist gerade durch einen anderen MoeShare-Prozess gesperrt.');
      try {
        return await fn(exec);
      } finally {
        await exec('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
      }
    });
  }

  async version() {
    const { rows } = await this.query('SELECT VERSION() AS version');
    const version = String(rows[0].version);
    return /mariadb/i.test(version) ? `MariaDB ${version.split('-')[0]}` : `MySQL ${version.split('-')[0]}`;
  }

  async close() {
    if (!this.pool) return;
    const pool = this.pool;
    this.pool = null;
    await pool.end();
  }
}

module.exports = MysqlAdapter;
