'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../lib/db');
const logger = require('../lib/logger');
const media = require('../lib/media');
const { translate } = require('../lib/i18n');
const { formatBytes } = require('../lib/format');
const settings = require('./settingsService');
const storage = require('./storageService');
const scans = require('./scanService');
const mail = require('./mailService');
const backups = require('./backupService');
const caddy = require('./caddyService');
const pulse = require('./pulseService');
const updates = require('./updateService');

const fsp = fs.promises;
const log = logger.scope('doctor');

const TIMEOUT_MS = 10000;
const CACHE_MS = 60 * 1000;
const MIN_FREE_BYTES = 2 * 1024 ** 3;
const LOW_FREE_BYTES = 512 * 1024 ** 2;
const SLOW_QUERY_MS = 200;
const CLOCK_SKEW_MS = 2 * 60 * 1000;

let last = null;

const within = (promise, ms = TIMEOUT_MS) =>
  Promise.race([promise, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms).unref())]);

function result(id, status, title, detail = '', hint = '', params = {}) {
  return { id, status, title, detail, hint, params };
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function localHost(url) {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function checkAddress(req) {
  const base = settings.get('site.baseUrl');
  if (!req) return result('address', 'info', 'Adresse', 'Eingetragen ist {base}.', '', { base });
  const seen = `${req.protocol}://${req.get('host')}`;
  const known = [base, ...settings.get('site.domains')].map(originOf).filter(Boolean);
  if (known.includes(originOf(seen)) || req.customDomain)
    return result('address', 'ok', 'Adresse', 'Aufgerufen über {seen}.', '', { seen });
  return result(
    'address',
    'warn',
    'Adresse',
    'Eingetragen ist {base}, aufgerufen wurde {seen}.',
    'Trag unter Admin › Einstellungen › Allgemein die Adresse ein, unter der MoeShare erreichbar ist. Sonst zeigen Links auf die falsche Seite.',
    { base, seen }
  );
}

function checkHttps(req) {
  const base = settings.get('site.baseUrl');
  if (/^https:/i.test(base)) {
    if (req && !req.secure && !localHost(base)) {
      return result(
        'https',
        'warn',
        'HTTPS',
        'Die Adresse beginnt mit https, die Anfrage kam aber unverschlüsselt an.',
        'Schalte unter Admin › Einstellungen › System „Hinter einem Reverse-Proxy“ ein, wenn ein Reverse-Proxy HTTPS übernimmt.'
      );
    }
    return result('https', 'ok', 'HTTPS', 'Verbindungen sind verschlüsselt.');
  }
  if (localHost(base)) return result('https', 'info', 'HTTPS', 'Läuft lokal ohne HTTPS.');
  return result(
    'https',
    'error',
    'HTTPS',
    'Die Adresse beginnt mit http. Passwörter und Sitzungen gehen unverschlüsselt durchs Netz.',
    'Stell einen Reverse-Proxy wie Caddy davor und trag die Adresse mit https ein.'
  );
}

function checkProxy(req) {
  const trusted = Boolean(settings.get('system.trustProxy'));
  if (!req) return result('proxy', 'info', 'Reverse-Proxy', trusted ? 'Hinter einem Proxy: an.' : 'Hinter einem Proxy: aus.');
  const forwarded = Boolean(req.get('x-forwarded-for'));
  if (forwarded && !trusted) {
    return result(
      'proxy',
      'error',
      'Reverse-Proxy',
      'Ein Proxy leitet die Anfragen weiter, MoeShare vertraut ihm aber nicht. Alle Besucher haben dann dieselbe Adresse.',
      'Schalte unter Admin › Einstellungen › System „Hinter einem Reverse-Proxy“ ein. Sonst greifen Anmeldesperren und Grenzen für alle zugleich.'
    );
  }
  if (!forwarded && trusted) {
    return result(
      'proxy',
      'warn',
      'Reverse-Proxy',
      '„Hinter einem Reverse-Proxy“ ist an, die Anfrage kam aber direkt an.',
      'Läuft MoeShare ohne Proxy, schalte die Einstellung aus. Sonst lassen sich Adressen fälschen.'
    );
  }
  return result(
    'proxy',
    'ok',
    'Reverse-Proxy',
    forwarded ? 'Die Anfragen kommen über einen Proxy, dem MoeShare vertraut.' : 'Kein Proxy davor.'
  );
}

async function checkDisk() {
  const stats = await fsp.statfs(config.paths.uploads).catch(() => null);
  if (!stats) return result('disk', 'warn', 'Speicherplatz', 'Der freie Platz ließ sich nicht ermitteln.');
  const total = Number(stats.blocks) * Number(stats.bsize);
  const free = Number(stats.bavail) * Number(stats.bsize);
  const share = total ? free / total : 1;
  const params = { free: formatBytes(free), total: formatBytes(total), percent: Math.round(share * 100) };
  if (free < LOW_FREE_BYTES || share < 0.01) {
    return result(
      'disk',
      'error',
      'Speicherplatz',
      'Nur noch {free} von {total} frei.',
      'Lösche alte Dateien oder vergrößere den Speicher, bevor Uploads scheitern.',
      params
    );
  }
  if (free < MIN_FREE_BYTES || share < 0.05) {
    return result('disk', 'warn', 'Speicherplatz', 'Noch {free} von {total} frei ({percent} %).', 'Plane bald mehr Platz ein.', params);
  }
  return result('disk', 'ok', 'Speicherplatz', '{free} von {total} frei ({percent} %).', '', params);
}

async function writable(dir) {
  const probe = path.join(dir, `.moeshare-check-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(probe, 'ok');
    await fsp.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function checkFolders() {
  const failed = [];
  for (const [label, dir] of [
    ['uploads', config.paths.uploads],
    ['db', config.paths.data],
  ]) {
    if (!(await writable(dir))) failed.push(label);
  }
  if (failed.length) {
    return result(
      'folders',
      'error',
      'Schreibrechte',
      'In {folders} darf MoeShare nicht schreiben.',
      'Gib dem Benutzer, unter dem MoeShare läuft, Schreibrechte, etwa mit chown.',
      { folders: failed.join(', ') }
    );
  }
  return result('folders', 'ok', 'Schreibrechte', 'MoeShare darf in uploads und db schreiben.');
}

function checkFfmpeg() {
  if (media.ffmpegAvailable) return result('ffmpeg', 'ok', 'FFmpeg', 'Version {version}.', '', { version: media.ffmpegVersion || '?' });
  return result(
    'ffmpeg',
    'warn',
    'FFmpeg',
    'FFmpeg fehlt. Ohne gibt es keine Videovorschauen, Wellenformen, Cover und kein Kürzen von Videos.',
    'Installiere ffmpeg oder setze FFMPEG_PATH. Im Docker-Image ist es schon dabei.'
  );
}

async function checkClamav() {
  if (!settings.get('clamav.enabled')) return result('clamav', 'info', 'Virenscan', 'Der Virenscan ist aus.');
  try {
    const found = await within(scans.test());
    if (!found.detects) {
      return result(
        'clamav',
        'error',
        'Virenscan',
        'ClamAV antwortet, erkennt aber die Testdatei nicht.',
        'Prüf, ob die Virensignaturen aktuell sind.'
      );
    }
    return result('clamav', 'ok', 'Virenscan', 'ClamAV antwortet in {ms} ms.', '', { ms: found.ms });
  } catch (error) {
    return result(
      'clamav',
      'error',
      'Virenscan',
      'ClamAV ist nicht erreichbar: {error}',
      'Prüf Adresse und Port unter Admin › Einstellungen › Virenscan.',
      {
        error: error.message,
      }
    );
  }
}

async function checkMail() {
  if (!settings.get('mail.enabled'))
    return result('mail', 'info', 'E-Mail', 'E-Mails sind aus. „Passwort vergessen“ und Hinweise per E-Mail gehen nicht.');
  if (!mail.ready())
    return result(
      'mail',
      'warn',
      'E-Mail',
      'E-Mails sind an, aber Mailserver oder Absender fehlen.',
      'Trag beides unter Admin › Einstellungen › E-Mail ein.'
    );
  try {
    await within(mail.verify());
    return result('mail', 'ok', 'E-Mail', 'Der Mailserver nimmt die Anmeldung an.');
  } catch (error) {
    return result(
      'mail',
      'error',
      'E-Mail',
      'Der Mailserver antwortet nicht wie erwartet: {error}',
      'Prüf Server, Port, Verschlüsselung und Zugangsdaten.',
      {
        error: error.message,
      }
    );
  }
}

async function checkS3() {
  if (storage.activeDriver() !== 's3') return result('s3', 'info', 'Speicher', 'Dateien liegen auf der Festplatte.');
  try {
    await within(storage.testConnection());
    return result('s3', 'ok', 'Speicher', 'Der S3-Speicher antwortet.');
  } catch (error) {
    return result('s3', 'error', 'Speicher', 'Der S3-Speicher antwortet nicht: {error}', 'Prüf Endpunkt, Bucket und Zugangsschlüssel.', {
      error: error.message,
    });
  }
}

async function checkDatabase() {
  try {
    const info = await within(db.info());
    const times = [];
    for (let round = 0; round < 3; round += 1) {
      const started = process.hrtime.bigint();
      await db.get('SELECT 1 AS ok', []);
      times.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    const ms = Math.round(Math.min(...times) * 10) / 10;
    const params = { label: info.label, version: info.version || '?', ms };
    if (ms > SLOW_QUERY_MS) {
      return result(
        'database',
        'warn',
        'Datenbank',
        '{label} {version} antwortet langsam ({ms} ms).',
        'Liegt die Datenbank weit weg oder ist der Server ausgelastet?',
        params
      );
    }
    return result('database', 'ok', 'Datenbank', '{label} {version}, Antwort in {ms} ms.', '', params);
  } catch (error) {
    return result('database', 'error', 'Datenbank', 'Die Datenbank antwortet nicht: {error}', '', { error: error.message });
  }
}

function checkClock(clientNow) {
  const now = Number(clientNow);
  if (!Number.isFinite(now) || now <= 0) return null;
  const skew = Math.abs(Date.now() - now);
  if (skew > CLOCK_SKEW_MS) {
    return result(
      'clock',
      'warn',
      'Uhrzeit',
      'Die Uhr des Servers weicht um {minutes} Minuten von deinem Gerät ab.',
      'Schalte die Zeitsynchronisation ein, etwa mit systemd-timesyncd. Sonst scheitern Codes aus Authenticator-Apps.',
      { minutes: Math.round(skew / 60000) }
    );
  }
  return result('clock', 'ok', 'Uhrzeit', 'Server und Gerät gehen gleich.');
}

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  const rss = process.memoryUsage.rss();
  const params = { version: process.versions.node, memory: formatBytes(rss) };
  if (major < 24) {
    return result('node', 'error', 'Node.js', 'Node.js {version} ist zu alt.', 'MoeShare braucht Node.js 24 oder neuer.', params);
  }
  return result('node', 'ok', 'Node.js', 'Node.js {version}, belegt {memory} Arbeitsspeicher.', '', params);
}

async function checkBackups() {
  if (!settings.get('backup.enabled')) {
    return result(
      'backups',
      'warn',
      'Sicherungen',
      'Automatische Sicherungen sind aus.',
      'Schalte sie unter Admin › Einstellungen › Sicherungen ein, damit ein Fehler nicht alles kostet.'
    );
  }
  const state = await backups.status().catch(() => null);
  const lastAt = state && state.last && state.last.ok ? Number(state.last.at) : null;
  const interval = settings.get('backup.intervalHours') * 60 * 60 * 1000;
  if (!lastAt)
    return result(
      'backups',
      'warn',
      'Sicherungen',
      'Es gibt noch keine Sicherung.',
      'Starte unter Admin › Einstellungen › Sicherungen eine erste von Hand.'
    );
  if (Date.now() - lastAt > interval * 2 + 60 * 60 * 1000) {
    return result(
      'backups',
      'warn',
      'Sicherungen',
      'Die letzte Sicherung ist {hours} Stunden alt.',
      'Schau ins Protokoll, warum die Sicherung ausbleibt.',
      {
        hours: Math.round((Date.now() - lastAt) / 3600000),
      }
    );
  }
  return result('backups', 'ok', 'Sicherungen', 'Die letzte Sicherung ist {hours} Stunden alt.', '', {
    hours: Math.round((Date.now() - lastAt) / 3600000),
  });
}

async function checkCaddy() {
  if (!settings.get('caddy.adminUrl')) return null;
  const found = await within(caddy.overview()).catch((error) => ({ connected: false, error: error.message }));
  if (!found.connected) {
    return result('caddy', 'warn', 'Caddy', 'Die Admin-API von Caddy antwortet nicht: {error}', 'Prüf die Adresse unter Admin › Caddy.', {
      error: found.error || '?',
    });
  }
  return result('caddy', 'ok', 'Caddy', 'Die Admin-API von Caddy antwortet.');
}

async function checkSecurity() {
  const rows = await db.all(
    `SELECT u.username FROM users u WHERE u.role = 'admin' AND u.status = 'active' AND u.totp_enabled_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM passkeys p WHERE p.user_id = u.id)`,
    []
  );
  if (rows.length) {
    return result(
      'security',
      'warn',
      'Anmeldung der Admins',
      rows.length === 1
        ? 'Ein Admin meldet sich nur mit Passwort an: {names}.'
        : '{count} Admins melden sich nur mit Passwort an: {names}.',
      'Richte für jedes Admin-Konto einen Passkey oder eine Authenticator-App ein, oder verlang es unter Admin › Einstellungen › Anmeldung.',
      {
        count: rows.length,
        names: rows
          .map((row) => row.username)
          .slice(0, 5)
          .join(', '),
      }
    );
  }
  return result('security', 'ok', 'Anmeldung der Admins', 'Alle Admins nutzen einen zweiten Faktor oder Passkeys.');
}

async function checkVersion() {
  const info = await updates.info('de').catch(() => null);
  if (!info || !info.enabled)
    return result('version', 'info', 'Version', 'MoeShare {version}, die Versionsprüfung ist aus.', '', { version: config.version });
  if (info.supported === false) {
    return result(
      'version',
      'error',
      'Version',
      'MoeShare {version} wird nicht mehr unterstützt.',
      'Spiel bald ein Update ein, siehe Admin › System.',
      {
        version: config.version,
      }
    );
  }
  if (info.yanked)
    return result('version', 'error', 'Version', 'MoeShare {version} wurde zurückgezogen.', 'Spiel bald ein Update ein.', {
      version: config.version,
    });
  if (info.available) {
    return result(
      'version',
      info.security ? 'warn' : 'info',
      'Version',
      'MoeShare {version} läuft, {latest} ist erschienen.',
      'Wie das Update geht, steht unter Admin › System.',
      {
        version: config.version,
        latest: info.available,
      }
    );
  }
  return result('version', 'ok', 'Version', 'MoeShare {version} ist aktuell.', '', { version: config.version });
}

function checkPulse() {
  const state = pulse.state('de');
  if (state.locked === 'disabled') return result('moepulse', 'info', 'MoePulse', 'MoePulse ist per Umgebungsvariable abgeschaltet.');
  if (state.status.blocked) {
    return result(
      'moepulse',
      'warn',
      'MoePulse',
      'MoeStudio nimmt von dieser Installation gerade keine Daten an.',
      'Schreib MoeStudio unter Admin › Hilfe, wenn das nicht so sein soll.'
    );
  }
  if (!state.value.stats && !state.value.errors) return result('moepulse', 'info', 'MoePulse', 'Statistik und Fehlerberichte sind aus.');
  if (state.status.lastError)
    return result('moepulse', 'warn', 'MoePulse', 'Letzter Versuch fehlgeschlagen: {error}', '', { error: state.status.lastError });
  return result('moepulse', 'ok', 'MoePulse', 'Statistik und Fehlerberichte kommen bei MoeStudio an.');
}

async function guarded(id, title, task) {
  try {
    return await task();
  } catch (error) {
    log.debug('Prüfung fehlgeschlagen', { check: id, error });
    return result(id, 'warn', title, 'Die Prüfung ist abgebrochen: {error}', '', { error: error.message });
  }
}

function translated(entry, language) {
  const params = Object.fromEntries(Object.entries(entry.params || {}).map(([key, value]) => [key, String(value)]));
  return {
    id: entry.id,
    status: entry.status,
    title: translate(language, entry.title),
    detail: entry.detail ? translate(language, entry.detail, params) : '',
    hint: entry.hint ? translate(language, entry.hint, params) : '',
  };
}

async function run({ req = null, clientNow = null, language = 'de' } = {}) {
  const checks = [
    checkAddress(req),
    checkHttps(req),
    checkProxy(req),
    await guarded('disk', 'Speicherplatz', checkDisk),
    await guarded('folders', 'Schreibrechte', checkFolders),
    await guarded('database', 'Datenbank', checkDatabase),
    await guarded('s3', 'Speicher', checkS3),
    checkFfmpeg(),
    await guarded('clamav', 'Virenscan', checkClamav),
    await guarded('mail', 'E-Mail', checkMail),
    await guarded('backups', 'Sicherungen', checkBackups),
    await guarded('caddy', 'Caddy', checkCaddy),
    await guarded('security', 'Anmeldung der Admins', checkSecurity),
    checkClock(clientNow),
    checkNode(),
    await guarded('version', 'Version', checkVersion),
    await guarded('moepulse', 'MoePulse', checkPulse),
  ].filter(Boolean);
  const summary = { ok: 0, info: 0, warn: 0, error: 0 };
  for (const entry of checks) summary[entry.status] += 1;
  last = { at: Date.now(), checks, summary };
  return { at: last.at, summary, checks: checks.map((entry) => translated(entry, language)) };
}

function recent(language = 'de') {
  if (!last || Date.now() - last.at > CACHE_MS) return null;
  return { at: last.at, summary: last.summary, checks: last.checks.map((entry) => translated(entry, language)) };
}

module.exports = { run, recent };
