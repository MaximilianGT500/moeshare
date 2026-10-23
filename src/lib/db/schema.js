'use strict';

const col = (name, type, options = {}) => ({ name, type, ...options });
const id = () => col('id', 'id');
const userRef = (name = 'user_id', onDelete = 'CASCADE', notNull = true) =>
  col(name, 'bigint', { notNull, references: 'users(id)', onDelete });

const TABLES = [
  {
    name: 'users',
    columns: [
      id(),
      col('username', 'string', { length: 64, notNull: true }),
      col('password', 'text', { notNull: true }),
      col('role', 'string', { length: 16, notNull: true, default: 'mitglied' }),
      col('status', 'string', { length: 16, notNull: true, default: 'active' }),
      col('suspended_reason', 'text'),
      col('quota_bytes', 'bigint'),
      col('max_file_bytes', 'bigint'),
      col('created_at', 'bigint'),
      col('last_login_at', 'bigint'),
      col('password_changed_at', 'bigint'),
      col('must_change_password', 'int', { notNull: true, default: 0 }),
      col('totp_secret', 'text'),
      col('totp_enabled_at', 'bigint'),
      col('totp_last_step', 'bigint'),
      col('embed', 'longtext'),
      col('preferences', 'text'),
      col('email', 'string', { length: 191 }),
      col('email_verified_at', 'bigint'),
      col('design', 'longtext'),
      col('profile', 'text'),
      col('watermark', 'longtext'),
    ],
    indexes: [
      { name: 'idx_users_username', columns: ['username'], unique: true },
      { name: 'idx_users_email', columns: ['email'], unique: true },
    ],
  },
  {
    name: 'file_data',
    columns: [
      id(),
      col('username', 'string', { length: 64, notNull: true }),
      col('filename', 'string', { length: 255, notNull: true }),
      col('slug', 'string', { length: 255 }),
      col('creation_date', 'string', { length: 32, notNull: true }),
      col('created_at', 'bigint'),
      col('size_bytes', 'bigint', { notNull: true, default: 0 }),
      col('dominant_color', 'string', { length: 16, notNull: true, default: '#ffffff' }),
      col('resolution_width', 'int', { notNull: true, default: 0 }),
      col('resolution_height', 'int', { notNull: true, default: 0 }),
      col('views', 'int', { notNull: true, default: 0 }),
      col('storage', 'string', { length: 16, notNull: true, default: 'local' }),
      col('expires_at', 'bigint'),
      col('password_hash', 'text'),
      col('max_views', 'int'),
      col('original_name', 'string', { length: 255 }),
      col('title', 'string', { length: 255 }),
      col('syntax', 'string', { length: 32 }),
      col('variants', 'string', { length: 64 }),
      col('deleted_at', 'bigint'),
      col('deleted_by', 'bigint'),
      col('listed', 'int', { notNull: true, default: 0 }),
      col('blocked_at', 'bigint'),
      col('blocked_reason', 'string', { length: 200 }),
      col('sha256', 'string', { length: 64 }),
      col('deduped', 'int', { notNull: true, default: 0 }),
      col('warning', 'string', { length: 100 }),
      col('scan_status', 'string', { length: 16 }),
      col('version', 'int', { notNull: true, default: 1 }),
      col('version_at', 'bigint'),
    ],
    indexes: [
      { name: 'idx_file_data_username_id', columns: ['username', 'id'] },
      { name: 'idx_file_data_username_filename', columns: ['username', 'filename'] },
      { name: 'idx_file_data_filename', columns: ['filename'] },
      { name: 'idx_file_data_slug', columns: ['slug'], unique: true },
      { name: 'idx_file_data_expires', columns: ['expires_at'] },
      { name: 'idx_file_data_created', columns: ['created_at'] },
      { name: 'idx_file_data_deleted', columns: ['deleted_at'] },
      { name: 'idx_file_data_hash', columns: ['username', 'sha256'] },
    ],
  },
  {
    name: 'sessions',
    columns: [
      col('id', 'string', { length: 64, notNull: true }),
      userRef(),
      col('created_at', 'bigint', { notNull: true }),
      col('last_seen_at', 'bigint', { notNull: true }),
      col('expires_at', 'bigint', { notNull: true }),
      col('persistent', 'int', { notNull: true, default: 1 }),
      col('method', 'string', { length: 32, notNull: true }),
      col('elevated_until', 'bigint'),
      col('ip', 'string', { length: 64 }),
      col('user_agent', 'text'),
    ],
    primaryKey: ['id'],
    indexes: [
      { name: 'idx_sessions_user', columns: ['user_id'] },
      { name: 'idx_sessions_expires', columns: ['expires_at'] },
    ],
  },
  {
    name: 'api_tokens',
    columns: [
      id(),
      userRef(),
      col('name', 'string', { length: 100, notNull: true }),
      col('token_hash', 'string', { length: 64, notNull: true }),
      col('hint', 'string', { length: 64, notNull: true }),
      col('legacy', 'int', { notNull: true, default: 0 }),
      col('created_at', 'bigint', { notNull: true }),
      col('last_used_at', 'bigint'),
    ],
    indexes: [
      { name: 'idx_api_tokens_hash', columns: ['token_hash'], unique: true },
      { name: 'idx_api_tokens_user', columns: ['user_id'] },
    ],
  },
  {
    name: 'recovery_codes',
    columns: [id(), userRef(), col('code_hash', 'string', { length: 64, notNull: true }), col('used_at', 'bigint')],
    indexes: [{ name: 'idx_recovery_codes_user', columns: ['user_id'] }],
  },
  {
    name: 'passkeys',
    columns: [
      col('id', 'string', { length: 255, notNull: true }),
      userRef(),
      col('name', 'string', { length: 100, notNull: true }),
      col('public_key', 'blob', { notNull: true }),
      col('counter', 'bigint', { notNull: true, default: 0 }),
      col('transports', 'text'),
      col('device_type', 'string', { length: 32 }),
      col('backed_up', 'int', { notNull: true, default: 0 }),
      col('aaguid', 'string', { length: 64 }),
      col('created_at', 'bigint', { notNull: true }),
      col('last_used_at', 'bigint'),
    ],
    primaryKey: ['id'],
    indexes: [{ name: 'idx_passkeys_user', columns: ['user_id'] }],
  },
  {
    name: 'invites',
    columns: [
      col('code', 'string', { length: 64, notNull: true }),
      userRef('created_by', 'SET NULL', false),
      col('created_at', 'bigint', { notNull: true }),
      col('expires_at', 'bigint'),
      col('max_uses', 'int'),
      col('uses', 'int', { notNull: true, default: 0 }),
      col('role', 'string', { length: 16, notNull: true, default: 'mitglied' }),
      col('quota_bytes', 'bigint'),
      col('max_file_bytes', 'bigint'),
      col('note', 'text'),
    ],
    primaryKey: ['code'],
  },
  {
    name: 'settings',
    columns: [
      col('name', 'string', { length: 128, notNull: true }),
      col('value', 'longtext', { notNull: true }),
      col('updated_at', 'bigint', { notNull: true }),
      col('updated_by', 'bigint'),
    ],
    primaryKey: ['name'],
  },
  {
    name: 'audit_log',
    columns: [
      id(),
      col('at', 'bigint', { notNull: true }),
      col('user_id', 'bigint'),
      col('actor_id', 'bigint'),
      col('action', 'string', { length: 64, notNull: true }),
      col('ip', 'string', { length: 64 }),
      col('details', 'text'),
    ],
    indexes: [
      { name: 'idx_audit_user', columns: ['user_id', 'at'] },
      { name: 'idx_audit_at', columns: ['at'] },
    ],
  },
  {
    name: 'ephemeral',
    columns: [
      col('kind', 'string', { length: 32, notNull: true }),
      col('id', 'string', { length: 191, notNull: true }),
      col('data', 'longtext', { notNull: true }),
      col('expires_at', 'bigint', { notNull: true }),
    ],
    primaryKey: ['kind', 'id'],
    indexes: [{ name: 'idx_ephemeral_expires', columns: ['expires_at'] }],
  },
  {
    name: 'identities',
    columns: [
      id(),
      userRef(),
      col('provider', 'string', { length: 32, notNull: true }),
      col('subject', 'string', { length: 255, notNull: true }),
      col('name', 'string', { length: 255 }),
      col('created_at', 'bigint', { notNull: true }),
      col('last_used_at', 'bigint'),
    ],
    indexes: [
      { name: 'idx_identities_subject', columns: ['provider', 'subject'], unique: true },
      { name: 'idx_identities_user', columns: ['user_id', 'provider'], unique: true },
    ],
  },
  {
    name: 'links',
    columns: [
      id(),
      col('code', 'string', { length: 191, notNull: true }),
      col('url', 'text', { notNull: true }),
      userRef(),
      col('title', 'string', { length: 255 }),
      col('created_at', 'bigint', { notNull: true }),
      col('expires_at', 'bigint'),
      col('password_hash', 'text'),
      col('max_clicks', 'int'),
      col('clicks', 'int', { notNull: true, default: 0 }),
      col('last_clicked_at', 'bigint'),
      col('blocked_at', 'bigint'),
      col('blocked_reason', 'string', { length: 200 }),
    ],
    indexes: [
      { name: 'idx_links_code', columns: ['code'], unique: true },
      { name: 'idx_links_user', columns: ['user_id', 'id'] },
    ],
  },
  {
    name: 'albums',
    columns: [
      id(),
      col('code', 'string', { length: 191, notNull: true }),
      userRef(),
      col('title', 'string', { length: 120, notNull: true }),
      col('description', 'text'),
      col('visibility', 'string', { length: 16, notNull: true, default: 'link' }),
      col('password_hash', 'text'),
      col('cover_file_id', 'bigint'),
      col('created_at', 'bigint', { notNull: true }),
      col('updated_at', 'bigint', { notNull: true }),
      col('blocked_at', 'bigint'),
      col('blocked_reason', 'string', { length: 200 }),
    ],
    indexes: [
      { name: 'idx_albums_code', columns: ['code'], unique: true },
      { name: 'idx_albums_user', columns: ['user_id', 'id'] },
    ],
  },
  {
    name: 'album_files',
    columns: [
      col('album_id', 'bigint', { notNull: true, references: 'albums(id)', onDelete: 'CASCADE' }),
      col('file_id', 'bigint', { notNull: true, references: 'file_data(id)', onDelete: 'CASCADE' }),
      col('sort_order', 'int', { notNull: true, default: 0 }),
      col('added_at', 'bigint', { notNull: true }),
      col('added_by', 'bigint'),
    ],
    primaryKey: ['album_id', 'file_id'],
    indexes: [{ name: 'idx_album_files_file', columns: ['file_id'] }],
  },
  {
    name: 'file_tags',
    columns: [
      col('file_id', 'bigint', { notNull: true, references: 'file_data(id)', onDelete: 'CASCADE' }),
      col('tag', 'string', { length: 48, notNull: true }),
    ],
    primaryKey: ['file_id', 'tag'],
    indexes: [{ name: 'idx_file_tags_tag', columns: ['tag'] }],
  },
  {
    name: 'user_domains',
    columns: [
      id(),
      userRef(),
      col('domain', 'string', { length: 191, notNull: true }),
      col('token', 'string', { length: 64, notNull: true }),
      col('status', 'string', { length: 16, notNull: true, default: 'pending' }),
      col('created_at', 'bigint', { notNull: true }),
      col('verified_at', 'bigint'),
      col('checked_at', 'bigint'),
      col('error', 'text'),
    ],
    indexes: [
      { name: 'idx_user_domains_domain', columns: ['domain'], unique: true },
      { name: 'idx_user_domains_user', columns: ['user_id'] },
    ],
  },
  {
    name: 'stats_daily',
    columns: [
      col('kind', 'string', { length: 8, notNull: true }),
      col('ref_id', 'bigint', { notNull: true }),
      col('day', 'string', { length: 10, notNull: true }),
      col('views', 'int', { notNull: true, default: 0 }),
      col('downloads', 'int', { notNull: true, default: 0 }),
      col('direct', 'int', { notNull: true, default: 0 }),
      col('previews', 'int', { notNull: true, default: 0 }),
    ],
    primaryKey: ['kind', 'ref_id', 'day'],
    indexes: [{ name: 'idx_stats_daily_day', columns: ['day'] }],
  },
  {
    name: 'stats_sources',
    columns: [
      col('kind', 'string', { length: 8, notNull: true }),
      col('ref_id', 'bigint', { notNull: true }),
      col('source', 'string', { length: 100, notNull: true }),
      col('hits', 'int', { notNull: true, default: 0 }),
      col('last_at', 'bigint', { notNull: true }),
    ],
    primaryKey: ['kind', 'ref_id', 'source'],
    indexes: [{ name: 'idx_stats_sources_last', columns: ['last_at'] }],
  },
  {
    name: 'reports',
    columns: [
      id(),
      col('kind', 'string', { length: 16, notNull: true }),
      col('target', 'string', { length: 191, notNull: true }),
      col('target_id', 'bigint'),
      col('owner_id', 'bigint'),
      col('reason', 'string', { length: 32, notNull: true }),
      col('message', 'text'),
      col('contact', 'string', { length: 191 }),
      col('created_at', 'bigint', { notNull: true }),
      col('status', 'string', { length: 16, notNull: true, default: 'open' }),
      col('resolved_at', 'bigint'),
      col('resolved_by', 'bigint'),
      col('action', 'string', { length: 32 }),
      col('note', 'text'),
    ],
    indexes: [
      { name: 'idx_reports_status', columns: ['status', 'created_at'] },
      { name: 'idx_reports_target', columns: ['kind', 'target_id'] },
    ],
  },
  {
    name: 'file_versions',
    columns: [
      id(),
      col('file_id', 'bigint', { notNull: true, references: 'file_data(id)', onDelete: 'CASCADE' }),
      col('version', 'int', { notNull: true }),
      col('filename', 'string', { length: 255, notNull: true }),
      col('original_name', 'string', { length: 255 }),
      col('size_bytes', 'bigint', { notNull: true, default: 0 }),
      col('sha256', 'string', { length: 64 }),
      col('created_at', 'bigint', { notNull: true }),
      col('replaced_at', 'bigint', { notNull: true }),
      col('resolution_width', 'int', { notNull: true, default: 0 }),
      col('resolution_height', 'int', { notNull: true, default: 0 }),
      col('dominant_color', 'string', { length: 16, notNull: true, default: '#ffffff' }),
      col('storage', 'string', { length: 16, notNull: true, default: 'local' }),
      col('variants', 'string', { length: 64 }),
      col('note', 'string', { length: 32 }),
    ],
    indexes: [
      { name: 'idx_file_versions_file', columns: ['file_id', 'version'] },
      { name: 'idx_file_versions_filename', columns: ['filename'] },
    ],
  },
  {
    name: 'album_members',
    columns: [
      col('album_id', 'bigint', { notNull: true, references: 'albums(id)', onDelete: 'CASCADE' }),
      userRef(),
      col('role', 'string', { length: 16, notNull: true, default: 'contributor' }),
      col('added_at', 'bigint', { notNull: true }),
      col('added_by', 'bigint'),
    ],
    primaryKey: ['album_id', 'user_id'],
    indexes: [{ name: 'idx_album_members_user', columns: ['user_id'] }],
  },
  {
    name: 'upload_sessions',
    columns: [
      col('id', 'string', { length: 40, notNull: true }),
      userRef(),
      col('name', 'string', { length: 255, notNull: true }),
      col('size_bytes', 'bigint', { notNull: true }),
      col('received', 'bigint', { notNull: true, default: 0 }),
      col('file_id', 'bigint'),
      col('fingerprint', 'string', { length: 191 }),
      col('options', 'text'),
      col('created_at', 'bigint', { notNull: true }),
      col('updated_at', 'bigint', { notNull: true }),
      col('expires_at', 'bigint', { notNull: true }),
    ],
    primaryKey: ['id'],
    indexes: [
      { name: 'idx_upload_sessions_user', columns: ['user_id'] },
      { name: 'idx_upload_sessions_expires', columns: ['expires_at'] },
    ],
  },
  {
    name: 'file_search',
    columns: [
      col('file_id', 'bigint', { notNull: true, references: 'file_data(id)', onDelete: 'CASCADE' }),
      col('body', 'longtext', { notNull: true }),
      col('folded', 'longtext', { notNull: true }),
      col('indexed_at', 'bigint', { notNull: true }),
    ],
    primaryKey: ['file_id'],
  },
  {
    name: 'webhooks',
    columns: [
      id(),
      col('name', 'string', { length: 80, notNull: true }),
      col('kind', 'string', { length: 16, notNull: true }),
      col('config', 'text', { notNull: true }),
      col('events', 'text', { notNull: true }),
      col('enabled', 'int', { notNull: true, default: 1 }),
      col('created_at', 'bigint', { notNull: true }),
      col('updated_at', 'bigint', { notNull: true }),
      col('last_at', 'bigint'),
      col('last_status', 'int'),
      col('last_error', 'text'),
    ],
  },
  {
    name: 'redirects',
    columns: [
      col('path', 'string', { length: 191, notNull: true }),
      col('kind', 'string', { length: 8, notNull: true }),
      col('target_id', 'bigint', { notNull: true }),
      col('variant', 'string', { length: 16, notNull: true, default: 'view' }),
      col('source', 'string', { length: 40 }),
      col('created_at', 'bigint', { notNull: true }),
    ],
    primaryKey: ['path'],
    indexes: [{ name: 'idx_redirects_target', columns: ['kind', 'target_id'] }],
  },
  {
    name: 'import_map',
    columns: [
      col('source', 'string', { length: 40, notNull: true }),
      col('kind', 'string', { length: 12, notNull: true }),
      col('source_id', 'string', { length: 120, notNull: true }),
      col('target_id', 'bigint', { notNull: true }),
      col('created_at', 'bigint', { notNull: true }),
    ],
    primaryKey: ['source', 'kind', 'source_id'],
  },
];

