'use strict';

const crypto = require('crypto');
const db = require('../lib/db');
const logger = require('../lib/logger');
const ephemeral = require('../lib/ephemeral');
const { translate } = require('../lib/i18n');
const { formatBytes } = require('../lib/format');
const { extensionOf } = require('../lib/storage');
const { EXPIRY_CHOICES, choiceMs } = require('../lib/expiry');
const { HttpError, badRequest, forbidden, notFound, gone, tooLarge } = require('../lib/errors');
const settings = require('./settingsService');
const files = require('./fileService');
const protection = require('./protectionService');
const quota = require('./quotaService');
const avatars = require('./avatarService');
const mail = require('./mailService');
const webhook = require('./webhookService');

const log = logger.scope('anfragen');

const TYPES = ['any', 'images', 'videos', 'media', 'documents'];
const DOCUMENTS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.rtf',
  '.doc',
  '.docx',
  '.odt',
  '.xls',
  '.xlsx',
  '.ods',
  '.csv',
  '.ppt',
  '.pptx',
  '.odp',
  '.zip',
  '.7z',
  '.rar',
]);
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;
const MAX_FILES = 1000;
const NOTIFY_GAP_MS = 15 * 60 * 1000;

const enabled = () => Boolean(settings.get('requests.enabled'));

function newCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

const urlOf = (row) => `${settings.get('site.baseUrl')}/r/${row.code}`;

function stateOf(row, now = Date.now()) {
  if (row.closed_at) return 'closed';
  if (row.expires_at && Number(row.expires_at) <= now) return 'expired';
  if (row.max_files && Number(row.files_count) >= Number(row.max_files)) return 'full';
  if (row.max_bytes && Number(row.bytes_count) >= Number(row.max_bytes)) return 'full';
  return 'open';
}

function present(row) {
  return {
    id: Number(row.id),
    code: row.code,
    url: urlOf(row),
    title: row.title,
    message: row.message || '',
    password: Boolean(row.password_hash),
    albumId: row.album_id ? Number(row.album_id) : null,
    maxFiles: row.max_files ? Number(row.max_files) : null,
    maxBytes: row.max_bytes ? Number(row.max_bytes) : null,
    fileBytes: row.file_bytes ? Number(row.file_bytes) : null,
    types: TYPES.includes(row.types) ? row.types : 'any',
    askName: Boolean(Number(row.ask_name)),
    notify: Boolean(Number(row.notify)),
    files: Number(row.files_count) || 0,
    bytes: Number(row.bytes_count) || 0,
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    closedAt: row.closed_at ? Number(row.closed_at) : null,
    lastUploadAt: row.last_upload_at ? Number(row.last_upload_at) : null,
    createdAt: Number(row.created_at),
    state: stateOf(row),
  };
}

const positive = (value, field, max) => {
  if (value === undefined || value === null || value === '' || value === 0) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || (max && number > max))
    throw badRequest('Bitte eine gültige Zahl eingeben.', { field });
  return number;
};

async function ownedAlbum(user, value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  const row = Number.isSafeInteger(id) ? await db.get('SELECT id FROM albums WHERE id = ? AND user_id = ?', [id, user.id]) : null;
  if (!row) throw badRequest('Dieses Album gibt es nicht.', { field: 'albumId' });
  return Number(row.id);
}

