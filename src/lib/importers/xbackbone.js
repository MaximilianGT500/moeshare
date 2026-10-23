'use strict';

const { shape, toMs, toInt, truthy, inflate, extensionOf } = require('./common');

const FILE_TYPES = ['IMAGE', 'VIDEO', 'AUDIO', 'PDF', 'FILE', 'TEXT'];

async function detect(source) {
  const tables = await shape(source, ['users', 'uploads', 'resources']);
  if (tables.resources && tables.resources.has('fingerprint') && tables.users) return { version: 'next' };
  if (tables.uploads && tables.uploads.has('storage_path') && tables.users) return { version: 'legacy', tables };
  return null;
}

async function optional(source, sql) {
  try {
    return await source.db.all(sql);
  } catch {
    return [];
  }
}

async function readLegacy(source, tables) {
  const db = source.db;
  const userColumns = tables.users;
  const users = (await db.all('SELECT * FROM users')).map((row) => ({
    sourceId: String(row.id),
    username: row.username,
    password: row.password || '',
    admin: truthy(row.is_admin),
    active: row.active === undefined ? true : truthy(row.active),
    createdAt: toMs(row.registration_date),
    quotaBytes: userColumns.has('max_disk_quota') && Number(row.max_disk_quota) > 0 ? Number(row.max_disk_quota) : null,
    email: row.email || null,
    code: row.user_code || null,
  }));
  const codes = new Map(users.map((user) => [user.sourceId, user.code]));

  const tagNames = new Map((await optional(source, 'SELECT id, name FROM tags')).map((row) => [String(row.id), row.name]));
  const fileTags = new Map();
  for (const row of await optional(source, 'SELECT upload_id, tag_id FROM uploads_tags')) {
    const list = fileTags.get(String(row.upload_id)) || [];
    if (tagNames.has(String(row.tag_id))) list.push(tagNames.get(String(row.tag_id)));
    fileTags.set(String(row.upload_id), list);
  }

  const files = (await db.all('SELECT * FROM uploads')).map((row) => {
    const owner = row.user_id === null || row.user_id === undefined ? null : String(row.user_id);
    const userCode = owner ? codes.get(owner) : null;
    const published = row.published === undefined ? true : truthy(row.published);
    const ext = extensionOf(row.filename);
    const base = userCode ? `/${userCode}/${row.code}` : null;
    return {
      sourceId: String(row.id),
      ownerId: owner,
      path: row.storage_path,
      name: `${row.code}${ext}`,
      slug: row.code,
      originalName: row.filename || null,
      size: toInt(row.size),
      createdAt: toMs(row.timestamp),
      expiresAt: null,
      views: 0,
      maxViews: null,
      passwordHash: null,
      tags: fileTags.get(String(row.id)) || [],
      albums: [],
      hidden: !published,
      legacy:
        base && published
          ? [
              { path: base, variant: 'view' },
              ...(ext ? [{ path: `${base}${ext}`, variant: 'view' }] : []),
              { path: `${base}/raw`, variant: 'direct' },
              ...(ext ? [{ path: `${base}/raw${ext}`, variant: 'direct' }] : []),
              { path: `${base}/download`, variant: 'download' },
            ]
          : [],
    };
  });
  return { label: 'XBackBone', users, files, albums: [], links: [], pastes: [] };
}

async function readNext(source) {
  const db = source.db;
  const users = (await db.all('SELECT * FROM users')).map((row) => ({
    sourceId: String(row.id),
    username: row.name,
    password: row.password || '',
    admin: truthy(row.is_admin),
    active: row.status === undefined ? true : Number(row.status) !== 0,
    createdAt: toMs(row.created_at),
    quotaBytes: Number(row.quota) > 0 ? Number(row.quota) : null,
    email: row.email || null,
  }));
  const rows = await db.all('SELECT * FROM resources');
  const folders = rows
    .filter((row) => row.type === 'DIRECTORY')
    .map((row) => ({
      sourceId: String(row.id),
      ownerId: String(row.user_id),
      title: row.name || row.code || 'Ordner',
      description: '',
      visibility: truthy(row.is_private) ? 'private' : 'link',
      code: null,
      createdAt: toMs(row.created_at),
      legacy: [],
    }));
  const legacyFor = (row, ext) =>
    truthy(row.is_private) || !row.code
      ? []
      : [
          { path: `/${row.code}`, variant: 'view' },
          ...(ext ? [{ path: `/${row.code}${ext}`, variant: 'view' }] : []),
          { path: `/raw/${row.code}`, variant: 'direct' },
          ...(ext ? [{ path: `/raw/${row.code}${ext}`, variant: 'direct' }] : []),
          { path: `/download/${row.code}`, variant: 'download' },
        ];
  const base = (row) => {
    const ext = row.extension ? `.${String(row.extension).toLowerCase()}` : extensionOf(row.filename || row.name);
    return {
      sourceId: String(row.id),
      ownerId: String(row.user_id),
      slug: row.code || null,
      originalName: row.filename || row.name || null,
      size: toInt(row.size),
      createdAt: toMs(row.published_at || row.created_at),
      expiresAt: toMs(row.expires_at),
      views: toInt(row.views),
      maxViews: null,
      passwordHash: row.password || null,
      tags: [],
      albums: row.parent_id ? [String(row.parent_id)] : [],
      hidden: truthy(row.is_private),
      ext,
      legacy: legacyFor(row, ext),
    };
  };
  const files = [];
  const pastes = [];
  for (const row of rows) {
    if (!FILE_TYPES.includes(row.type)) continue;
    const item = base(row);
    if (row.type === 'TEXT' && row.data) {
      pastes.push({ ...item, content: inflate(row.data), title: row.name || null, syntax: null });
    } else if (row.fingerprint) {
      files.push({ ...item, path: row.fingerprint, name: `${row.code || row.fingerprint}${item.ext}` });
    }
  }
  const links = rows
    .filter((row) => row.type === 'LINK' && row.data)
    .map((row) => ({
      sourceId: String(row.id),
      ownerId: String(row.user_id),
      code: row.code,
      url: inflate(row.data),
      title: row.name || null,
      clicks: toInt(row.views),
      maxClicks: null,
      passwordHash: row.password || null,
      enabled: true,
      createdAt: toMs(row.created_at),
      legacy: row.code ? [{ path: `/${row.code}` }] : [],
    }));
  return { label: 'XBackBone', users, files, albums: folders, links, pastes };
}

async function read(source) {
  const found = await detect(source);
  if (!found) throw new Error('Das sieht nicht nach einer XBackBone-Datenbank aus.');
  return found.version === 'next' ? readNext(source) : readLegacy(source, found.tables);
}

module.exports = { id: 'xbackbone', label: 'XBackBone', detect, read };