const TABLE = Object.fromEntries(TABLES.map((table) => [table.name, table]));

const TYPES = {
  sqlite: { string: () => 'TEXT', text: 'TEXT', longtext: 'TEXT', int: 'INTEGER', bigint: 'INTEGER', real: 'REAL', blob: 'BLOB' },
  postgres: {
    string: (length) => `VARCHAR(${length})`,
    text: 'TEXT',
    longtext: 'TEXT',
    int: 'INTEGER',
    bigint: 'BIGINT',
    real: 'DOUBLE PRECISION',
    blob: 'BYTEA',
  },
  mysql: {
    string: (length) => `VARCHAR(${length})`,
    text: 'TEXT',
    longtext: 'MEDIUMTEXT',
    int: 'INT',
    bigint: 'BIGINT',
    real: 'DOUBLE',
    blob: 'BLOB',
  },
};

const literal = (value) => (typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`);

function columnType(client, column) {
  const type = TYPES[client][column.type];
  return typeof type === 'function' ? type(column.length) : type;
}

function columnSql(client, column, { inline = true } = {}) {
  if (column.type === 'id') {
    if (client === 'sqlite') return `${column.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
    if (client === 'postgres') return `${column.name} BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`;
    return `${column.name} BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY`;
  }
  const parts = [column.name, columnType(client, column)];
  if (column.notNull) parts.push('NOT NULL');
  if (column.default !== undefined) parts.push(`DEFAULT ${literal(column.default)}`);
  if (inline && column.references && client !== 'mysql') {
    parts.push(`REFERENCES ${column.references} ON DELETE ${column.onDelete || 'CASCADE'}`);
  }
  return parts.join(' ');
}