async function clean(user, input, current = null) {
  const source = input && typeof input === 'object' ? input : {};
  const fields = {};
  if (source.title !== undefined || !current) {
    const title = typeof source.title === 'string' ? source.title.replace(/\s+/g, ' ').trim() : '';
    if (!title) throw badRequest('Gib der Anfrage einen Titel.', { field: 'title' });
    if (title.length > 120) throw badRequest('Der Titel darf höchstens 120 Zeichen lang sein.', { field: 'title' });
    fields.title = title;
  }
  if (source.message !== undefined) {
    const message = typeof source.message === 'string' ? source.message.replace(/\r\n?/g, '\n').trim() : '';
    if (message.length > 2000) throw badRequest('Die Nachricht darf höchstens 2.000 Zeichen lang sein.', { field: 'message' });
    fields.message = message || null;
  }
  if (source.password !== undefined) {
    if (source.password === null || source.password === '') {
      fields.password_hash = null;
    } else {
      const hash = await protection.hashPassword(source.password);
      if (hash && hash.error) throw badRequest('Das Passwort ist zu lang.', { field: 'password' });
      fields.password_hash = hash;
    }
  }
  if (source.expires !== undefined) {
    if (!EXPIRY_CHOICES.includes(source.expires)) throw badRequest('Diese Laufzeit gibt es nicht.', { field: 'expires' });
    const ms = choiceMs(source.expires);
    fields.expires_at = ms ? Date.now() + ms : null;
  }
  if (source.maxFiles !== undefined) fields.max_files = positive(source.maxFiles, 'maxFiles', MAX_FILES);
  if (source.maxBytes !== undefined) fields.max_bytes = positive(source.maxBytes, 'maxBytes');
  if (source.fileBytes !== undefined) fields.file_bytes = positive(source.fileBytes, 'fileBytes');
  if (source.types !== undefined) {
    if (!TYPES.includes(source.types)) throw badRequest('Diese Auswahl an Dateitypen gibt es nicht.', { field: 'types' });
    fields.types = source.types;
  }
  if (source.albumId !== undefined) fields.album_id = await ownedAlbum(user, source.albumId);
  if (source.askName !== undefined) fields.ask_name = source.askName === true ? 1 : 0;
  if (source.notify !== undefined) fields.notify = source.notify === false ? 0 : 1;
  if (source.closed !== undefined && current) fields.closed_at = source.closed === true ? current.closed_at || Date.now() : null;
  return fields;
}

async function list(user) {
  const rows = await db.all('SELECT * FROM upload_requests WHERE user_id = ? ORDER BY id DESC', [user.id]);
  return rows.map(present);
}

async function owned(user, id) {
  const row = Number.isSafeInteger(Number(id))
    ? await db.get('SELECT * FROM upload_requests WHERE id = ? AND user_id = ?', [Number(id), user.id])
    : null;
  if (!row) throw notFound('Diese Anfrage gibt es nicht (mehr).');
  return row;
}

async function create(user, input) {
  if (!enabled()) throw forbidden('Datei-Anfragen sind auf diesem Server abgeschaltet.');
  const max = settings.get('requests.maxPerUser');
  const count = await db.count(
    'SELECT COUNT(*) FROM upload_requests WHERE user_id = ? AND closed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)',
    [user.id, Date.now()]
  );
  if (count >= max) {
    throw badRequest(
      max === 1
        ? 'Du kannst nur eine offene Anfrage haben. Schließe zuerst die alte.'
        : `Du kannst höchstens ${max} offene Anfragen haben. Schließe zuerst eine alte.`
    );
  }
  const fields = await clean(user, input);
  let id = null;
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    try {
      id = await db.insertRow('upload_requests', {
        user_id: user.id,
        code: newCode(),
        types: 'any',
        ask_name: 0,
        notify: 1,
        files_count: 0,
        bytes_count: 0,
        created_at: Date.now(),
        ...fields,
      });
    } catch (error) {
      if (!db.isUniqueViolation(error)) throw error;
    }
  }
  log.info('Datei-Anfrage erstellt', { user: user.username, request: id });
  return present(await db.get('SELECT * FROM upload_requests WHERE id = ?', [id]));
}

