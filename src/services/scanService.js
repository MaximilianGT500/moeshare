'use strict';

const fsp = require('fs').promises;
const logger = require('../lib/logger');
const clamav = require('../lib/clamav');
const { HttpError } = require('../lib/errors');
const settings = require('./settingsService');
const audit = require('./auditService');
const webhook = require('./webhookService');

const log = logger.scope('virenscan');

const TIMEOUT_MS = 120000;

const enabled = () => settings.get('clamav.enabled');

function options(overrides = {}) {
  const socket = overrides.socket !== undefined ? overrides.socket : settings.get('clamav.socket');
  return {
    host: overrides.host || settings.get('clamav.host'),
    port: overrides.port || settings.get('clamav.port'),
    socket: socket || null,
    timeoutMs: overrides.timeoutMs || TIMEOUT_MS,
  };
}

const where = (target) => (target.socket ? target.socket : `${target.host}:${target.port}`);

async function scan(file, size) {
  if (!enabled()) return { status: null };
  const limit = settings.get('clamav.maxBytes');
  if (limit && size > limit) return { status: 'skipped' };
  const target = options();
  try {
    const result = await clamav.scanFile(file, target);
    return result.infected ? { status: 'infected', signature: result.signature } : { status: 'clean' };
  } catch (error) {
    if (error.code === 'ETOOLARGE') return { status: 'skipped' };
    log.warn('Der Virenscan ist fehlgeschlagen', { clamav: where(target), error });
    return { status: 'error', error };
  }
}

async function assertClean(file, { user, name, size, via = 'upload' }) {
  const result = await scan(file, size);
  if (result.status === 'infected') {
    await fsp.rm(file, { force: true });
    log.warn('Schadsoftware gefunden, die Datei wurde nicht gespeichert', {
      user: user.username,
      file: name,
      signature: result.signature,
      via,
    });
    audit.log('virus_found', { userId: user.id || null, details: { name: String(name || '').slice(0, 120), signature: result.signature } });
    webhook.notify(
      'virus',
      'Schadsoftware abgewiesen',
      `Benutzername: **${user.username}**\nDatei: **${name}**\nFund: **${result.signature}**`,
      'error'
    );
    throw new HttpError(422, `Die Datei enthält Schadsoftware (${result.signature}) und wurde nicht gespeichert.`, {
      code: 'infected',
      extra: { signature: result.signature },
    });
  }
  if (result.status === 'error' && settings.get('clamav.onError') === 'reject') {
    await fsp.rm(file, { force: true });
    webhook.notify(
      'virus',
      'Virenscan nicht erreichbar',
      `Ein Upload von **${user.username}** wurde abgewiesen: ${result.error.message}`,
      'error'
    );
    throw new HttpError(503, 'Der Virenscan ist gerade nicht erreichbar. Versuche es gleich noch einmal.', { code: 'scan_unavailable' });
  }
  return result.status;
}

async function test(overrides = {}) {
  const target = options(overrides);
  const started = Date.now();
  const version = await clamav.version(target);
  const probe = await clamav.scanBuffer(Buffer.from(clamav.EICAR), target);
  return { ok: true, version, detects: probe.infected, signature: probe.signature, ms: Date.now() - started };
}

module.exports = { enabled, assertClean, test };
