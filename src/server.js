'use strict';

const fs = require('fs');
const axios = require('axios');
const config = require('./config');
const logger = require('./lib/logger');
const db = require('./lib/db');
const media = require('./lib/media');
const secrets = require('./lib/secrets');
const ephemeral = require('./lib/ephemeral');
const errorReports = require('./lib/errorReports');
const { ensureUserDirs } = require('./lib/storage');
const settings = require('./services/settingsService');
const setup = require('./services/setupService');
const sessions = require('./services/sessionService');
const audit = require('./services/auditService');
const oauth = require('./services/oauthService');
const invites = require('./services/inviteService');
const files = require('./services/fileService');
const links = require('./services/linkService');
const storage = require('./services/storageService');
const backups = require('./services/backupService');
const domains = require('./services/domainService');
const stats = require('./services/statsService');
const { createApp } = require('./app');

const log = logger.scope('server');

const exitSoon = (code) => setTimeout(() => process.exit(code), 100);

function fatal(message, error, hint) {
  log.error(message, { error, hint });
  exitSoon(1);
}

function watchProcess() {
  process.on('unhandledRejection', (reason) =>
    log.error('Unbehandelter Fehler', { error: reason instanceof Error ? reason : new Error(String(reason)) })
  );
  process.on('uncaughtException', (error) => {
    log.error('Unerwarteter Fehler, MoeShare wird beendet', { error });
    errorReports.flush(2000).then(() => exitSoon(1));
  });
}

async function prepareUserFolders() {
  const users = await db.all('SELECT username FROM users');
  for (const { username } of users) {
    try {
      const { hlsDir } = ensureUserDirs(username);
      const markers = fs.readdirSync(hlsDir).filter((entry) => entry.startsWith('conversionStarted-'));
      for (const marker of markers) {
        const base = marker.slice('conversionStarted-'.length);
        await media.removeHlsArtifacts(username, base);
        log.warn('Abgebrochene Videoumwandlung aufgeräumt', { user: username, file: base });
      }
    } catch (error) {
      log.error('Der Benutzerordner konnte nicht vorbereitet werden', { user: username, error });
    }
  }
}