async function update(user, id, input) {
  const current = await owned(user, id);
  const fields = await clean(user, input, current);
  const columns = Object.keys(fields);
  if (columns.length) {
    await db.run(`UPDATE upload_requests SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((column) => fields[column]),
      current.id,
    ]);
  }
  return present(await db.get('SELECT * FROM upload_requests WHERE id = ?', [current.id]));
}

async function remove(user, id) {
  const current = await owned(user, id);
  await db.run('UPDATE file_data SET request_id = NULL WHERE request_id = ?', [current.id]);
  await db.run('DELETE FROM upload_requests WHERE id = ?', [current.id]);
  return present(current);
}

async function filesOf(user, id) {
  const current = await owned(user, id);
  const rows = await db.all(
    'SELECT * FROM file_data WHERE request_id = ? AND username = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 500',
    [current.id, user.username]
  );
  return {
    request: present(current),
    files: (await files.withTags(rows)).map((file, index) => ({ ...file, uploader: rows[index].uploader || null })),
  };
}

async function byCode(code) {
  if (!enabled() || typeof code !== 'string' || !/^[a-z0-9]{6,32}$/.test(code)) throw notFound('Diese Anfrage gibt es nicht (mehr).');
  const row = await db.get(
    `SELECT r.*, u.username, u.status AS owner_status FROM upload_requests r JOIN users u ON u.id = r.user_id WHERE r.code = ?`,
    [code]
  );
  if (!row || row.owner_status !== 'active') throw notFound('Diese Anfrage gibt es nicht (mehr).');
  return row;
}

const unlocked = (req, row) => !row.password_hash || protection.granted(req, 'r', row.id);

function accepts(row, filename) {
  const ext = extensionOf(filename);
  const { type } = files.typeOf(filename);
  switch (row.types) {
    case 'images':
      return type === 'image';
    case 'videos':
      return type === 'video';
    case 'media':
      return type === 'image' || type === 'video' || type === 'audio';
    case 'documents':
      return DOCUMENTS.has(ext) || type === 'text';
    default:
      return true;
  }
}

async function publicInfo(req, row) {
  const owner = await db.get('SELECT id, username, profile FROM users WHERE id = ?', [row.user_id]);
  let name = owner.username;
  try {
    const profile = JSON.parse(owner.profile || '{}');
    if (profile && typeof profile.name === 'string' && profile.name.trim()) name = profile.name.trim();
  } catch {}
  const limits = await quota.limitsFor({ id: owner.id });
  const state = stateOf(row);
  const perFile = [row.file_bytes ? Number(row.file_bytes) : null, limits.limit].filter((value) => value !== null && value !== undefined);
  return {
    code: row.code,
    title: row.title,
    message: row.message || '',
    owner: { name, avatar: await avatars.urlOf(owner.username) },
    state: state === 'open' && limits.remaining === 0 ? 'full' : state,
    password: Boolean(row.password_hash),
    unlocked: unlocked(req, row),
    askName: Boolean(Number(row.ask_name)),
    types: TYPES.includes(row.types) ? row.types : 'any',
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    maxFileBytes: perFile.length ? Math.min(...perFile) : null,
    filesLeft: row.max_files ? Math.max(0, Number(row.max_files) - Number(row.files_count)) : null,
    bytesLeft: row.max_bytes ? Math.max(0, Number(row.max_bytes) - Number(row.bytes_count)) : null,
  };
}

async function unlock(req, res, row, password) {
  if (!row.password_hash) return true;
  if (!(await protection.checkPassword(row.password_hash, password))) {
    throw new HttpError(401, 'Das Passwort stimmt nicht.', { field: 'password' });
  }
  protection.grant(req, res, 'r', row.id);
  return true;
}

function assertOpen(req, row) {
  const state = stateOf(row);
  if (state === 'closed') throw gone('Diese Anfrage nimmt keine Dateien mehr an.', { code: 'closed' });
  if (state === 'expired') throw gone('Diese Anfrage ist abgelaufen.', { code: 'expired' });
  if (state === 'full') throw gone('Diese Anfrage hat schon alle Dateien bekommen, die sie annimmt.', { code: 'full' });
  if (!unlocked(req, row)) throw forbidden('Gib zuerst das Passwort ein.', { code: 'locked' });
}

async function limitFor(row) {
  const limits = await quota.limitsFor({ id: row.user_id });
  if (limits.remaining === 0) throw gone('Diese Anfrage nimmt gerade keine Dateien an.', { code: 'full' });
  const candidates = [limits.limit, row.file_bytes ? Number(row.file_bytes) : null];
  if (row.max_bytes) candidates.push(Math.max(0, Number(row.max_bytes) - Number(row.bytes_count)));
  const values = candidates.filter((value) => value !== null && value !== undefined);
  return values.length ? Math.min(...values) : null;
}

async function reserve(row) {
  const { changes } = await db.run(
    'UPDATE upload_requests SET files_count = files_count + 1 WHERE id = ? AND closed_at IS NULL AND (max_files IS NULL OR files_count < max_files)',
    [row.id]
  );
  if (!changes) throw gone('Diese Anfrage hat schon alle Dateien bekommen, die sie annimmt.', { code: 'full' });
}

const release = (row) => db.run('UPDATE upload_requests SET files_count = files_count - 1 WHERE id = ? AND files_count > 0', [row.id]);

function cleanUploader(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

async function notifyOwner(row, owner, entry) {
  if (!Number(row.notify)) return;
  const key = `notify-${row.id}`;
  if (await ephemeral.get('request', key)) return;
  await ephemeral.put('request', key, { at: Date.now() }, NOTIFY_GAP_MS);
  await mail
    .notifyUser(row.user_id, 'requests', (language) => {
      const t = (text, values) => translate(language, text, values);
      return {
        subject: t('Neue Datei für „{title}“', { title: row.title }),
        title: t('Neue Datei für „{title}“', { title: row.title }),
        paragraphs: [
          entry.uploader
            ? t('{name} hat über deine Datei-Anfrage gerade „{file}“ hochgeladen ({size}).', {
                name: entry.uploader,
                file: entry.name,
                size: entry.size,
              })
            : t('Über deine Datei-Anfrage wurde gerade „{file}“ hochgeladen ({size}).', { file: entry.name, size: entry.size }),
          t('Weitere Dateien in den nächsten 15 Minuten meldet {site} nicht einzeln.', { site: settings.get('site.title') }),
        ],
        button: { label: t('Anfrage öffnen'), url: `${settings.get('site.baseUrl')}/dashboard#anfragen` },
      };
    })
    .catch(() => false);
  log.debug('Besitzer über neue Datei informiert', { user: owner.username, request: row.id });
}

