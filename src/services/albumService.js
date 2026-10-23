'use strict';

const db = require('../lib/db');
const { badRequest, conflict, forbidden, notFound } = require('../lib/errors');
const { randomString } = require('../lib/slugs');
const settings = require('./settingsService');
const files = require('./fileService');
const protection = require('./protectionService');
const audit = require('./auditService');
const webhook = require('./webhookService');

const VISIBILITY = ['private', 'link', 'public'];
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_FILES = 500;
const MAX_MEMBERS = 20;
const MISSING = 'Dieses Album gibt es nicht (mehr).';

const cleanTitle = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : '');

const LIVE_FILE = 'd.deleted_at IS NULL';
const PUBLIC_FILE = 'd.deleted_at IS NULL AND d.blocked_at IS NULL';

function present(row, extra = {}) {
  const base = settings.get('site.baseUrl');
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description || '',
    visibility: row.visibility,
    password: Boolean(row.password_hash),
    coverFileId: row.cover_file_id || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    url: `${base}/a/${row.code}`,
    blocked: row.blocked_at ? { at: Number(row.blocked_at), reason: row.blocked_reason || '' } : null,
    owner: row.owner_name || null,
    role: row.member_role ? 'member' : 'owner',
    members: row.member_count !== undefined ? Number(row.member_count) || 0 : undefined,
    ...extra,
  };
}

const codeTaken = async (code) => Boolean(await db.get('SELECT id FROM albums WHERE code = ?', [code]));

async function create(user, input = {}) {
  const title = cleanTitle(input.title);
  if (!title) throw badRequest('Gib dem Album einen Namen.', { field: 'title' });
  const visibility = input.visibility === undefined ? 'link' : input.visibility;
  if (!VISIBILITY.includes(visibility)) throw badRequest('Ungültige Sichtbarkeit.', { field: 'visibility' });
  const description =
    typeof input.description === 'string' ? input.description.replace(/\r\n?/g, '\n').trim().slice(0, MAX_DESCRIPTION) : '';
  const hashed = input.password ? await protection.hashPassword(input.password) : null;
  if (hashed && hashed.error) throw badRequest('Das Passwort ist zu lang.', { field: 'password' });
  let code = randomString(10);
  while (await codeTaken(code)) code = randomString(12);
  const now = Date.now();
  const id = await db.insertRow('albums', {
    code,
    user_id: user.id,
    title,
    description: description || null,
    visibility,
    password_hash: hashed,
    cover_file_id: null,
    created_at: now,
    updated_at: now,
  });
  if (Array.isArray(input.fileIds) && input.fileIds.length) await addFiles(user, id, input.fileIds);
  return get(user, id);
}

const ALBUM_SELECT = `SELECT a.*, u.username AS owner_name, m.role AS member_role,
  (SELECT COUNT(*) FROM album_members x WHERE x.album_id = a.id) AS member_count
  FROM albums a JOIN users u ON u.id = a.user_id LEFT JOIN album_members m ON m.album_id = a.id AND m.user_id = ?`;

async function accessible(user, id, { manage = false } = {}) {
  const row = Number.isSafeInteger(Number(id))
    ? await db.get(`${ALBUM_SELECT} WHERE a.id = ? AND (a.user_id = ? OR m.user_id IS NOT NULL)`, [user.id, Number(id), user.id])
    : null;
  if (!row) throw notFound(MISSING);
  if (manage && row.member_role) throw forbidden('Das darf nur, wem das Album gehört.');
  return row;
}

const owned = (user, id) => accessible(user, id, { manage: true });

async function list(user) {
  const rows = await db.all(
    `${ALBUM_SELECT.replace(
      'FROM albums a',
      `, (SELECT COUNT(*) FROM album_files f JOIN file_data d ON d.id = f.file_id WHERE f.album_id = a.id AND ${LIVE_FILE}) AS file_count FROM albums a`
    )} WHERE a.user_id = ? OR m.user_id IS NOT NULL ORDER BY a.updated_at DESC, a.id DESC`,
    [user.id, user.id]
  );
  const covers = await coverFiles(rows);
  return rows.map((row) => present(row, { files: Number(row.file_count) || 0, cover: covers.get(Number(row.id)) || null }));
}

