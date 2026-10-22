'use strict';

const express = require('express');
const { notFound } = require('../lib/errors');
const { escapeHtml } = require('../lib/format');
const { renderPage, renderMessage } = require('../lib/render');
const domains = require('../services/domainService');
const profiles = require('../services/profileService');
const settings = require('../services/settingsService');
const stats = require('../services/statsService');

const router = express.Router();

const MISSING = 'Dieses Profil gibt es nicht oder es ist nicht öffentlich.';
const BLOCKED = 'Dieses Profil wurde von der Moderation gesperrt.';

async function render(req, res, username) {
  const found = await profiles.findPublic(username);
  if (!found || (req.customDomain && found.row.username !== req.customDomain.username)) {
    return renderMessage(res, 404, MISSING);
  }
  if (found.profile.blocked) return renderMessage(res, 451, BLOCKED, { title: 'Inhalt gesperrt' });
  const domain = domains.requestOrigin(req);
  const data = await profiles.publicData(found, { domain: req.customDomain ? domain : null });
  const owner = Boolean(req.user && (req.user.id === Number(found.row.id) || req.user.isAdmin));
  if (!owner) stats.track(req, 'p', found.row.id, 'views');
  const description = data.profile.bio ? data.profile.bio.replace(/\s+/g, ' ').slice(0, 200) : '';
  const meta = (key, value) => `<meta ${key} content="${escapeHtml(value)}" />`;
  return renderPage(res, {
    page: 'profile',
    titleRaw: data.profile.name,
    head: [
      meta('property="og:title"', data.profile.name),
      description && meta('property="og:description"', description),
      description && meta('name="description"', description),
      meta('property="og:type"', 'profile'),
      meta('property="og:url"', data.profile.url),
      meta('name="theme-color"', settings.get('site.uiColor')),
    ]
      .filter(Boolean)
      .join('\n  '),
    data: {
      ...data,
      owner,
      custom: Boolean(req.customDomain),
      report: settings.get('reports.enabled') ? { kind: 'profile', target: found.row.username } : null,
    },
    scheme: data.design.scheme,
  });
}

router.get('/', async (req, res, next) => {
  if (!req.customDomain) return next();
  return render(req, res, req.customDomain.username);
});

router.get('/u/:username', (req, res) => render(req, res, req.params.username));

router.get('/api/profiles/:username/files', async (req, res) => {
  const found = await profiles.findPublic(req.params.username);
  if (!found || found.profile.blocked || !found.profile.showFiles) throw notFound(MISSING);
  if (req.customDomain && found.row.username !== req.customDomain.username) throw notFound(MISSING);
  const domain = req.customDomain ? domains.requestOrigin(req) : null;
  res.json(await profiles.filesPage(found.row.username, Number.parseInt(req.query.page, 10) || 1, domain));
});

module.exports = router;