function scheduleMaintenance() {
  const run = async () => {
    try {
      const [expiredSessions, expiredFlows, auditEntries, oldInvites, oldStats] = await Promise.all([
        sessions.cleanup(),
        ephemeral.prune(),
        audit.prune(),
        invites.prune(),
        stats.prune(),
      ]);
      log.debug('Wartung erledigt', {
        sessions: expiredSessions,
        flows: expiredFlows,
        audit: auditEntries,
        invites: oldInvites,
        stats: oldStats,
      });
    } catch (error) {
      log.error('Die Wartung ist fehlgeschlagen', { error });
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();

  const everyMinute = async () => {
    const token = await ephemeral.acquire('minute', 50 * 1000).catch(() => null);
    if (!token) return;
    try {
      const [expiredFiles, expiredLinks, trashed] = await Promise.all([files.removeExpired(), links.removeExpired(), files.purgeTrash()]);
      if (expiredFiles || expiredLinks || trashed)
        log.debug('Abgelaufenes entfernt', { files: expiredFiles, links: expiredLinks, trash: trashed });
      await backups.tick();
      await domains.checkPending();
    } catch (error) {
      log.error('Die minütliche Wartung ist fehlgeschlagen', { error });
    }
  };
  setTimeout(everyMinute, 5000).unref();
  setInterval(everyMinute, 60 * 1000).unref();

  storage
    .cleanupLocalCopies()
    .then((removed) => removed && log.info('Lokale Kopien von S3-Dateien aufgeräumt', { files: removed }))
    .catch((error) => log.warn('Lokale Kopien von S3-Dateien ließen sich nicht prüfen', { error }));
}

const newer = (a, b) => {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  return false;
};

async function checkForUpdate() {
  if (!config.repository) return;
  try {
    const { data } = await axios.get(`https://raw.githubusercontent.com/${config.repository}/main/package.json`, { timeout: 5000 });
    if (data.version && newer(data.version, config.version)) {
      log.info(`MoeShare ${data.version} ist verfügbar`, { installed: config.version, url: `https://github.com/${config.repository}` });
    } else {
      log.debug('MoeShare ist auf dem neuesten Stand', { version: config.version });
    }
  } catch (error) {
    log.debug('Die Versionsprüfung war nicht möglich', { error });
  }
}

function logSummary() {
  const providers = oauth.enabled().map(({ label }) => label);
  const features = [
    ['Vorschaubilder', settings.get('uploads.preview')],
    ['Standortdaten entfernen', settings.get('uploads.removeMetadata')],
    ['Hauptfarbe', settings.get('uploads.dominantColor')],
    ['Video-Streaming', settings.get('uploads.hls') && media.ffmpegAvailable],
    ['Startseite', settings.get('home.enabled')],
    ['Passkeys', settings.get('auth.passkeys')],
    [providers.length ? `Anmeldung mit ${providers.join(', ')}` : 'Anmeldung über Dienste', providers.length > 0],
    ['Discord-Webhook', settings.get('webhook.enabled') && Boolean(settings.get('webhook.url'))],
    ['Speicher in S3', storage.activeDriver() === 's3'],
    ['Automatische Sicherungen', settings.get('backup.enabled')],
    ['Papierkorb', settings.get('trash.enabled')],
    ['Statistiken', settings.get('stats.enabled')],
    ['Eigene Domains', settings.get('domains.enabled')],
    ['Profilseiten', settings.get('profiles.enabled')],
    ['Meldungen', settings.get('reports.enabled')],
    ['E-Mail-Versand', settings.get('mail.enabled') && Boolean(settings.get('mail.host'))],
  ];
  const active = features.filter(([, on]) => on).map(([name]) => name);
  const inactive = features.filter(([, on]) => !on).map(([name]) => name);
  log.info(`MoeShare ${config.version} läuft auf ${settings.get('site.baseUrl')}`, {
    port: config.port,
    node: process.versions.node,
    db: db.describe(),
    log: logger.level,
  });
  if (active.length) log.info(`Aktiv: ${active.join(', ')}`);
  if (inactive.length) log.info(`Abgeschaltet: ${inactive.join(', ')}`);
}

function handleShutdown(server) {
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) {
      log.warn(`${signal} erneut empfangen, MoeShare wird sofort beendet`);
      process.exit(1);
    }
    stopping = true;
    log.info(`${signal} empfangen, MoeShare wird beendet`);
    server.close(async () => {
      await db.close();
      log.info('MoeShare ist beendet');
      exitSoon(0);
    });
    setTimeout(() => server.closeAllConnections(), 8000).unref();
    setTimeout(() => process.exit(1), 12000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function start() {
  watchProcess();
  errorReports.start(() => settings.get('system.errorReports'));
  try {
    await db.ready;
  } catch (error) {
    if (config.database.error) {
      return fatal(
        'Die Datenbank-Adresse ist ungültig',
        error,
        'Beispiele: sqlite:db/datenbank.sqlite, postgres://moeshare:passwort@localhost:5432/moeshare, mysql://moeshare:passwort@localhost:3306/moeshare'
      );
    }
    const hint =
      db.client === 'sqlite'
        ? `Prüfe die Dateirechte im Ordner ${config.paths.data}.`
        : 'Prüfe DATABASE_URL, ob der Datenbankserver erreichbar ist und ob Benutzer, Passwort und Datenbankname stimmen.';
    return fatal(`Die Datenbank (${db.describe()}) konnte nicht geöffnet werden`, error, hint);
  }

  try {
    await settings.load();
    settings.startSync();
    secrets.loadKey();
    await prepareUserFolders();
    await domains.refresh();
    domains.start();
  } catch (error) {
    return fatal('MoeShare konnte nicht starten', error);
  }

  const app = createApp();
  scheduleMaintenance();

  const server = app.listen(config.port, (error) => {
    if (error) return;
    logSummary();
    checkForUpdate();
    setup.prepare().catch((error) => log.error('Der Einrichtungslink konnte nicht erstellt werden', { error }));
  });
  server.on('error', (error) =>
    fatal(`Port ${config.port} kann nicht verwendet werden`, error, 'Läuft MoeShare schon? Sonst einen anderen Port mit PORT setzen.')
  );
  handleShutdown(server);
  return server;
}

module.exports = { start };