async function membersOf(albumId) {
  const rows = await db.all(
    'SELECT m.user_id, m.role, m.added_at, u.username FROM album_members m JOIN users u ON u.id = m.user_id WHERE m.album_id = ? ORDER BY m.added_at, u.username',
    [albumId]
  );
  return rows.map((row) => ({ id: Number(row.user_id), username: row.username, role: row.role, addedAt: Number(row.added_at) }));
}

async function coverFiles(rows, { domain = null } = {}) {
  const map = new Map();
  for (const row of rows) {
    const chosen = row.cover_file_id
      ? await db.get(`SELECT * FROM file_data d WHERE d.id = ? AND ${PUBLIC_FILE}`, [row.cover_file_id])
      : null;
    const file =
      chosen ||
      (await db.get(
        `SELECT d.* FROM album_files f JOIN file_data d ON d.id = f.file_id WHERE f.album_id = ? AND ${PUBLIC_FILE} ORDER BY f.sort_order, f.added_at LIMIT 1`,
        [row.id]
      ));
    if (file && !protection.isProtected(file)) {
      const { type } = files.typeOf(file.filename, file.syntax);
      const urls = files.urlsFor(file, { domain });
      map.set(Number(row.id), {
        type,
        url: type === 'image' ? urls.preview : type === 'video' ? urls.preview : null,
        color: file.dominant_color,
      });
    }
  }
  return map;
}

async function filesOf(albumId, { publicOnly = false, domain = null } = {}) {
  const rows = await db.all(
    `SELECT d.*, f.added_by AS album_added_by FROM album_files f JOIN file_data d ON d.id = f.file_id WHERE f.album_id = ? AND ${publicOnly ? PUBLIC_FILE : LIVE_FILE} ORDER BY f.sort_order, f.added_at, d.id`,
    [albumId]
  );
  return files.withTags(rows, { domain });
}

async function get(user, id) {
  const row = await accessible(user, id);
  const items = await filesOf(row.id);
  const members = await membersOf(row.id);
  return present(row, {
    files: items.length,
    items: items.map((item) => ({ ...item, mine: item.username === user.username })),
    memberList: members,
    contributors: [...new Set(items.map((item) => item.username))],
  });
}