async function accept(row, owner, file, { name, note, originalName, accept: store }) {
  const uploader = cleanUploader(name, 80);
  if (Number(row.ask_name) && !uploader) throw badRequest('Bitte gib deinen Namen an.', { field: 'name' });
  const result = await store();
  const size = Number(file.size) || 0;
  await db.run('UPDATE file_data SET request_id = ?, uploader = ? WHERE id = ?', [row.id, uploader, result.id]);
  await db.run('UPDATE upload_requests SET bytes_count = bytes_count + ?, last_upload_at = ? WHERE id = ?', [size, Date.now(), row.id]);
  if (row.album_id) {
    const album = await db.get('SELECT id FROM albums WHERE id = ? AND user_id = ?', [row.album_id, row.user_id]);
    if (album) {
      const order = await db.count('SELECT COALESCE(MAX(sort_order), 0) FROM album_files WHERE album_id = ?', [album.id]);
      await db.insertIgnore('album_files', {
        album_id: album.id,
        file_id: result.id,
        sort_order: order + 1,
        added_at: Date.now(),
        added_by: null,
      });
      await db.run('UPDATE albums SET updated_at = ? WHERE id = ?', [Date.now(), album.id]);
    }
  }
  const label = originalName || result.filename;
  log.info('Datei über Anfrage hochgeladen', { user: owner.username, request: row.id, file: result.filename, size: formatBytes(size) });
  webhook.notify(
    'upload',
    'Datei über eine Anfrage hochgeladen',
    `Anfrage: **${row.title}**\nBenutzername: **${owner.username}**\nDatei: **${label}**\nGröße: **${formatBytes(size)}**${uploader ? `\nVon: **${uploader}**` : ''}${note ? `\nNotiz: ${cleanUploader(note, 300)}` : ''}`
  );
  notifyOwner(row, owner, { uploader, name: label, size: formatBytes(size) }).catch(() => {});
  return { ok: true, name: label, size };
}

function assertType(row, filename) {
  if (!accepts(row, filename)) throw badRequest('Diese Art von Datei nimmt die Anfrage nicht an.', { code: 'type' });
}

function tooBig(limit) {
  return tooLarge(`Die Datei ist zu groß. Erlaubt sind höchstens ${formatBytes(limit)}.`);
}

module.exports = {
  TYPES,
  enabled,
  list,
  create,
  update,
  remove,
  filesOf,
  byCode,
  publicInfo,
  unlock,
  assertOpen,
  assertType,
  limitFor,
  reserve,
  release,
  accept,
  tooBig,
  present,
  stateOf,
};
