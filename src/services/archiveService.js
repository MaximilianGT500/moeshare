'use strict';

const path = require('path');
const { pipeline } = require('stream/promises');
const cache = require('../lib/cache');
const logger = require('../lib/logger');
const zip = require('../lib/zipReader');
const { badRequest, notFound } = require('../lib/errors');
const storage = require('./storageService');

const log = logger.scope('archive');
const LISTING_TTL_MS = 5 * 60 * 1000;

const isZip = (record) => /\.zip$/i.test(String(record.filename || ''));

async function withSource(record, work) {
  const source = await storage.openRange(record);
  try {
    return await work(source);
  } finally {
    await source.close();
  }
}

function readListing(record) {
  return cache.remember(`zip:${record.id}:${record.filename}:${record.size_bytes}`, LISTING_TTL_MS, () =>
    withSource(record, (source) => zip.list(source))
  );
}

async function listing(record) {
  if (!isZip(record)) throw notFound('Das ist kein ZIP-Archiv.');
  let result;
  try {
    result = await readListing(record);
  } catch (error) {
    if (error.code === 'EZIP') throw badRequest(error.message, { code: 'zip_invalid' });
    throw error;
  }
  return {
    entries: result.entries.map(({ index, name, directory, size, packed, modified, encrypted, supported }) => ({
      index,
      name,
      directory,
      size,
      packed,
      modified,
      encrypted,
      supported,
    })),
    total: result.total,
    truncated: result.truncated,
    comment: result.comment || '',
  };
}

const entryName = (name) => path.posix.basename(name.replace(/\/+$/, '')) || 'datei';

async function sendEntry(res, record, index) {
  if (!isZip(record)) throw notFound('Das ist kein ZIP-Archiv.');
  const { entries } = await readListing(record).catch((error) => {
    if (error.code === 'EZIP') throw badRequest(error.message, { code: 'zip_invalid' });
    throw error;
  });
  const entry = entries.find((item) => item.index === index);
  if (!entry || entry.directory) throw notFound('Diese Datei gibt es im Archiv nicht.');
  if (entry.encrypted)
    throw badRequest('Die Datei ist im Archiv verschlüsselt. Lade das ganze Archiv herunter.', { code: 'zip_encrypted' });
  if (!entry.supported) {
    throw badRequest('Die Datei ist mit einem Verfahren gepackt, das sich hier nicht entpacken lässt. Lade das ganze Archiv herunter.', {
      code: 'zip_method',
    });
  }
  const source = await storage.openRange(record);
  try {
    let opened;
    try {
      opened = await zip.open(source, entry);
    } catch (error) {
      if (error.code === 'EZIP') throw badRequest(error.message, { code: 'zip_invalid' });
      throw error;
    }
    res.attachment(entryName(entry.name));
    res.set('Cache-Control', 'private, no-store');
    if (entry.method === 0) res.set('Content-Length', String(entry.size));
    if (!opened.raw) return res.end();
    const stages = opened.inflate ? [opened.raw, opened.inflate, opened.limit, res] : [opened.raw, opened.limit, res];
    await pipeline(...stages).catch((error) => {
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') log.debug('Datei aus dem Archiv nicht vollständig gesendet', { error });
    });
    return undefined;
  } finally {
    await source.close();
  }
}

module.exports = { isZip, listing, sendEntry };
