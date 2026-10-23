'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { build } = require('./db/dialect');
const { TABLES, createSchema, createTable, createIndexes, addColumns, introspect } = require('./db/schema');
const { parseBerlinDate } = require('./format');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function columnsOf(db, table) {
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => row.name));
}

async function legacyAddColumns(db, table, definitions) {
  const existing = await columnsOf(db, table);
  for (const [name, definition] of definitions) {
    if (!existing.has(name)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

async function dropColumn(db, table, column) {
  if ((await columnsOf(db, table)).has(column)) await db.run(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

const hasTable = async (db, name) => Boolean(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));

const CONVERTED_PREFIX = 'public.';

async function adoptConvertedTables(db) {
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'public.%'");
  for (const { name } of tables) {
    const target = name.slice(CONVERTED_PREFIX.length);
    if (target && !(await hasTable(db, target))) await db.run(`ALTER TABLE "${name}" RENAME TO "${target}"`);
  }
}

const LEGACY = [
  {
    version: 1,
    name: 'Grundschema',
    async up(db) {
      await adoptConvertedTables(db);
      await db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          token TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'mitglied'
        )
      `);
      await db.run(`
        CREATE TABLE IF NOT EXISTS file_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          filename TEXT NOT NULL,
          creation_date TEXT NOT NULL,
          size_mb REAL NOT NULL,
          size_bytes INTEGER NOT NULL,
          dominant_color TEXT NOT NULL,
          resolution_width INTEGER NOT NULL,
          resolution_height INTEGER NOT NULL,
          views INTEGER NOT NULL DEFAULT 0
        )
      `);
      await legacyAddColumns(db, 'file_data', [['views', 'INTEGER NOT NULL DEFAULT 0']]);
      await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_users_token ON users(token)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_file_data_username_id ON file_data(username, id)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_file_data_username_filename ON file_data(username, filename)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_file_data_filename ON file_data(filename)');
    },
  },
  {
    version: 2,
    name: 'Anmeldung, Sitzungen, Einstellungen und Nutzerverwaltung',
    async up(db) {
      await legacyAddColumns(db, 'users', [
        ['status', "TEXT NOT NULL DEFAULT 'active'"],
        ['suspended_reason', 'TEXT'],
        ['quota_bytes', 'INTEGER'],
        ['max_file_bytes', 'INTEGER'],
        ['created_at', 'INTEGER'],
        ['last_login_at', 'INTEGER'],
        ['password_changed_at', 'INTEGER'],
        ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
        ['totp_secret', 'TEXT'],
        ['totp_enabled_at', 'INTEGER'],
        ['totp_last_step', 'INTEGER'],
        ['discord_id', 'TEXT'],
        ['discord_name', 'TEXT'],
        ['embed', 'TEXT'],
      ]);
      await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord ON users(discord_id) WHERE discord_id IS NOT NULL');

      await db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          persistent INTEGER NOT NULL DEFAULT 1,
          method TEXT NOT NULL,
          elevated_until INTEGER,
          ip TEXT,
          user_agent TEXT
        )
      `);
      await db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');

      await db.run(`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          hint TEXT NOT NULL,
          legacy INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER
        )
      `);
      await db.run('CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id)');

      await db.run(`
        CREATE TABLE IF NOT EXISTS recovery_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          used_at INTEGER
        )
      `);
      await db.run('CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id)');

      await db.run(`
        CREATE TABLE IF NOT EXISTS passkeys (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          public_key BLOB NOT NULL,
          counter INTEGER NOT NULL DEFAULT 0,
          transports TEXT,
          device_type TEXT,
          backed_up INTEGER NOT NULL DEFAULT 0,
          aaguid TEXT,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER
        )
      `);
      await db.run('CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id)');

      await db.run(`
        CREATE TABLE IF NOT EXISTS invites (
          code TEXT PRIMARY KEY,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER,
          max_uses INTEGER,
          uses INTEGER NOT NULL DEFAULT 0,
          role TEXT NOT NULL DEFAULT 'mitglied',
          quota_bytes INTEGER,
          max_file_bytes INTEGER,
          note TEXT
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          updated_by INTEGER
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          at INTEGER NOT NULL,
          user_id INTEGER,
          actor_id INTEGER,
          action TEXT NOT NULL,
          ip TEXT,
          details TEXT
        )
      `);
      await db.run('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, at)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)');

      const now = Date.now();
      const users = await db.all("SELECT id, token FROM users WHERE token IS NOT NULL AND token <> ''");
      for (const user of users) {
        const hash = sha256(user.token);
        if (!(await db.get('SELECT id FROM api_tokens WHERE token_hash = ?', [hash]))) {
          await db.run('INSERT INTO api_tokens (user_id, name, token_hash, hint, legacy, created_at) VALUES (?, ?, ?, ?, 1, ?)', [
            user.id,
            'ShareX (bisheriges Token)',
            hash,
            `${user.token.slice(0, 6)}…${user.token.slice(-4)}`,
            now,
          ]);
        }
      }
      await db.run("UPDATE users SET token = '' WHERE token <> ''");
      if (users.length > 0) {
        await db.run("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('auth.tokenLogin', 'true', ?)", [now]);
      }
    },
  },
  {
    version: 3,
    name: 'Kurzlebige Anmeldedaten in der Datenbank',
    async up(db) {
      await db.run(`
        CREATE TABLE IF NOT EXISTS ephemeral (
          kind TEXT NOT NULL,
          id TEXT NOT NULL,
          data TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY (kind, id)
        )
      `);
      await db.run('CREATE INDEX IF NOT EXISTS idx_ephemeral_expires ON ephemeral(expires_at)');
    },
  },
  {
    version: 4,
    name: 'Veraltete Spalten entfernt',
    async up(db) {
      await db.run('DROP INDEX IF EXISTS idx_users_token');
      await dropColumn(db, 'users', 'token');
      await dropColumn(db, 'file_data', 'size_mb');
    },
  },
  {
    version: 5,
    name: 'Anmeldung über Dienste, Rechtliches und Links',
    async up(db) {
      await db.run(`
        CREATE TABLE IF NOT EXISTS identities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          subject TEXT NOT NULL,
          name TEXT,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER
        )
      `);
      await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_subject ON identities(provider, subject)');
      await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id, provider)');

      if ((await columnsOf(db, 'users')).has('discord_id')) {
        await db.run(
          `INSERT OR IGNORE INTO identities (user_id, provider, subject, name, created_at)
           SELECT id, 'discord', discord_id, discord_name, ? FROM users WHERE discord_id IS NOT NULL AND discord_id <> ''`,
          [Date.now()]
        );
      }
      await db.run('DROP INDEX IF EXISTS idx_users_discord');
      await dropColumn(db, 'users', 'discord_id');
      await dropColumn(db, 'users', 'discord_name');

      await db.run(
        "INSERT OR IGNORE INTO settings (key, value, updated_at) SELECT 'site.links', value, updated_at FROM settings WHERE key = 'home.links'"
      );
      await db.run("DELETE FROM settings WHERE key = 'home.links'");
      await db.run("UPDATE settings SET value = ? WHERE key = 'site.favicon' AND value IN (?, ?, ?, ?)", [
        JSON.stringify('https://moeshare.eu/assets/img/logo.png'),
        ...['https', 'http']
          .flatMap((scheme) => [`${scheme}://moeshare.de`, `${scheme}://www.moeshare.de`])
          .map((origin) => JSON.stringify(`${origin}/assets/img/logo.png`)),
      ]);
    },
  },
];

