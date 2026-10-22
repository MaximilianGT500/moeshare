'use strict';

const readline = require('readline');
const logger = require('./src/lib/logger');
const db = require('./src/lib/db');
const settings = require('./src/services/settingsService');
const users = require('./src/services/userService');
const sessions = require('./src/services/sessionService');
const tokens = require('./src/services/tokenService');
const totp = require('./src/services/totpService');
const passkeys = require('./src/services/passkeyService');
const audit = require('./src/services/auditService');

const say = (text) => console.log(logger.paint('bold', text));

const interactive = Boolean(process.stdin.isTTY);
const lines = [];
let prompt = null;
let closed = false;
let muted = false;
let pending = null;

function input() {
  if (prompt) return prompt;
  prompt = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
  const write = prompt._writeToOutput.bind(prompt);
  prompt._writeToOutput = (text) => {
    if (!muted) write(text);
  };
  prompt.on('line', (line) => {
    if (!pending) return lines.push(line);
    const { resolve } = pending;
    pending = null;
    return resolve(line);
  });
  prompt.on('close', () => {
    closed = true;
    if (pending) pending.reject(new Error('Abgebrochen.'));
    pending = null;
  });
  return prompt;
}

async function ask(question, { hidden = false } = {}) {
  const rl = input();
  if (closed) {
    process.stdout.write(question);
  } else {
    rl.setPrompt(question);
    rl.prompt();
  }
  muted = hidden;
  try {
    if (lines.length) return lines.shift();
    if (closed) throw new Error('Abgebrochen.');
    return await new Promise((resolve, reject) => {
      pending = { resolve, reject };
    });
  } finally {
    if (muted || !interactive) process.stdout.write('\n');
    muted = false;
  }
}

const yes = async (question) => ['ja', 'j', 'yes', 'y'].includes((await ask(`${question} (ja/nein): `)).trim().toLowerCase());

async function findUser() {
  const user = await users.findByName((await ask('Benutzername: ')).trim());
  if (!user) throw new Error('Diesen Benutzer gibt es nicht.');
  return user;
}

async function register() {
  say('\nNeues Konto anlegen. Mit Strg+C brichst du ab.\n');
  const username = (await ask('Benutzername: ')).trim();
  const password = await ask(`Passwort (mindestens ${settings.get('auth.passwordMinLength')} Zeichen): `, { hidden: true });
  if (password !== (await ask('Passwort wiederholen: ', { hidden: true }))) throw new Error('Die Passwörter stimmen nicht überein.');
  const role = (await yes('Admin-Rechte vergeben?')) ? 'admin' : 'mitglied';
  const user = await users.create({ username, password, role });
  const { token } = await tokens.create(user.id, 'ShareX');
  audit.log('user_created', { userId: user.id, actorId: null, details: { via: 'cli', role } });
  say(`\n${user.username} ist angelegt (${role === 'admin' ? 'Admin' : 'Mitglied'}). Anmeldung: ${settings.get('site.baseUrl')}/login`);
  say(`API-Token für ShareX (wird nur jetzt angezeigt):\n${token}\n`);
}

async function token() {
  say('\nNeues API-Token erstellen. Bestehende Tokens bleiben gültig.\n');
  const user = await users.findByName((await ask('Benutzername: ')).trim());
  if (!(await users.verifyPassword(user, await ask('Passwort: ', { hidden: true }))))
    throw new Error('Benutzername oder Passwort ist falsch.');
  if (user.status !== 'active') throw new Error('Dieses Konto ist gesperrt.');
  const created = await tokens.create(user.id, 'Kommandozeile');
  audit.log('token_created', { userId: user.id, details: { name: created.record.name, via: 'cli' } });
  say(`\nNeues Token für ${user.username} (wird nur jetzt angezeigt):\n${created.token}\n`);
}

