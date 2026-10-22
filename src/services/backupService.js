'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const readline = require('readline');
const tar = require('tar');
const config = require('../config');
const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const { conflict, badRequest, notFound } = require('../lib/errors');
const { formatBytes } = require('../lib/format');
const { TABLES, readTable, importTables, encode, isEmpty, clearTables, counts } = require('../lib/db/transfer');
const { LATEST_VERSION } = require('../lib/migrations');
const { S3Client } = require('../lib/s3');
const settings = require('./settingsService');

const log = logger.scope('backup');

const FORMAT = 1;
const NAME = /^moeshare-backup-\d{8}-\d{6}(-[a-z]+)?\.tar\.gz$/;
const LOCK = 'backup';
const LOCK_MS = 6 * 60 * 60 * 1000;
const BATCH = 400;

let current = null;

const directory = () => path.join(config.paths.data, 'backups');
const stamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const relative = (target) => path.relative(config.paths.root, target).split(path.sep).join('/');

function s3Target() {
  return new S3Client({
    endpoint: settings.get('storage.s3.endpoint') || undefined,
    region: settings.get('storage.s3.region') || undefined,
    bucket: settings.get('storage.s3.bucket'),
    accessKeyId: settings.get('storage.s3.accessKeyId'),
    secretAccessKey: settings.get('storage.s3.secretAccessKey'),
    forcePathStyle: settings.get('storage.s3.pathStyle'),
  });
}

