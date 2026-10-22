'use strict';

const path = require('path');
const logger = require('../lib/logger');
const { ZipWriter, uniqueNames, cleanName } = require('../lib/zip');
const storage = require('./storageService');

const log = logger.scope('zip');

function entryName(record) {
  if (record.original_name) return record.original_name;
  if (record.title) return `${record.title}${path.extname(record.filename)}`;
  return record.filename;
}

async function send(res, records, title) {
  res.status(200);
  res.attachment(`${cleanName(title || 'MoeShare')}.zip`);
  res.set('Content-Type', 'application/zip');
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  const zip = new ZipWriter(res);
  const unique = uniqueNames();
  let added = 0;
  try {
    for (const record of records) {
      let source;
      try {
        source = await storage.openRead(record);
      } catch (error) {
        log.warn('Eine Datei fehlt und bleibt im ZIP außen vor', { user: record.username, file: record.filename, error });
        continue;
      }
      await zip.add(unique(entryName(record)), source.stream, {
        size: source.size,
        date: new Date(Number(record.created_at) || Date.now()),
      });
      added += 1;
    }
    await zip.finish();
    res.end();
    log.debug('ZIP verschickt', { files: added });
  } catch (error) {
    if (error.code !== 'ABORTED') log.warn('Der ZIP-Download wurde abgebrochen', { error });
    res.destroy();
  }
}

module.exports = { send, entryName };
