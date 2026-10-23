'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const { ZipWriter, uniqueNames, cleanName } = require('../lib/zip');
const settings = require('./settingsService');
const files = require('./fileService');
const storage = require('./storageService');
const preferences = require('./preferenceService');
const watermarks = require('./watermarkService');
const { entryName } = require('./zipService');

const log = logger.scope('export');

const enabled = () => settings.get('export.enabled');

function parse(raw) {
  try {
    return JSON.parse(raw || 'null');
  } catch {
    return null;
  }
}

const iso = (value) => (value ? new Date(Number(value)).toISOString() : null);

const README = {
  de: `Datenexport aus {site}

Konto: {user}
Erstellt: {date}

account.json   Konto, Einstellungen, Profil, Design, Domains, Anmeldeverfahren
files.json     Alle Dateien mit Tags, Alben, Schutz und Versionen
albums.json    Eigene und geteilte Alben
links.json     Kurzlinks
activity.json  Aktivitäten des Kontos
files/         Die Dateien selbst
versions/      Ältere Versionen
trash/         Dateien aus dem Papierkorb
`,
  en: `Data export from {site}

Account: {user}
Created: {date}

account.json   Account, preferences, profile, design, domains, sign-in methods
files.json     All files with tags, albums, protection and versions
albums.json    Own and shared albums
links.json     Short links
activity.json  Account activity
files/         The files themselves
versions/      Older versions
trash/         Files from the trash
`,
};

async function collect(user, language) {
  const row = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
  const [records, versionRows, tagRows, albumRows, memberRows, linkRows, domainRows, tokenRows, passkeyRows, identityRows, activity] =
    await Promise.all([
      db.all('SELECT * FROM file_data WHERE username = ? ORDER BY id', [row.username]),
      db.all('SELECT v.* FROM file_versions v JOIN file_data f ON f.id = v.file_id WHERE f.username = ? ORDER BY v.file_id, v.version', [
        row.username,
      ]),
      db.all('SELECT t.file_id, t.tag FROM file_tags t JOIN file_data f ON f.id = t.file_id WHERE f.username = ?', [row.username]),
      db.all(
        `SELECT a.*, u.username AS owner_name FROM albums a JOIN users u ON u.id = a.user_id
         WHERE a.user_id = ? OR EXISTS (SELECT 1 FROM album_members m WHERE m.album_id = a.id AND m.user_id = ?) ORDER BY a.id`,
        [row.id, row.id]
      ),
      db.all(
        'SELECT m.album_id, u.username FROM album_members m JOIN users u ON u.id = m.user_id JOIN albums a ON a.id = m.album_id WHERE a.user_id = ?',
        [row.id]
      ),
      db.all('SELECT * FROM links WHERE user_id = ? ORDER BY id', [row.id]),
      db.all('SELECT domain, status, created_at, verified_at FROM user_domains WHERE user_id = ? ORDER BY id', [row.id]),
      db.all('SELECT name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY id', [row.id]),
      db.all('SELECT name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at', [row.id]),
      db.all('SELECT provider, name, created_at FROM identities WHERE user_id = ? ORDER BY id', [row.id]),
      db.all('SELECT at, action, ip, details FROM audit_log WHERE user_id = ? ORDER BY at DESC LIMIT 2000', [row.id]),
    ]);
  const albumFiles = albumRows.length
    ? await db.all(
        `SELECT f.album_id, f.file_id, f.sort_order FROM album_files f WHERE f.album_id IN (${albumRows.map(() => '?').join(', ')}) ORDER BY f.album_id, f.sort_order`,
        albumRows.map((album) => album.id)
      )
    : [];
  const watermark = await watermarks.get(row.id);
  return {
    row,
    records,
    versionRows,
    tags: tagRows,
    albumRows,
    albumFiles,
    memberRows,
    linkRows,
    language,
    account: {
      username: row.username,
      role: row.role,
      createdAt: iso(row.created_at),
      lastLoginAt: iso(row.last_login_at),
      email: row.email_verified_at ? row.email : null,
      preferences: await preferences.get(row.id),
      profile: parse(row.profile),
      design: parse(row.design),
      embed: parse(row.embed),
      watermark: { ...watermark, image: watermark.image ? `data:image/png;base64,${watermark.image}` : null },
      domains: domainRows.map((domain) => ({ ...domain, created_at: iso(domain.created_at), verified_at: iso(domain.verified_at) })),
      tokens: tokenRows.map((token) => ({ name: token.name, createdAt: iso(token.created_at), lastUsedAt: iso(token.last_used_at) })),
      passkeys: passkeyRows.map((passkey) => ({
        name: passkey.name,
        createdAt: iso(passkey.created_at),
        lastUsedAt: iso(passkey.last_used_at),
      })),
      identities: identityRows.map((identity) => ({
        provider: identity.provider,
        name: identity.name,
        createdAt: iso(identity.created_at),
      })),
      twoFactor: Boolean(row.totp_enabled_at),
    },
    activity: activity.map((entry) => ({ at: iso(entry.at), action: entry.action, ip: entry.ip || null, details: parse(entry.details) })),
  };
}