async function reset() {
  say('\nNotfallzugang: Konto zurücksetzen. Leere Eingaben lassen den Wert unverändert.\n');
  const user = await findUser();
  const done = [];

  const password = await ask('Neues Passwort (leer = unverändert): ', { hidden: true });
  if (password) {
    await users.setPassword(user.id, password);
    done.push('Passwort geändert');
  }
  const role = (await ask(`Rolle (admin/mitglied, leer = ${user.role}): `)).trim().toLowerCase();
  const lastAdmin = user.role === 'admin' && user.status === 'active' && (await users.countActiveAdmins()) <= 1;
  if (users.ROLES.includes(role) && role !== user.role && lastAdmin) {
    say('Die Rolle bleibt admin, weil es sonst keinen aktiven Admin mehr gäbe.');
  } else if (users.ROLES.includes(role) && role !== user.role) {
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, user.id]);
    done.push(`Rolle: ${role}`);
  }
  if (user.status !== 'active' && (await yes('Das Konto ist gesperrt. Entsperren?'))) {
    await db.run("UPDATE users SET status = 'active', suspended_reason = NULL WHERE id = ?", [user.id]);
    done.push('entsperrt');
  }
  if (user.totp_enabled_at && (await yes('Zwei-Faktor-Anmeldung abschalten?'))) {
    await totp.disable(user.id);
    done.push('2FA abgeschaltet');
  }
  if ((await passkeys.listForUser(user.id)).length && (await yes('Alle Passkeys entfernen?'))) {
    await passkeys.removeAll(user.id);
    done.push('Passkeys entfernt');
  }
  if (await yes('Alle API-Tokens widerrufen? ShareX braucht danach ein neues Token.')) {
    await tokens.revokeAll(user.id);
    done.push('API-Tokens widerrufen');
  }

  if (!done.length) return say('\nNichts geändert.\n');
  await sessions.revokeAll(user.id);
  await audit.log('password_reset', { userId: user.id, actorId: null, details: { via: 'cli', changes: done } });
  return say(`\n${user.username}: ${done.join(', ')}. Alle Sitzungen wurden beendet.\n`);
}

const args = process.argv.slice(3);
const option = (...names) => args.some((arg) => names.includes(arg));
const positional = () => args.filter((arg) => !arg.startsWith('--'));
const program = process.env.MOESHARE_COMMAND || 'node cli.js';

async function databaseInfo() {
  const info = await db.info();
  const { counts } = require('./src/lib/db/transfer');
  say(`\n${info.label}`);
  say(`${info.version}, Quelle: ${{ env: 'DATABASE_URL', file: 'db/database.json', default: 'Standard' }[info.source] || info.source}\n`);
  for (const [table, count] of Object.entries(await counts(db))) console.log(`  ${table.padEnd(16)} ${count}`);
  console.log('');
}

async function copyDatabase() {
  const [url] = positional();
  if (!url)
    throw new Error(
      `Verwendung: ${program} copy-db <ziel-adresse> [--use]\nBeispiel: ${program} copy-db postgres://moeshare:passwort@localhost:5432/moeshare --use`
    );
  const config = require('./src/config');
  const { parseDatabaseUrl, describe, maskUrl } = require('./src/lib/db/url');
  const { Database } = require('./src/lib/db');
  const { copyDatabase: copy } = require('./src/lib/db/transfer');
  const target = parseDatabaseUrl(url, config.paths.root);
  if (target.client === db.client && describe(target, config.paths.root) === db.describe())
    throw new Error('Quelle und Ziel sind dieselbe Datenbank.');
  say(`\nVon: ${db.describe()}\nNach: ${describe(target, config.paths.root)}`);
  say('Beende MoeShare vorher, damit während des Kopierens nichts verloren geht.\n');
  const destination = new Database({ ...target, source: 'cli' });
  await destination.ready;
  const started = Date.now();
  try {
    const written = await copy(db, destination, {
      onTable: (table, count, skipped) =>
        console.log(`  ${table.padEnd(16)} ${count}${skipped ? ` (${skipped} verwaiste Einträge übersprungen)` : ''}`),
    });
    const total = Object.values(written).reduce((sum, count) => sum + count, 0);
    say(`\n${total} Einträge in ${Math.round((Date.now() - started) / 100) / 10} s kopiert.`);
  } finally {
    await destination.close();
  }
  if (option('--use')) {
    const fs = require('fs');
    fs.writeFileSync(config.databaseFile, `${JSON.stringify({ url: target.url }, null, 2)}\n`, { mode: 0o600 });
    say(`MoeShare nutzt ab dem nächsten Start die neue Datenbank (gespeichert in db/database.json).`);
    if (process.env.DATABASE_URL) say('Achtung: DATABASE_URL ist gesetzt und hat Vorrang. Passe die Variable an oder entferne sie.');
  } else {
    say(`Damit MoeShare die neue Datenbank nutzt, setze DATABASE_URL=${maskUrl(target.url)} oder starte den Befehl mit --use.`);
  }
  console.log('');
}