async function update(user, id, patch = {}) {
  const row = await owned(user, id);
  const fields = {};
  if (patch.title !== undefined) {
    const title = cleanTitle(patch.title);
    if (!title) throw badRequest('Gib dem Album einen Namen.', { field: 'title' });
    fields.title = title;
  }
  if (patch.description !== undefined) {
    fields.description =
      typeof patch.description === 'string' ? patch.description.replace(/\r\n?/g, '\n').trim().slice(0, MAX_DESCRIPTION) || null : null;
  }
  if (patch.visibility !== undefined) {
    if (!VISIBILITY.includes(patch.visibility)) throw badRequest('Ungültige Sichtbarkeit.', { field: 'visibility' });
    fields.visibility = patch.visibility;
  }
  if (patch.password !== undefined) {
    const hashed = patch.password ? await protection.hashPassword(patch.password) : null;
    if (hashed && hashed.error) throw badRequest('Das Passwort ist zu lang.', { field: 'password' });
    fields.password_hash = hashed;
  }
  if (patch.coverFileId !== undefined) {
    if (patch.coverFileId === null) fields.cover_file_id = null;
    else {
      const inside = await db.get('SELECT file_id FROM album_files WHERE album_id = ? AND file_id = ?', [
        row.id,
        Number(patch.coverFileId) || 0,
      ]);
      if (!inside) throw badRequest('Das Titelbild muss im Album liegen.', { field: 'coverFileId' });
      fields.cover_file_id = inside.file_id;
    }
  }
  fields.updated_at = Date.now();
  const columns = Object.keys(fields);
  await db.run(`UPDATE albums SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
    ...columns.map((column) => fields[column]),
    row.id,
  ]);
  return get(user, row.id);
}

async function remove(user, id) {
  const row = await owned(user, id);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM album_files WHERE album_id = ?', [row.id]);
    await tx.run('DELETE FROM album_members WHERE album_id = ?', [row.id]);
    await tx.run("DELETE FROM stats_daily WHERE kind = 'a' AND ref_id = ?", [row.id]);
    await tx.run("DELETE FROM stats_sources WHERE kind = 'a' AND ref_id = ?", [row.id]);
    await tx.run('DELETE FROM albums WHERE id = ?', [row.id]);
  });
  return present(row);
}

async function ownFileIds(user, ids) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!wanted.length) return [];
  const rows = await db.all(
    `SELECT id FROM file_data WHERE username = ? AND deleted_at IS NULL AND id IN (${wanted.map(() => '?').join(', ')})`,
    [user.username, ...wanted]
  );
  return rows.map((row) => Number(row.id));
}

async function addFiles(user, id, ids) {
  const row = await accessible(user, id);
  const fileIds = await ownFileIds(user, ids);
  if (!fileIds.length) throw badRequest('Wähle mindestens eine eigene Datei aus.', { field: 'fileIds' });
  const count = await db.count('SELECT COUNT(*) FROM album_files WHERE album_id = ?', [row.id]);
  if (count + fileIds.length > MAX_FILES) throw badRequest(`Ein Album fasst höchstens ${MAX_FILES} Dateien.`);
  let order = await db.count('SELECT COALESCE(MAX(sort_order), 0) FROM album_files WHERE album_id = ?', [row.id]);
  const now = Date.now();
  await db.transaction(async (tx) => {
    for (const fileId of fileIds) {
      order += 1;
      await tx.insertIgnore('album_files', { album_id: row.id, file_id: fileId, sort_order: order, added_at: now, added_by: user.id });
    }
    await tx.run('UPDATE albums SET updated_at = ? WHERE id = ?', [now, row.id]);
  });
  return get(user, row.id);
}

async function removableIds(user, row, ids) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))];
  if (!wanted.length) return [];
  const marks = wanted.map(() => '?').join(', ');
  const rows = row.member_role
    ? await db.all(
        `SELECT f.file_id FROM album_files f JOIN file_data d ON d.id = f.file_id WHERE f.album_id = ? AND f.file_id IN (${marks}) AND (f.added_by = ? OR d.username = ?)`,
        [row.id, ...wanted, user.id, user.username]
      )
    : await db.all(`SELECT file_id FROM album_files WHERE album_id = ? AND file_id IN (${marks})`, [row.id, ...wanted]);
  return rows.map((entry) => Number(entry.file_id));
}

async function removeFiles(user, id, ids) {
  const row = await accessible(user, id);
  const fileIds = await removableIds(user, row, ids);
  if (fileIds.length) {
    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM album_files WHERE album_id = ? AND file_id IN (${fileIds.map(() => '?').join(', ')})`, [
        row.id,
        ...fileIds,
      ]);
      await tx.run(
        `UPDATE albums SET cover_file_id = NULL, updated_at = ? WHERE id = ? AND cover_file_id IN (${fileIds.map(() => '?').join(', ')})`,
        [Date.now(), row.id, ...fileIds]
      );
    });
  }
  return get(user, row.id);
}

async function reorder(user, id, ids) {
  const row = await owned(user, id);
  const order = (Array.isArray(ids) ? ids : []).map(Number);
  await db.transaction(async (tx) => {
    for (const [index, fileId] of order.entries()) {
      await tx.run('UPDATE album_files SET sort_order = ? WHERE album_id = ? AND file_id = ?', [index + 1, row.id, fileId]);
    }
    await tx.run('UPDATE albums SET updated_at = ? WHERE id = ?', [Date.now(), row.id]);
  });
  return get(user, row.id);
}

