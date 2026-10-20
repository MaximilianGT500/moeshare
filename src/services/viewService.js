'use strict';

const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('../lib/format');
const { filePaths } = require('../lib/storage');
const settings = require('./settingsService');
const files = require('./fileService');
const embeds = require('./embedService');

async function viewPage(record) {
  const { username, filename } = record;
  const { type, isGif } = files.typeOf(filename);
  const paths = filePaths(username, filename);
  const urls = files.urlsFor(username, filename);
  const local = `/uploads/${username}/${filename}`;
  const hlsComplete = fs.existsSync(paths.hlsComplete);
  const hlsConverting = type === 'video' && settings.get('uploads.hls') && !hlsComplete && fs.existsSync(paths.hlsStarted);
  const dominant =
    typeof record.dominant_color === 'string' && record.dominant_color.toLowerCase() !== '#ffffff' ? record.dominant_color : null;
  const embed = await embeds.embedFor(record);

  return {
    type,
    embed,
    directUrl: urls.direct,
    title: filename,
    head: embeds.metaTags(record, embed),
    noscript: `<p style="font-family:system-ui,sans-serif;padding:24px"><a href="${escapeHtml(local)}">${escapeHtml(filename)} öffnen</a></p>`,
    data: {
      file: {
        filename,
        type,
        isGif,
        width: record.resolution_width || 0,
        height: record.resolution_height || 0,
        sizeBytes: record.size_bytes || 0,
        views: record.views || 0,
        date: record.creation_date || '',
        username,
      },
      urls: {
        view: urls.view,
        direct: urls.direct,
        download: `/download/${filename}`,
        display: type === 'image' && !isGif && fs.existsSync(paths.preview) ? `/uploads/${username}/preview/${filename}` : local,
        poster: type === 'video' && fs.existsSync(paths.poster) ? `/uploads/${username}/preview/${path.basename(paths.poster)}` : null,
        hls: type === 'video' && hlsComplete ? `/uploads/${username}/m3u8/${path.basename(paths.playlist)}` : null,
      },
      accent: type === 'image' ? dominant : null,
      hlsConverting,
    },
  };
}

module.exports = { viewPage };
