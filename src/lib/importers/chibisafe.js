'use strict';

const { shape, toMs, toInt, truthy, parseBytes } = require('./common');

async function detect(source) {
  const tables = await shape(source, ['users', 'files', 'albums']);
  if (!tables.users || !tables.files) return null;
  if (!tables.files.has('uuid') || !tables.files.has('original')) return null;
  return { version: 5 };
}

async function optional(source, sql) {
  try {
    return await source.db.all(sql);
  } catch {
    return [];
  }
}

function grouped(rows, key, value) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(String(row[key])) || [];
    list.push(String(row[value]));
    map.set(String(row[key]), list);
  }
  return map;
}

async function read(source) {
  if (!(await detect(source))) throw new Error('Das sieht nicht nach einer Chibisafe-Datenbank aus.');
  const db = source.db;
  const roles = new Map(
    (await optional(source, 'SELECT id, name FROM roles')).map((row) => [String(row.id), String(row.name).toLowerCase()])
  );
  const userRoles = grouped(await optional(source, 'SELECT "A", "B" FROM "_rolesTousers"'), 'B', 'A');
  const users = (await db.all('SELECT * FROM users')).map((row) => ({
    sourceId: String(row.id),
    username: row.username,
    password: row.password || '',
    admin: (userRoles.get(String(row.id)) || []).some((id) => ['admin', 'owner'].includes(roles.get(id))),
    active: row.enabled === undefined ? true : truthy(row.enabled),
    createdAt: toMs(row.createdAt),
    quotaBytes: parseBytes(row.storageQuota),
    email: null,
  }));

  const shareLinks = await optional(source, 'SELECT identifier, "albumId", enabled FROM links');
  const albumRows = await optional(source, 'SELECT * FROM albums');
  const nsfw = new Set(albumRows.filter((row) => truthy(row.nsfw)).map((row) => String(row.id)));
  const albums = albumRows.map((row) => {
    const identifiers = shareLinks
      .filter((link) => String(link.albumId) === String(row.id) && truthy(link.enabled))
      .map((link) => link.identifier);
    return {
      sourceId: String(row.id),
      ownerId: String(row.userId),
      title: row.name || 'Album',
      description: row.description || '',
      visibility: identifiers.length ? 'link' : 'private',
      code: identifiers[0] || null,
      createdAt: toMs(row.createdAt),
      legacy: identifiers.map((identifier) => ({ path: `/a/${identifier}` })),
    };
  });

  const fileAlbums = grouped(await optional(source, 'SELECT "A", "B" FROM "_albumsTofiles"'), 'B', 'A');
  const tagNames = new Map((await optional(source, 'SELECT id, name FROM tags')).map((row) => [String(row.id), row.name]));
  const fileTags = grouped(await optional(source, 'SELECT "A", "B" FROM "_filesTotags"'), 'A', 'B');

  const files = (await db.all('SELECT * FROM files'))
    .filter((row) => !truthy(row.quarantine))
    .map((row) => {
      const inAlbums = fileAlbums.get(String(row.id)) || [];
      return {
        sourceId: String(row.id),
        ownerId: row.userId === null || row.userId === undefined ? null : String(row.userId),
        path: row.name,
        name: row.name,
        originalName: row.original || null,
        size: toInt(row.size),
        createdAt: toMs(row.createdAt),
        expiresAt: null,
        views: 0,
        maxViews: null,
        passwordHash: null,
        tags: (fileTags.get(String(row.id)) || []).map((id) => tagNames.get(id)).filter(Boolean),
        albums: inAlbums,
        warning: inAlbums.some((id) => nsfw.has(id)) ? '' : null,
        legacy: [{ path: `/${row.name}`, variant: 'direct' }],
      };
    });

  const links = (await optional(source, 'SELECT * FROM "shortenedLinks"')).map((row) => ({
    sourceId: String(row.id),
    ownerId: row.userId === null || row.userId === undefined ? null : String(row.userId),
    code: row.identifier,
    url: row.destination,
    title: null,
    clicks: toInt(row.views),
    maxClicks: null,
    passwordHash: null,
    enabled: true,
    createdAt: toMs(row.createdAt),
    legacy: [{ path: `/l/${row.identifier}` }],
  }));

  const pastes = (await optional(source, 'SELECT * FROM snippets')).map((row) => ({
    sourceId: String(row.id),
    ownerId: row.userId === null || row.userId === undefined ? null : String(row.userId),
    content: String(row.content || ''),
    title: row.name || null,
    syntax: row.language ? String(row.language).toLowerCase() : null,
    originalName: null,
    slug: row.identifier,
    createdAt: toMs(row.createdAt),
    expiresAt: null,
    views: 0,
    tags: [],
    albums: [],
    legacy: [{ path: `/s/${row.identifier}`, variant: 'view' }],
  }));

  return { label: 'Chibisafe', users, files, albums, links, pastes };
}

module.exports = { id: 'chibisafe', label: 'Chibisafe', detect, read };
