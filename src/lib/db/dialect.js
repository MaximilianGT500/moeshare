'use strict';

const placeholders = (count) => Array.from({ length: count }, () => '?').join(', ');

function conflictSql(client, keys, update) {
  if (client === 'mysql') {
    return update.length ? ` ON DUPLICATE KEY UPDATE ${update.map((column) => `${column} = VALUES(${column})`).join(', ')}` : null;
  }
  const action = update.length ? `UPDATE SET ${update.map((column) => `${column} = excluded.${column}`).join(', ')}` : 'NOTHING';
  return ` ON CONFLICT (${keys.join(', ')}) DO ${action}`;
}

function insertSql(client, table, columns, { ignore = false } = {}) {
  const values = `(${columns.join(', ')}) VALUES (${placeholders(columns.length)})`;
  if (!ignore) return `INSERT INTO ${table} ${values}`;
  if (client === 'sqlite') return `INSERT OR IGNORE INTO ${table} ${values}`;
  if (client === 'mysql') return `INSERT IGNORE INTO ${table} ${values}`;
  return `INSERT INTO ${table} ${values} ON CONFLICT DO NOTHING`;
}

function upsertSql(client, table, columns, keys, update) {
  const conflict = conflictSql(client, keys, update);
  if (conflict === null) return insertSql(client, table, columns, { ignore: true });
  return `${insertSql(client, table, columns)}${conflict}`;
}

function incrementSql(client, table, keys, counters, assigned) {
  const columns = [...keys, ...counters, ...assigned];
  const insert = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders(columns.length)})`;
  if (client === 'mysql') {
    const updates = [
      ...counters.map((column) => `${column} = ${column} + VALUES(${column})`),
      ...assigned.map((column) => `${column} = VALUES(${column})`),
    ];
    return `${insert} ON DUPLICATE KEY UPDATE ${updates.join(', ')}`;
  }
  const updates = [
    ...counters.map((column) => `${column} = ${table}.${column} + excluded.${column}`),
    ...assigned.map((column) => `${column} = excluded.${column}`),
  ];
  return `${insert} ON CONFLICT (${keys.join(', ')}) DO UPDATE SET ${updates.join(', ')}`;
}

const returningId = (client, sql) => (client === 'postgres' ? `${sql} RETURNING id` : sql);

function normalize(params = []) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (value === true) return 1;
    if (value === false) return 0;
    return value;
  });
}

function build(exec, client) {
  const query = (sql, params) => exec(sql, normalize(params));
  const api = {
    client,
    query,
    async run(sql, params) {
      const { changes } = await query(sql, params);
      return { changes };
    },
    async get(sql, params) {
      return (await query(sql, params)).rows[0];
    },
    async all(sql, params) {
      return (await query(sql, params)).rows;
    },
    async count(sql, params) {
      const row = (await query(sql, params)).rows[0];
      return row ? Number(Object.values(row)[0]) || 0 : 0;
    },
    async insert(sql, params) {
      const response = await query(returningId(client, sql), params);
      const id = response.insertId != null ? response.insertId : response.rows[0] && response.rows[0].id;
      return id == null ? null : Number(id);
    },
    async insertRow(table, row) {
      const columns = Object.keys(row);
      return api.insert(
        insertSql(client, table, columns),
        columns.map((column) => row[column])
      );
    },
    async upsert(table, row, keys, update = Object.keys(row).filter((column) => !keys.includes(column))) {
      const columns = Object.keys(row);
      return api.run(
        upsertSql(client, table, columns, keys, update),
        columns.map((column) => row[column])
      );
    },
    async insertIgnore(table, row) {
      const columns = Object.keys(row);
      return api.run(
        insertSql(client, table, columns, { ignore: true }),
        columns.map((column) => row[column])
      );
    },
    async increment(table, keys, counters, assigned = {}) {
      const keyNames = Object.keys(keys);
      const counterNames = Object.keys(counters);
      const assignedNames = Object.keys(assigned);
      return api.run(incrementSql(client, table, keyNames, counterNames, assignedNames), [
        ...keyNames.map((name) => keys[name]),
        ...counterNames.map((name) => counters[name]),
        ...assignedNames.map((name) => assigned[name]),
      ]);
    },
    escapeLike(text) {
      return String(text).replace(/[!%_]/g, (char) => `!${char}`);
    },
  };
  return api;
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === 'SQLITE_CONSTRAINT' && /UNIQUE|PRIMARY KEY/i.test(error.message)) return true;
  return error.code === '23505' || error.code === 'ER_DUP_ENTRY' || error.errno === 1062;
}

module.exports = { build, insertSql, upsertSql, normalize, placeholders, isUniqueViolation };