function createTableSql(client, table) {
  const lines = table.columns.map((column) => columnSql(client, column));
  if (table.primaryKey) lines.push(`PRIMARY KEY (${table.primaryKey.join(', ')})`);
  if (client === 'mysql') {
    for (const column of table.columns.filter((c) => c.references)) {
      lines.push(
        `CONSTRAINT fk_${table.name}_${column.name} FOREIGN KEY (${column.name}) REFERENCES ${column.references} ON DELETE ${column.onDelete || 'CASCADE'}`
      );
    }
  }
  const body = `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${lines.join(',\n  ')}\n)`;
  return client === 'mysql' ? `${body} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin` : body;
}

function introspect(q) {
  const { client } = q;
  return {
    async hasTable(name) {
      if (client === 'sqlite') return Boolean(await q.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));
      if (client === 'postgres') {
        return Boolean(
          await q.get('SELECT 1 AS found FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?', [name])
        );
      }
      return Boolean(
        await q.get('SELECT 1 AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [name])
      );
    },
    async columns(name) {
      if (client === 'sqlite') return new Set((await q.all(`PRAGMA table_info("${name}")`)).map((row) => row.name));
      const schema = client === 'postgres' ? 'current_schema()' : 'DATABASE()';
      const rows = await q.all(
        `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = ?`,
        [name]
      );
      return new Set(rows.map((row) => row.name || row.NAME || row.COLUMN_NAME));
    },
    async hasIndex(table, index) {
      if (client === 'sqlite') return Boolean(await q.get("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?", [index]));
      if (client === 'postgres')
        return Boolean(await q.get('SELECT 1 AS found FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ?', [index]));
      return Boolean(
        await q.get(
          'SELECT 1 AS found FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
          [table, index]
        )
      );
    },
  };
}