async function addMember(user, id, username) {
  const row = await owned(user, id);
  const name = typeof username === 'string' ? username.trim() : '';
  if (!name) throw badRequest('Gib einen Benutzernamen ein.', { field: 'username' });
  const member = await db.get("SELECT id, username, status FROM users WHERE lower(username) = lower(?) AND status = 'active'", [name]);
  if (!member) throw notFound('Diesen Benutzer gibt es nicht.', { field: 'username' });
  if (Number(member.id) === Number(row.user_id)) throw badRequest('Das Album gehört dir schon.', { field: 'username' });
  if (await db.get('SELECT 1 AS found FROM album_members WHERE album_id = ? AND user_id = ?', [row.id, member.id])) {
    throw conflict('Diese Person ist schon dabei.', { field: 'username' });
  }
  if ((await db.count('SELECT COUNT(*) FROM album_members WHERE album_id = ?', [row.id])) >= MAX_MEMBERS) {
    throw badRequest(`Ein Album lässt sich mit höchstens ${MAX_MEMBERS} Personen teilen.`, { field: 'username' });
  }
  const now = Date.now();
  await db.insertIgnore('album_members', { album_id: row.id, user_id: member.id, role: 'contributor', added_at: now, added_by: user.id });
  await db.run('UPDATE albums SET updated_at = ? WHERE id = ?', [now, row.id]);
  audit.log('album_shared', { userId: member.id, actorId: user.id, details: { album: row.title, owner: user.username } });
  webhook.notify('album', 'Album geteilt', `Album: **${row.title}**\nVon: **${user.username}**\nMit: **${member.username}**`);
  return get(user, row.id);
}

async function dropContributions(albumId, member) {
  await db.run(
    `DELETE FROM album_files WHERE album_id = ? AND (added_by = ? OR file_id IN (SELECT id FROM file_data WHERE username = ?))`,
    [albumId, member.id, member.username]
  );
  await db.run('UPDATE albums SET cover_file_id = NULL WHERE id = ? AND cover_file_id IN (SELECT id FROM file_data WHERE username = ?)', [
    albumId,
    member.username,
  ]);
}

async function removeMember(user, id, memberId) {
  const row = await owned(user, id);
  const member = await db.get(
    'SELECT u.id, u.username FROM album_members m JOIN users u ON u.id = m.user_id WHERE m.album_id = ? AND m.user_id = ?',
    [row.id, Number(memberId) || 0]
  );
  if (!member) throw notFound('Diese Person ist nicht (mehr) dabei.');
  await db.run('DELETE FROM album_members WHERE album_id = ? AND user_id = ?', [row.id, member.id]);
  await dropContributions(row.id, member);
  await db.run('UPDATE albums SET updated_at = ? WHERE id = ?', [Date.now(), row.id]);
  return get(user, row.id);
}

async function leave(user, id) {
  const row = await accessible(user, id);
  if (!row.member_role) throw badRequest('Ein eigenes Album kannst du nicht verlassen, nur löschen.');
  await db.run('DELETE FROM album_members WHERE album_id = ? AND user_id = ?', [row.id, user.id]);
  await dropContributions(row.id, { id: user.id, username: user.username });
  audit.log('album_left', { userId: user.id, details: { album: row.title } });
  return { ok: true };
}

const findByCode = (code) =>
  typeof code === 'string' && /^[A-Za-z0-9]{6,32}$/.test(code) ? db.get('SELECT * FROM albums WHERE code = ?', [code]) : null;

const isMember = async (user, row) =>
  Boolean(user && (await db.get('SELECT 1 AS found FROM album_members WHERE album_id = ? AND user_id = ?', [row.id, user.id])));

async function access(req, row) {
  if (req.user && (req.user.id === row.user_id || req.user.isAdmin)) return { state: 'open', owner: true };
  if (await isMember(req.user, row)) return { state: 'open', owner: false, member: true };
  if (row.visibility === 'private') return { state: 'hidden' };
  if (row.blocked_at) return { state: 'blocked' };
  if (row.password_hash && !protection.granted(req, 'a', row.id)) return { state: 'locked' };
  return { state: 'open' };
}

