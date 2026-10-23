'use strict';

const { shape, toMs, toInt, truthy, parseBytes } = require('./common');

async function detect(source) {
  if (source.client !== 'postgres') return null;
  const tables = await shape(source, ['User', 'File', 'Url', 'Folder']);
  if (!tables.User || !tables.File) return null;
  return { version: tables.File.has('deletesAt') ? 4 : 3 };
}

async function optional(source, sql, params = []) {
  try {
    return await source.db.all(sql, params);
  } catch {
    return [];
  }
}

async function read(source) {
  const found = await detect(source);
  if (!found) throw new Error('Das sieht nicht nach einer Zipline-Datenbank aus.');
  const v4 = found.version === 4;
  const db = source.db;

  const users = (
    await db.all(
      v4
        ? 'SELECT id, username, password, role, "createdAt" FROM "User"'
        : 'SELECT id, username, password, administrator, "superAdmin" FROM "User"'
    )
  ).map((row) => ({
    sourceId: String(row.id),
    username: row.username,
    password: row.password || '',
    admin: v4 ? ['ADMIN', 'SUPERADMIN'].includes(row.role) : truthy(row.administrator) || truthy(row.superAdmin),
    active: true,
    createdAt: toMs(row.createdAt),
    quotaBytes: null,
    email: null,
  }));
  if (v4) {
    const quotas = await optional(source, 'SELECT "userId", "filesQuota", "maxBytes" FROM "UserQuota"');
    for (const quota of quotas) {
      const user = users.find((candidate) => candidate.sourceId === String(quota.userId));
      if (user && quota.filesQuota === 'BY_BYTES') user.quotaBytes = parseBytes(quota.maxBytes);
    }
  }

  const folders = (await optional(source, 'SELECT id, name, public, "userId", "createdAt" FROM "Folder"')).map((row) => ({
    sourceId: String(row.id),
    ownerId: String(row.userId),
    title: row.name,
    description: '',
    visibility: truthy(row.public) ? 'link' : 'private',
    code: null,
    createdAt: toMs(row.createdAt),
    legacy: truthy(row.public) ? [{ path: `/folder/${row.id}` }] : [],
  }));

  const tagNames = new Map((await optional(source, 'SELECT id, name FROM "Tag"')).map((row) => [String(row.id), row.name]));
  const fileTags = new Map();
  for (const row of await optional(source, 'SELECT "A", "B" FROM "_FileToTag"')) {
    const list = fileTags.get(String(row.A)) || [];
    if (tagNames.has(String(row.B))) list.push(tagNames.get(String(row.B)));
    fileTags.set(String(row.A), list);
  }

  const files = (
    await db.all(
      v4
        ? 'SELECT id, name, "originalName", size, type, views, "maxViews", password, "userId", "folderId", "createdAt", "deletesAt" FROM "File"'
        : 'SELECT id, name, "originalName", size, mimetype AS type, views, "maxViews", password, "userId", "folderId", "createdAt", "expiresAt" AS "deletesAt" FROM "File"'
    )
  ).map((row) => {
    const text = /^text\//.test(String(row.type || ''));
    return {
      sourceId: String(row.id),
      ownerId: row.userId === null || row.userId === undefined ? null : String(row.userId),
      path: row.name,
      name: row.name,
      originalName: row.originalName || null,
      size: toInt(row.size),
      createdAt: toMs(row.createdAt),
      expiresAt: toMs(row.deletesAt),
      views: toInt(row.views),
      maxViews: row.maxViews ? toInt(row.maxViews) : null,
      passwordHash: row.password || null,
      tags: fileTags.get(String(row.id)) || [],
      albums: row.folderId ? [String(row.folderId)] : [],
      legacy: [
        { path: `/u/${row.name}`, variant: text || row.password ? 'view' : 'direct' },
        { path: v4 ? `/raw/${row.name}` : `/r/${row.name}`, variant: 'direct' },
      ],
    };
  });

  const links = (
    await optional(
      source,
      v4
        ? 'SELECT id, code, vanity, destination, views, "maxViews", password, enabled, "userId", "createdAt" FROM "Url"'
        : 'SELECT id, id AS code, vanity, destination, views, "maxViews", "userId", "createdAt" FROM "Url"'
    )
  ).map((row) => ({
    sourceId: String(row.id),
    ownerId: row.userId === null || row.userId === undefined ? null : String(row.userId),
    code: row.vanity || row.code,
    url: row.destination,
    title: null,
    clicks: toInt(row.views),
    maxClicks: row.maxViews ? toInt(row.maxViews) : null,
    passwordHash: row.password || null,
    enabled: row.enabled === undefined ? true : truthy(row.enabled),
    createdAt: toMs(row.createdAt),
    legacy: [...new Set([row.code, row.vanity].filter(Boolean))].map((code) => ({ path: `/go/${code}` })),
  }));

  return { label: `Zipline ${found.version}`, users, files, albums: folders, links, pastes: [] };
}

module.exports = { id: 'zipline', label: 'Zipline', detect, read };
