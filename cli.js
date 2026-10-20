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
  rl.setPrompt(question);
  rl.prompt();
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

const COMMANDS = { register, token, reset };

async function main() {
  const command = COMMANDS[process.argv[2]];
  if (!command) {
    say(`Verwendung: ${process.env.MOESHARE_COMMAND || 'node cli.js'} <register|token|reset>`);
    say('  register  Konto anlegen');
    say('  token     neues API-Token für ShareX erstellen');
    say('  reset     Notfallzugang: Passwort, Rolle, 2FA, Passkeys oder Tokens zurücksetzen');
    process.exit(1);
  }
  await db.ready;
  await settings.load();
  await command();
  if (prompt) prompt.close();
  await db.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(logger.paint('error', `\n${error.message}\n`));
  process.exit(1);
});
