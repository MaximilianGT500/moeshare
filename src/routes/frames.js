'use strict';

const express = require('express');
const files = require('../services/fileService');
const albums = require('../services/albumService');
const domains = require('../services/domainService');
const frames = require('../services/frameService');
const profiles = require('../services/profileService');
const protection = require('../services/protectionService');
const settings = require('../services/settingsService');
const stats = require('../services/statsService');
const storage = require('../services/storageService');

const router = express.Router();

const optionsOf = (req) => ({ theme: frames.themeOf(req.query.theme), locale: req.language === 'en' ? 'en' : 'de' });

function send(res, html, status = 200) {
  res.removeHeader('X-Frame-Options');
  res.set('Content-Security-Policy', frames.POLICY);
  res.set('Cache-Control', 'private, max-age=60');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.status(status).type('html').send(html);
}

router.get('/frame/u/:user', async (req, res) => {
  const options = optionsOf(req);
  if (!frames.enabled()) return send(res, frames.missingFrame(options), 404);
  const found = await profiles.findPublic(req.params.user);
  if (!found || found.profile.blocked || (req.customDomain && Number(found.row.id) !== req.customDomain.userId)) {
    return send(res, frames.missingFrame(options), 404);
  }
  const data = await profiles.publicData(found, { domain: req.customDomain ? domains.requestOrigin(req) : null });
  stats.track(req, 'p', found.row.id, 'views');
  return send(res, frames.profileFrame(data, options));
});

router.get('/frame/a/:code', async (req, res) => {
  const options = optionsOf(req);
  if (!frames.enabled() || !settings.get('albums.enabled')) return send(res, frames.missingFrame(options), 404);
  const found = await albums.findByCode(req.params.code);
  const row = found && (!req.customDomain || Number(found.user_id) === req.customDomain.userId) ? found : null;
  const access = row ? await albums.access(req, row) : { state: 'hidden' };
  if (!row || access.state === 'hidden' || access.state === 'blocked') return send(res, frames.missingFrame(options), 404);
  const view = await albums.publicView(req, row);
  if (!access.owner) stats.track(req, 'a', row.id, 'views');
  return send(res, frames.albumFrame(view, { ...options, access, size: req.query.size }));
});

router.get('/frame/:slug', async (req, res) => {
  const options = optionsOf(req);
  if (!frames.enabled()) return send(res, frames.missingFrame(options), 404);
  const found = await files.findBySlug(req.params.slug);
  const record = found && storage.exists(found) && domains.servesOwner(req, found.username) ? found : null;
  const access = record ? protection.fileAccess(req, record) : { state: 'missing' };
  if (!record || ['missing', 'expired', 'blocked'].includes(access.state)) return send(res, frames.missingFrame(options), 404);
  if (!access.owner) stats.track(req, 'f', record.id, 'views');
  return send(res, frames.fileFrame(record, { ...options, access, domain: domains.requestOrigin(req) }));
});

module.exports = router;
