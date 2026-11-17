'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const autoShare = require('./autoShareService');
const files = require('./fileService');

const log = logger.scope('publish');

const BATCH = 100;

async function announce(record) {
  const user = await db.get("SELECT id, username FROM users WHERE username = ? AND status = 'active'", [record.username]);
  if (!user) return 0;
  const tags = (await db.all('SELECT tag FROM file_tags WHERE file_id = ? ORDER BY tag', [record.id])).map((row) => row.tag);
  const link = files.urlsFor(record).view;
  return autoShare.shareUpload(user, { ...record, publish_at: null }, link, { via: 'publish', tags });
}

async function release(record) {
  const claimed = await db.run('UPDATE file_data SET publish_at = NULL WHERE id = ? AND publish_at = ?', [record.id, record.publish_at]);
  if (!claimed || !claimed.changes) return false;
  if (!record.deleted_at && !record.blocked_at) {
    await announce(record).catch((error) => log.warn('Veröffentlichung ließ sich nicht teilen', { file: record.filename, error }));
  }
  return true;
}

async function tick(now = Date.now()) {
  const rows = await db.all('SELECT * FROM file_data WHERE publish_at IS NOT NULL AND publish_at <= ? ORDER BY publish_at LIMIT ?', [
    now,
    BATCH,
  ]);
  let released = 0;
  for (const row of rows) if (await release(row)) released += 1;
  if (released) log.info('Geplante Dateien veröffentlicht', { files: released });
  return released;
}

async function publishNow(record) {
  if (!record.publish_at) return false;
  return release(record);
}

module.exports = { tick, publishNow };