const MIGRATIONS = [
  {
    version: 6,
    name: 'Alben, Tags, Links, Texte, Schutz und Speicherorte',
    async up(db) {
      const look = introspect(db);
      if ((await look.columns('settings')).has('key')) await db.run('ALTER TABLE settings RENAME COLUMN key TO name');
      await addColumns(db, 'users', ['preferences']);
      await addColumns(db, 'file_data', [
        'slug',
        'created_at',
        'storage',
        'expires_at',
        'password_hash',
        'max_views',
        'original_name',
        'title',
        'syntax',
        'variants',
      ]);
      const rows = await db.all('SELECT id, filename, slug, creation_date, created_at FROM file_data ORDER BY id');
      const used = new Set(rows.filter((row) => row.slug).map((row) => row.slug));
      const now = Date.now();
      for (const row of rows) {
        if (row.slug && row.created_at) continue;
        let slug = row.slug;
        if (!slug) {
          slug = used.has(row.filename) ? `${row.id}-${row.filename}` : row.filename;
          used.add(slug);
        }
        await db.run('UPDATE file_data SET slug = ?, created_at = ? WHERE id = ?', [
          slug,
          row.created_at || parseBerlinDate(row.creation_date) || now,
          row.id,
        ]);
      }
      for (const table of ['links', 'albums', 'album_files', 'file_tags']) await createTable(db, table);
      for (const table of TABLES) await createIndexes(db, table.name);
    },
  },
  {
    version: 7,
    name: 'Designs, eigene Domains, Papierkorb, Statistiken, Profile, Meldungen und E-Mail',
    async up(db) {
      await addColumns(db, 'users', ['email', 'email_verified_at', 'design', 'profile']);
      await addColumns(db, 'file_data', ['deleted_at', 'deleted_by', 'listed', 'blocked_at', 'blocked_reason']);
      await addColumns(db, 'albums', ['blocked_at', 'blocked_reason']);
      await addColumns(db, 'links', ['blocked_at', 'blocked_reason']);
      for (const table of ['user_domains', 'stats_daily', 'stats_sources', 'reports']) await createTable(db, table);
      for (const table of ['users', 'file_data']) await createIndexes(db, table);
    },
  },
  {
    version: 8,
    name: 'Versionen, gemeinsame Alben, fortsetzbare Uploads, Volltextsuche, Webhooks und Import',
    async up(db) {
      await addColumns(db, 'users', ['watermark']);
      await addColumns(db, 'file_data', ['sha256', 'deduped', 'warning', 'scan_status', 'version', 'version_at']);
      await addColumns(db, 'album_files', ['added_by']);
      for (const table of ['file_versions', 'album_members', 'upload_sessions', 'file_search', 'webhooks', 'redirects', 'import_map']) {
        await createTable(db, table);
      }
      await createIndexes(db, 'file_data');
      await db.run(
        'UPDATE album_files SET added_by = (SELECT a.user_id FROM albums a WHERE a.id = album_files.album_id) WHERE added_by IS NULL'
      );
    },
  },
];