function buildIndex(data, includeFiles) {
  const fileNames = uniqueNames();
  const trashNames = uniqueNames();
  const versionNames = uniqueNames();
  const tagsOf = new Map();
  for (const entry of data.tags) tagsOf.set(Number(entry.file_id), [...(tagsOf.get(Number(entry.file_id)) || []), entry.tag]);
  const albumsOf = new Map();
  const codes = new Map(data.albumRows.map((album) => [Number(album.id), album.code]));
  for (const entry of data.albumFiles) {
    albumsOf.set(Number(entry.file_id), [...(albumsOf.get(Number(entry.file_id)) || []), codes.get(Number(entry.album_id))]);
  }
  const versionsOf = new Map();
  for (const version of data.versionRows)
    versionsOf.set(Number(version.file_id), [...(versionsOf.get(Number(version.file_id)) || []), version]);
  const entries = [];
  const fileList = data.records.map((record) => {
    const folder = record.deleted_at ? 'trash' : 'files';
    const zipPath = `${folder}/${(record.deleted_at ? trashNames : fileNames)(entryName(record))}`;
    entries.push({ record, path: zipPath });
    const versions = (versionsOf.get(Number(record.id)) || []).map((version) => {
      const versionPath = `versions/${versionNames(`${cleanName(record.slug || record.filename)} v${version.version} ${cleanName(version.original_name || version.filename)}`)}`;
      entries.push({
        record: { ...files.versionRecord(record, version), created_at: version.created_at, original_name: version.original_name },
        path: versionPath,
      });
      return {
        version: Number(version.version),
        name: version.original_name || version.filename,
        sizeBytes: Number(version.size_bytes),
        createdAt: iso(version.created_at),
        replacedAt: iso(version.replaced_at),
        note: version.note || null,
        path: includeFiles ? versionPath : null,
      };
    });
    const file = files.toFile(record);
    return {
      id: Number(record.id),
      slug: file.slug,
      name: entryName(record),
      title: record.title || null,
      type: file.type,
      sizeBytes: Number(record.size_bytes) || 0,
      createdAt: iso(record.created_at),
      expiresAt: iso(record.expires_at),
      deletedAt: iso(record.deleted_at),
      views: Number(record.views) || 0,
      password: Boolean(record.password_hash),
      maxViews: record.max_views || null,
      listed: Boolean(record.listed),
      warning: file.warning,
      sha256: record.sha256 || null,
      version: Number(record.version) || 1,
      tags: tagsOf.get(Number(record.id)) || [],
      albums: (albumsOf.get(Number(record.id)) || []).filter(Boolean),
      url: file.urls.view,
      path: includeFiles ? zipPath : null,
      versions,
    };
  });
  const own = new Set(data.records.map((record) => Number(record.id)));
  const albums = data.albumRows.map((album) => ({
    code: album.code,
    title: album.title,
    description: album.description || '',
    visibility: album.visibility,
    owner: album.owner_name,
    password: Boolean(album.password_hash),
    createdAt: iso(album.created_at),
    members: data.memberRows.filter((member) => Number(member.album_id) === Number(album.id)).map((member) => member.username),
    files: data.albumFiles
      .filter((entry) => Number(entry.album_id) === Number(album.id) && own.has(Number(entry.file_id)))
      .map((entry) => Number(entry.file_id)),
  }));
  const links = data.linkRows.map((link) => ({
    code: link.code,
    url: link.url,
    title: link.title || null,
    createdAt: iso(link.created_at),
    expiresAt: iso(link.expires_at),
    clicks: Number(link.clicks) || 0,
    maxClicks: link.max_clicks || null,
    password: Boolean(link.password_hash),
  }));
  return { fileList, albums, links, entries };
}

const json = (value) => [Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')];

async function send(res, user, { includeFiles = true, language = 'de' } = {}) {
  const data = await collect(user, language);
  const index = buildIndex(data, includeFiles);
  const stamp = new Date().toISOString().slice(0, 10);
  const root = cleanName(`${settings.get('site.title')} ${data.row.username} ${stamp}`).replace(/\s+/g, '-');
  res.status(200);
  res.attachment(`${root}.zip`);
  res.set('Content-Type', 'application/zip');
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  const zip = new ZipWriter(res);
  const now = new Date();
  const readme = (README[language] || README.de)
    .replace('{site}', settings.get('site.title'))
    .replace('{user}', data.row.username)
    .replace('{date}', now.toISOString());
  let added = 0;
  try {
    await zip.add(`${root}/${language === 'en' ? 'README.txt' : 'LIESMICH.txt'}`, [Buffer.from(readme, 'utf8')], { date: now });
    await zip.add(`${root}/account.json`, json(data.account), { date: now });
    await zip.add(`${root}/files.json`, json(index.fileList), { date: now });
    await zip.add(`${root}/albums.json`, json(index.albums), { date: now });
    await zip.add(`${root}/links.json`, json(index.links), { date: now });
    await zip.add(`${root}/activity.json`, json(data.activity), { date: now });
    if (includeFiles) {
      for (const entry of index.entries) {
        let source;
        try {
          source = await storage.openRead(entry.record);
        } catch (error) {
          log.warn('Eine Datei fehlt und bleibt im Export außen vor', { user: data.row.username, file: entry.record.filename, error });
          continue;
        }
        await zip.add(`${root}/${entry.path}`, source.stream, {
          size: source.size,
          date: new Date(Number(entry.record.created_at) || Date.now()),
        });
        added += 1;
      }
    }
    await zip.finish();
    res.end();
    log.info('Datenexport erstellt', { user: data.row.username, files: added });
  } catch (error) {
    if (error.code !== 'ABORTED') log.warn('Der Datenexport wurde abgebrochen', { error });
    res.destroy();
  }
}

module.exports = { enabled, send };
