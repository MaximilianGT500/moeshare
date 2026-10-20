'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

const isValidUsername = (username) => typeof username === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(username) && !/^\.+$/.test(username);

const isSafeFilename = (filename) =>
  typeof filename === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/.test(filename) && !filename.includes('..');

function extensionOf(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

function baseNameOf(filename) {
  const ext = extensionOf(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

function userDirs(username) {
  if (!isValidUsername(username)) throw new Error(`Ungültiger Benutzername: ${username}`);
  const root = path.join(config.paths.uploads, username);
  return { root, previewDir: path.join(root, 'preview'), hlsDir: path.join(root, 'm3u8') };
}

function filePaths(username, filename) {
  if (!isSafeFilename(filename)) throw new Error(`Ungültiger Dateiname: ${filename}`);
  const dirs = userDirs(username);
  const base = baseNameOf(filename);
  return {
    ...dirs,
    file: path.join(dirs.root, filename),
    preview: path.join(dirs.previewDir, filename),
    poster: path.join(dirs.previewDir, `${base}.jpg`),
    playlist: path.join(dirs.hlsDir, `${base}.m3u8`),
    hlsStarted: path.join(dirs.hlsDir, `conversionStarted-${base}`),
    hlsComplete: path.join(dirs.hlsDir, `conversionComplete-${base}`),
  };
}

function ensureUserDirs(username) {
  const dirs = userDirs(username);
  for (const dir of [dirs.root, dirs.previewDir, dirs.hlsDir]) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

module.exports = { isValidUsername, isSafeFilename, extensionOf, baseNameOf, userDirs, filePaths, ensureUserDirs };