const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

const timestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

async function usersTable(db) {
  if (db.client !== 'sqlite') return (await introspect(db).hasTable('users')) ? 'users' : null;
  for (const name of ['users', `${CONVERTED_PREFIX}users`]) if (await hasTable(db, name)) return name;
  return null;
}

async function hasUsers(db) {
  const table = await usersTable(db);
  if (!table) return false;
  return (await db.count(`SELECT COUNT(*) AS count FROM ${db.client === 'sqlite' ? `"${table}"` : table}`)) > 0;
}

async function backup(db, file, version, logger) {
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${path.basename(file, '.sqlite')}-${timestamp()}-v${version}.sqlite`);
  try {
    await db.run('VACUUM INTO ?', [target]);
    logger.info('Datenbank vor der Aktualisierung gesichert', { backup: path.relative(process.cwd(), target) });
  } catch (error) {
    if (!fs.existsSync(target)) throw error;
  }
  return target;
}

async function readVersion(db) {
  if (db.client === 'sqlite') return Number((await db.get('PRAGMA user_version')).user_version) || 0;
  if (!(await introspect(db).hasTable('moeshare_schema'))) return 0;
  const row = await db.get('SELECT version FROM moeshare_schema WHERE id = 1');
  return row ? Number(row.version) : 0;
}

async function writeVersion(db, version) {
  if (db.client === 'sqlite') {
    await db.run(`PRAGMA user_version = ${Number(version)}`);
    return;
  }
  await db.run(
    'CREATE TABLE IF NOT EXISTS moeshare_schema (id INTEGER NOT NULL PRIMARY KEY, version INTEGER NOT NULL, updated_at BIGINT NOT NULL)'
  );
  await db.upsert('moeshare_schema', { id: 1, version, updated_at: Date.now() }, ['id']);
}

async function atomically(exec, client, fn) {
  if (client === 'mysql') return fn();
  await exec(client === 'sqlite' ? 'BEGIN IMMEDIATE' : 'BEGIN');
  try {
    const result = await fn();
    await exec('COMMIT');
    return result;
  } catch (error) {
    await exec('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function migrate(adapter, { file, logger }) {
  return adapter.withLock(async (exec) => {
    const db = build(exec, adapter.client);
    const current = await readVersion(db);
    if (current >= LATEST_VERSION) return { from: current, to: current, backup: null };

    if (current === 0 && !(await hasUsers(db))) {
      const created = await atomically(exec, adapter.client, async () => {
        if ((await readVersion(db)) >= LATEST_VERSION) return false;
        if (adapter.client === 'sqlite' && (await usersTable(db))) return false;
        await createSchema(db);
        await writeVersion(db, LATEST_VERSION);
        return true;
      });
      if (created) {
        logger.info('Neue Datenbank angelegt', { version: LATEST_VERSION });
        return { from: 0, to: LATEST_VERSION, backup: null };
      }
    }

    const start = await readVersion(db);
    if (adapter.client !== 'sqlite' && start === 0) {
      throw new Error('Die Datenbank enthält schon Tabellen, die nicht von MoeShare stammen. Nimm eine leere Datenbank.');
    }
    const pending = [...(adapter.client === 'sqlite' ? LEGACY : []), ...MIGRATIONS].filter((migration) => migration.version > start);
    const copy =
      adapter.client === 'sqlite' && file && pending.length && (await hasUsers(db)) ? await backup(db, file, start, logger) : null;

    for (const migration of pending) {
      try {
        const applied = await atomically(exec, adapter.client, async () => {
          if ((await readVersion(db)) >= migration.version) return false;
          await migration.up(db);
          await writeVersion(db, migration.version);
          return true;
        });
        if (applied) logger.info(`Datenbank aktualisiert: ${migration.name}`, { version: migration.version });
      } catch (error) {
        error.message = `Migration v${migration.version} fehlgeschlagen: ${error.message}`;
        throw error;
      }
    }
    return { from: start, to: LATEST_VERSION, backup: copy };
  });
}

module.exports = { migrate, readVersion, LATEST_VERSION };