async function createIndexes(q, tableName) {
  const table = TABLE[tableName];
  const look = introspect(q);
  if (!(await look.hasTable(table.name))) return;
  const existing = await look.columns(table.name);
  for (const index of table.indexes || []) {
    if (!index.columns.every((column) => existing.has(column))) continue;
    const unique = index.unique ? 'UNIQUE ' : '';
    if (q.client === 'mysql') {
      if (!(await look.hasIndex(table.name, index.name))) {
        await q.run(`CREATE ${unique}INDEX ${index.name} ON ${table.name} (${index.columns.join(', ')})`);
      }
    } else {
      await q.run(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${table.name} (${index.columns.join(', ')})`);
    }
  }
}

async function createTable(q, tableName) {
  await q.run(createTableSql(q.client, TABLE[tableName]));
  await createIndexes(q, tableName);
}

async function addColumns(q, tableName, names) {
  const table = TABLE[tableName];
  const existing = await introspect(q).columns(tableName);
  for (const name of names) {
    if (existing.has(name)) continue;
    const column = table.columns.find((candidate) => candidate.name === name);
    if (!column) throw new Error(`Spalte ${tableName}.${name} ist im Schema nicht beschrieben.`);
    await q.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql(q.client, column, { inline: q.client === 'sqlite' })}`);
  }
}

async function createSchema(q) {
  for (const table of TABLES) await createTable(q, table.name);
}

module.exports = { TABLES, TABLE, createSchema, createTable, createIndexes, addColumns, introspect, createTableSql };
