'use strict';

const { TABLES } = require('./schema');
const { insertSql } = require('./dialect');

const BATCH = 400;
const SINGLE_KEY = new Set(TABLES.filter((table) => table.columns.some((column) => column.type === 'id')).map((table) => table.name));

const encode = (value) => {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { $b64: Buffer.from(value).toString('base64') };
  if (typeof value === 'bigint') return Number(value);
  return value;
};

const decode = (value) =>
  value && typeof value === 'object' && typeof value.$b64 === 'string' ? Buffer.from(value.$b64, 'base64') : value;

const columnsOf = (table) => table.columns.map((column) => column.name);
const keyOf = (table) => (SINGLE_KEY.has(table.name) ? ['id'] : table.primaryKey);

async function* readTable(db, table) {
  const columns = columnsOf(table).join(', ');
  if (SINGLE_KEY.has(table.name)) {
    let last = -1;
    for (;;) {
      const rows = await db.all(`SELECT ${columns} FROM ${table.name} WHERE id > ? ORDER BY id LIMIT ?`, [last, BATCH]);
      if (!rows.length) return;
      last = rows[rows.length - 1].id;
      yield rows;
      if (rows.length < BATCH) return;
    }
  }
  const order = keyOf(table).join(', ');
  for (let offset = 0; ; offset += BATCH) {
    const rows = await db.all(`SELECT ${columns} FROM ${table.name} ORDER BY ${order} LIMIT ? OFFSET ?`, [BATCH, offset]);
    if (!rows.length) return;
    yield rows;
    if (rows.length < BATCH) return;
  }
}

async function counts(db) {
  const result = {};
  for (const table of TABLES) result[table.name] = await db.count(`SELECT COUNT(*) FROM ${table.name}`);
  return result;
}

const CONTENT = ['users', 'file_data', 'links', 'albums', 'invites', 'api_tokens', 'passkeys', 'identities'];

async function isEmpty(db) {
  for (const name of CONTENT) if ((await db.count(`SELECT COUNT(*) FROM ${name}`)) > 0) return false;
  return true;
}

function guard() {
  const known = { users: new Set(), file_data: new Set(), albums: new Set() };
  const references = {
    sessions: [['user_id', 'users']],
    api_tokens: [['user_id', 'users']],
    recovery_codes: [['user_id', 'users']],
    passkeys: [['user_id', 'users']],
    identities: [['user_id', 'users']],
    links: [['user_id', 'users']],
    albums: [['user_id', 'users']],
    album_files: [
      ['album_id', 'albums'],
      ['file_id', 'file_data'],
    ],
    file_tags: [['file_id', 'file_data']],
    user_domains: [['user_id', 'users']],
    file_versions: [['file_id', 'file_data']],
    album_members: [
      ['album_id', 'albums'],
      ['user_id', 'users'],
    ],
    upload_sessions: [['user_id', 'users']],
    file_search: [['file_id', 'file_data']],
  };
  return {
    accept(tableName, row) {
      for (const [column, target] of references[tableName] || []) {
        if (!known[target].has(Number(row[column]))) return false;
      }
      if (tableName === 'invites' && row.created_by !== null && row.created_by !== undefined && !known.users.has(Number(row.created_by))) {
        row.created_by = null;
      }
      if (
        tableName === 'albums' &&
        row.cover_file_id !== null &&
        row.cover_file_id !== undefined &&
        !known.file_data.has(Number(row.cover_file_id))
      ) {
        row.cover_file_id = null;
      }
      if (known[tableName]) known[tableName].add(Number(row.id));
      return true;
    },
  };
}

function valueOf(column, row) {
  const value = row[column.name];
  if (value === undefined || (value === null && column.notNull && column.default !== undefined)) {
    return column.default !== undefined ? column.default : null;
  }
  return decode(value);
}

async function writeRows(tx, table, rows) {
  if (!rows.length) return;
  const columns = columnsOf(table);
  const single = insertSql(tx.client, table.name, columns);
  const head = single.slice(0, single.indexOf(' VALUES ') + 8);
  const group = `(${columns.map(() => '?').join(', ')})`;
  await tx.run(
    `${head}${rows.map(() => group).join(', ')}`,
    rows.flatMap((row) => table.columns.map((column) => valueOf(column, row)))
  );
}

async function resetSequences(db) {
  if (db.client !== 'postgres') return;
  for (const name of SINGLE_KEY) {
    await db.get(`SELECT setval(pg_get_serial_sequence('${name}', 'id'), COALESCE((SELECT MAX(id) FROM ${name}), 0) + 1, false) AS value`);
  }
}

async function importTables(target, source, { onTable } = {}) {
  const check = guard();
  const written = {};
  for (const table of TABLES) {
    let count = 0;
    let skipped = 0;
    await target.transaction(async (tx) => {
      for await (const batch of source(table)) {
        const rows = batch.filter((row) => {
          const ok = check.accept(table.name, row);
          if (!ok) skipped += 1;
          return ok;
        });
        await writeRows(tx, table, rows);
        count += rows.length;
      }
    });
    written[table.name] = count;
    if (onTable) onTable(table.name, count, skipped);
  }
  await resetSequences(target);
  return written;
}

async function copyDatabase(from, to, { onTable } = {}) {
  if (!(await isEmpty(to))) throw new Error('Die Ziel-Datenbank enthält schon Daten. Nimm eine leere Datenbank.');
  await clearTables(to);
  const written = await importTables(to, (table) => readTable(from, table), { onTable });
  const after = await counts(to);
  for (const [name, count] of Object.entries(written)) {
    if (after[name] !== count) throw new Error(`Tabelle ${name}: ${count} Zeilen kopiert, aber ${after[name]} in der Ziel-Datenbank.`);
  }
  return written;
}

async function clearTables(db) {
  await db.transaction(async (tx) => {
    for (const table of [...TABLES].reverse()) await tx.run(`DELETE FROM ${table.name}`);
  });
}

module.exports = { TABLES, readTable, importTables, copyDatabase, counts, isEmpty, clearTables, encode, decode };