function publicFile(file) {
  const guarded = file.password || file.maxViews;
  return {
    warning: file.warning === null || file.warning === undefined ? null : file.warning,
    id: file.id,
    slug: file.slug,
    title: guarded ? null : file.title,
    name: guarded ? null : file.title || file.originalName || file.filename,
    filename: guarded ? null : file.filename,
    type: file.type,
    isGif: file.isGif,
    width: file.width,
    height: file.height,
    color: file.color,
    sizeBytes: file.sizeBytes,
    locked: Boolean(guarded),
    once: Boolean(file.maxViews),
    view: file.urls.view,
    preview: guarded ? null : file.type === 'image' || file.type === 'video' ? file.urls.preview : null,
    direct: guarded ? null : file.urls.direct,
    download: guarded ? null : file.urls.download,
  };
}

const albumUrl = (row, domain) => `${domain || settings.get('site.baseUrl')}/a/${row.code}`;

async function publicView(req, row, { domain = null } = {}) {
  const owner = await db.get('SELECT username FROM users WHERE id = ?', [row.user_id]);
  const now = Date.now();
  const items = (await filesOf(row.id, { publicOnly: true, domain }))
    .filter((file) => !file.expiresAt || file.expiresAt > now)
    .map((file) => ({ ...publicFile(file), username: file.username }));
  const contributors = [...new Set(items.map((item) => item.username).filter((name) => name && (!owner || name !== owner.username)))];
  return {
    album: {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description || '',
      owner: owner ? owner.username : null,
      contributors,
      updatedAt: Number(row.updated_at),
      url: albumUrl(row, domain),
      zip: settings.get('zip.enabled') && items.some((item) => !item.locked),
    },
    items,
  };
}

async function zipRecords(row) {
  const now = Date.now();
  const rows = await db.all(
    `SELECT d.* FROM album_files f JOIN file_data d ON d.id = f.file_id WHERE f.album_id = ? AND ${PUBLIC_FILE} ORDER BY f.sort_order, f.added_at, d.id`,
    [row.id]
  );
  return rows.filter((file) => !protection.isProtected(file) && (!file.expires_at || Number(file.expires_at) > now));
}

async function archiveRecords(user, id) {
  const row = await accessible(user, id);
  const now = Date.now();
  const rows = await db.all(
    `SELECT d.* FROM album_files f JOIN file_data d ON d.id = f.file_id WHERE f.album_id = ? AND ${PUBLIC_FILE} ORDER BY f.sort_order, f.added_at, d.id`,
    [row.id]
  );
  const records = rows.filter(
    (file) => (file.username === user.username || !protection.isProtected(file)) && (!file.expires_at || Number(file.expires_at) > now)
  );
  return { row, records };
}

async function publicAlbums(userId, { domain = null } = {}) {
  const rows = await db.all(
    `SELECT a.*, (SELECT COUNT(*) FROM album_files f JOIN file_data d ON d.id = f.file_id WHERE f.album_id = a.id AND ${PUBLIC_FILE}) AS file_count
     FROM albums a WHERE a.user_id = ? AND a.visibility = 'public' AND a.blocked_at IS NULL ORDER BY a.updated_at DESC, a.id DESC LIMIT 60`,
    [userId]
  );
  const covers = await coverFiles(
    rows.filter((row) => !row.password_hash),
    { domain }
  );
  return rows.map((row) => ({
    code: row.code,
    title: row.title,
    description: row.description || '',
    files: Number(row.file_count) || 0,
    locked: Boolean(row.password_hash),
    url: albumUrl(row, domain),
    cover: covers.get(Number(row.id)) || null,
    updatedAt: Number(row.updated_at),
  }));
}

module.exports = {
  VISIBILITY,
  create,
  list,
  get,
  update,
  remove,
  addFiles,
  removeFiles,
  reorder,
  addMember,
  removeMember,
  leave,
  findByCode,
  access,
  publicView,
  publicFile,
  publicAlbums,
  zipRecords,
  archiveRecords,
};