const remotePrefix = () => {
  const prefix = String(settings.get('storage.s3.prefix') || '').replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/backups/` : 'backups/';
};

const useS3 = () =>
  settings.get('backup.target') === 's3' &&
  Boolean(settings.get('storage.s3.bucket') && settings.get('storage.s3.accessKeyId') && settings.get('storage.s3.secretAccessKey'));

async function writeTable(target, table) {
  const handle = await fsp.open(target, 'w');
  let rows = 0;
  try {
    for await (const batch of readTable(db, table)) {
      const lines = batch.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, encode(value)]))));
      await handle.write(`${lines.join('\n')}\n`);
      rows += batch.length;
    }
  } finally {
    await handle.close();
  }
  return rows;
}

async function countUploads() {
  let files = 0;
  let bytes = 0;
  const walk = async (dir) => {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await fsp.stat(full)).size;
      }
    }
  };
  await walk(config.paths.uploads);
  return { files, bytes };
}

async function create({ includeUploads = settings.get('backup.includeUploads'), reason = 'manual', actor = null } = {}) {
  if (current) throw conflict('Es läuft schon eine Sicherung.');
  const started = Date.now();
  const name = `moeshare-backup-${stamp()}${reason === 'auto' ? '-auto' : ''}.tar.gz`;
  current = { name, startedAt: started, phase: 'database', includeUploads, reason };
  let token = null;
  try {
    token = await ephemeral.acquire(LOCK, LOCK_MS);
  } finally {
    if (!token) current = null;
  }
  if (!token) throw conflict('Ein anderer MoeShare-Prozess erstellt gerade eine Sicherung.');
  const folder = directory();
  const staging = path.join(folder, `.staging-${process.pid}-${started}`);
  const target = path.join(folder, name);
  const partial = `${target}.partial`;
  try {
    await fsp.mkdir(path.join(staging, 'database'), { recursive: true });
    const tables = {};
    for (const table of TABLES) tables[table.name] = await writeTable(path.join(staging, 'database', `${table.name}.jsonl`), table);
    const secret = await fsp.readFile(config.paths.secret, 'utf8').catch(() => null);
    if (secret) await fsp.writeFile(path.join(staging, 'secret'), secret.trim(), { mode: 0o600 });
    const uploads = includeUploads ? await countUploads() : null;
    const manifest = {
      format: FORMAT,
      app: 'moeshare',
      version: config.version,
      schema: LATEST_VERSION,
      client: db.client,
      createdAt: new Date(started).toISOString(),
      reason,
      tables,
      uploads,
      secret: Boolean(secret),
    };
    await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));

    current.phase = includeUploads ? 'uploads' : 'archive';
    const stagingPath = relative(staging);
    const entries = [`${stagingPath}/manifest.json`, `${stagingPath}/database`];
    if (secret) entries.push(`${stagingPath}/secret`);
    if (includeUploads && fs.existsSync(config.paths.uploads)) entries.push(relative(config.paths.uploads));
    await tar.c(
      {
        gzip: { level: includeUploads ? 1 : 6 },
        file: partial,
        cwd: config.paths.root,
        portable: true,
        onWriteEntry(entry) {
          if (entry.path === stagingPath || entry.path.startsWith(`${stagingPath}/`)) entry.path = entry.path.slice(stagingPath.length + 1);
        },
      },
      entries
    );
    await fsp.rename(partial, target);
    const { size } = await fsp.stat(target);
    let location = 'local';
    if (useS3()) {
      current.phase = 'upload';
      const client = s3Target();
      try {
        await client.put(`${remotePrefix()}${name}`, fs.createReadStream(target), { contentType: 'application/gzip', contentLength: size });
      } finally {
        client.close();
      }
      await fsp.rm(target, { force: true });
      location = 's3';
    }
    const result = { name, size, location, ms: Date.now() - started, includeUploads, at: started, ok: true };
    await settings.writeMeta('backup', result);
    await prune();
    log.info('Sicherung erstellt', {
      file: name,
      size: formatBytes(size),
      where: location === 's3' ? 'S3' : relative(folder),
      by: actor || reason,
    });
    return result;
  } catch (error) {
    await fsp.rm(partial, { force: true });
    await settings.writeMeta('backup', { name, at: started, ok: false, error: error.message }).catch(() => {});
    log.error('Die Sicherung ist fehlgeschlagen', { error });
    throw error;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
    current = null;
    await ephemeral.release(LOCK, token).catch(() => {});
  }
}

async function listLocal() {
  const entries = await fsp.readdir(directory()).catch(() => []);
  const items = [];
  for (const entry of entries.filter((name) => NAME.test(name))) {
    const { size, mtimeMs } = await fsp.stat(path.join(directory(), entry));
    items.push({ name: entry, size, at: mtimeMs, location: 'local', auto: entry.includes('-auto') });
  }
  return items;
}

async function listRemote() {
  if (!useS3()) return [];
  const client = s3Target();
  try {
    const items = [];
    for await (const object of client.listAll(remotePrefix())) {
      const name = object.key.slice(remotePrefix().length);
      if (NAME.test(name)) items.push({ name, size: object.size, at: object.modified || 0, location: 's3', auto: name.includes('-auto') });
    }
    return items;
  } finally {
    client.close();
  }
}

async function list() {
  const items = [...(await listLocal()), ...(await listRemote())];
  return items.sort((a, b) => b.name.localeCompare(a.name));
}

async function prune() {
  const keep = settings.get('backup.keep');
  const items = (await list()).filter((item) => item.auto);
  const removable = items.slice(keep);
  for (const item of removable) await remove(item.name, item.location).catch(() => {});
  return removable.length;
}

async function remove(name, location = 'local') {
  if (!NAME.test(name)) throw notFound('Diese Sicherung gibt es nicht.');
  if (location === 's3') {
    const client = s3Target();
    try {
      await client.remove(`${remotePrefix()}${name}`);
    } finally {
      client.close();
    }
    return;
  }
  const file = path.join(directory(), name);
  if (!fs.existsSync(file)) throw notFound('Diese Sicherung gibt es nicht.');
  await fsp.rm(file, { force: true });
}

async function send(res, name, location = 'local') {
  if (!NAME.test(name)) throw notFound('Diese Sicherung gibt es nicht.');
  if (location === 's3') {
    const client = s3Target();
    res.redirect(
      302,
      client.presign(`${remotePrefix()}${name}`, 300, { 'response-content-disposition': `attachment; filename="${name}"` })
    );
    client.close();
    return;
  }
  const file = path.join(directory(), name);
  if (!fs.existsSync(file)) throw notFound('Diese Sicherung gibt es nicht.');
  res.download(file, name);
}

async function due() {
  if (!settings.get('backup.enabled')) return false;
  const last = await settings.readMeta('backup');
  const interval = settings.get('backup.intervalHours') * 60 * 60 * 1000;
  return !last || !last.at || Date.now() - Number(last.at) >= interval;
}

async function tick() {
  if (current || !(await due())) return null;
  try {
    return await create({ reason: 'auto' });
  } catch {
    return null;
  }
}

async function status() {
  return { running: current ? { ...current } : null, last: await settings.readMeta('backup') };
}

async function* readJsonl(file) {
  if (!fs.existsSync(file)) return;
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let batch = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= BATCH) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}

const plain = (info) => !info || !info.type || info.type === 'File' || info.type === 'Directory' || info.type === 'OldFile';

async function restore(file, { force = false, uploads = true, onStep = () => {} } = {}) {
  if (!fs.existsSync(file)) throw badRequest(`Die Datei ${file} gibt es nicht.`);
  const work = path.join(directory(), `.restore-${process.pid}-${Date.now()}`);
  await fsp.mkdir(work, { recursive: true });
  try {
    onStep('Sicherung wird entpackt');
    await tar.x({
      file,
      cwd: work,
      strict: true,
      filter: (entry, info) => plain(info) && !entry.replace(/^\.\//, '').startsWith('uploads/'),
    });
    const manifest = JSON.parse(await fsp.readFile(path.join(work, 'manifest.json'), 'utf8').catch(() => '{}'));
    if (manifest.app !== 'moeshare' || manifest.format !== FORMAT) throw badRequest('Das ist keine MoeShare-Sicherung.');
    if (manifest.schema > LATEST_VERSION) {
      throw badRequest(`Die Sicherung stammt von einer neueren MoeShare-Version (${manifest.version}). Aktualisiere MoeShare zuerst.`);
    }
    await db.ready;
    if (!(await isEmpty(db))) {
      if (!force) throw conflict('Die Datenbank enthält schon Daten. Mit --force werden sie vorher gelöscht.');
      onStep('Vorhandene Daten werden gelöscht');
    }
    await clearTables(db);
    onStep('Datenbank wird eingespielt');
    const written = await importTables(db, (table) => readJsonl(path.join(work, 'database', `${table.name}.jsonl`)), {
      onTable: (name, count) => onStep(`${name}: ${count}`),
    });
    const secret = await fsp.readFile(path.join(work, 'secret'), 'utf8').catch(() => null);
    if (secret) {
      const existing = await fsp.readFile(config.paths.secret, 'utf8').catch(() => null);
      if (existing && existing.trim() !== secret.trim()) {
        await fsp.copyFile(config.paths.secret, `${config.paths.secret}.vor-wiederherstellung-${stamp()}`);
      }
      await fsp.writeFile(config.paths.secret, secret.trim(), { mode: 0o600 });
    }
    let restoredFiles = 0;
    if (uploads && manifest.uploads) {
      onStep('Dateien werden eingespielt');
      await fsp.mkdir(config.paths.uploads, { recursive: true });
      await tar.x({
        file,
        cwd: config.paths.root,
        strict: true,
        filter: (entry, info) => plain(info) && entry.replace(/^\.\//, '').startsWith('uploads/'),
        onReadEntry: (entry) => {
          if (entry.type === 'File') restoredFiles += 1;
        },
      });
    }
    return { manifest, written, files: restoredFiles, after: await counts(db) };
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

const isRunning = () => Boolean(current);

module.exports = { create, list, remove, send, tick, status, restore, prune, isRunning, NAME, directory };