async function backup() {
  const backups = require('./src/services/backupService');
  say('\nSicherung wird erstellt …');
  const result = await backups.create({ includeUploads: option('--uploads', '--dateien'), reason: 'manual', actor: 'Kommandozeile' });
  say(
    `Fertig: ${result.name} (${require('./src/lib/format').formatBytes(result.size)}, ${result.location === 's3' ? 'in S3' : 'in db/backups'}).\n`
  );
}

async function restore() {
  const [file] = positional();
  if (!file) throw new Error(`Verwendung: ${program} restore <datei> [--force] [--ohne-dateien]`);
  const path = require('path');
  const backups = require('./src/services/backupService');
  const resolved = path.isAbsolute(file) || require('fs').existsSync(file) ? path.resolve(file) : path.join(backups.directory(), file);
  say(`\nSicherung wird eingespielt: ${resolved}`);
  say('Beende MoeShare vorher und starte es danach neu.\n');
  const result = await backups.restore(resolved, {
    force: option('--force'),
    uploads: !option('--ohne-dateien', '--without-files'),
    onStep: (step) => console.log(`  ${step}`),
  });
  say(`\nWiederhergestellt: Sicherung vom ${result.manifest.createdAt} (MoeShare ${result.manifest.version}), ${result.files} Dateien.\n`);
}

async function moveStorage() {
  const [to] = positional();
  if (!['s3', 'local', 'lokal'].includes(to)) throw new Error(`Verwendung: ${program} storage <s3|lokal>`);
  const storage = require('./src/services/storageService');
  const target = to === 'lokal' ? 'local' : to;
  say(`\nDateien werden ${target === 's3' ? 'nach S3' : 'in den lokalen Ordner uploads'} verschoben …`);
  let last = 0;
  const result = await storage.migrate(target, {
    onProgress: (progress) => {
      if (Date.now() - last > 1000 || progress.done === progress.total) {
        last = Date.now();
        console.log(`  ${progress.done}/${progress.total}`);
      }
    },
  });
  say(`\n${result.moved} verschoben, ${result.failed} fehlgeschlagen, ${result.missing} ohne lokale Datei.\n`);
  if (result.failed) process.exitCode = 1;
}

const COMMANDS = { register, token, reset, db: databaseInfo, 'copy-db': copyDatabase, backup, restore, storage: moveStorage };

async function main() {
  const command = COMMANDS[process.argv[2]];
  if (!command) {
    say(`Verwendung: ${program} <befehl>`);
    say('  register             Konto anlegen');
    say('  token                neues API-Token für ShareX erstellen');
    say('  reset                Notfallzugang: Passwort, Rolle, 2FA, Passkeys oder Tokens zurücksetzen');
    say('  db                   zeigt die genutzte Datenbank und ihre Einträge');
    say('  copy-db <adresse>    kopiert alle Daten in eine andere Datenbank (--use stellt direkt um)');
    say('  backup               erstellt eine Sicherung in db/backups (--uploads nimmt die Dateien mit)');
    say('  restore <datei>      spielt eine Sicherung ein (--force überschreibt, --ohne-dateien nur die Datenbank)');
    say('  storage <s3|lokal>   verschiebt vorhandene Dateien nach S3 oder zurück');
    process.exit(1);
  }
  await db.ready;
  await settings.load();
  await command();
  if (prompt && !closed) prompt.close();
  await db.close();
  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error(logger.paint('error', `\n${error.message}\n`));
  process.exit(1);
});
