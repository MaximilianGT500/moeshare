'use strict';

const express = require('express');
const { notFound } = require('../lib/errors');
const { escapeHtml } = require('../lib/format');
const { tr } = require('../lib/i18n');
const feed = require('../lib/feed');
const { renderPage, renderMessage } = require('../lib/render');
const domains = require('../services/domainService');
const profiles = require('../services/profileService');
const settings = require('../services/settingsService');
const stats = require('../services/statsService');
const avatars = require('../services/avatarService');
const icons = require('../services/profileIconService');
const { limiter } = require('../lib/limiter');
const { sameOriginOnly } = require('../middleware/auth');
const sharp = require('sharp');
const vcard = require('../lib/vcard');
const { discoveryTag } = require('../lib/oembed');

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
  const picture = data.profile.avatar ? `${domain || settings.get('site.baseUrl')}${data.profile.avatar}` : null;
  return renderPage(res, {
    page: 'profile',
    titleRaw: data.profile.name,
    head: [
      meta('property="og:title"', data.profile.name),
      description && meta('property="og:description"', description),
      description && meta('name="description"', description),
      meta('property="og:type"', 'profile'),
      meta('property="og:url"', data.profile.url),
      `<link rel="alternate" type="application/atom+xml" title="${escapeHtml(data.profile.name)}" href="${escapeHtml(feedUrl(req, found.row.username, domain || settings.get('site.baseUrl')))}" />`,
      picture && meta('property="og:image"', picture),
      picture && meta('property="og:image:width"', String(avatars.SIZE)),
      picture && meta('property="og:image:height"', String(avatars.SIZE)),
      meta('name="theme-color"', settings.get('site.uiColor')),
      discoveryTag(data.profile.url, data.profile.name),
    ]
      .filter(Boolean)
      .join('\n  '),
    data: {
      ...data,
      owner,
      custom: Boolean(req.customDomain),
      feed: feedUrl(req, found.row.username, domain || settings.get('site.baseUrl')),
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

async function sendFeed(req, res, username) {
  const found = await profiles.findPublic(username);
  if (!found || found.profile.blocked || (req.customDomain && found.row.username !== req.customDomain.username)) throw notFound(MISSING);
  const domain = domains.requestOrigin(req);
  const origin = domain || settings.get('site.baseUrl');
  const data = await profiles.publicData(found, { domain: req.customDomain ? domain : null });
  const absolute = (url) => (/^https?:\/\//.test(url) ? url : `${origin}${url}`);
  const t = (text, values) => tr(req, text, values);
  const files = data.files ? data.files.items.filter((item) => !item.locked).map((item) => feed.fileEntry(item, { t, absolute })) : [];
  const albumEntries = data.albums
    .filter((album) => !album.locked)
    .map((album) => ({
      id: album.url,
      title: t('Album: {title}', { title: album.title }),
      link: album.url,
      date: album.updatedAt,
      summary: album.description || t('{count} Dateien', { count: album.files }),
    }));
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/atom+xml; charset=utf-8');
  res.send(
    feed.atom({
      title: data.profile.name,
      subtitle: data.profile.bio ? data.profile.bio.replace(/\s+/g, ' ').slice(0, 300) : '',
      link: data.profile.url,
      self: feedUrl(req, found.row.username, origin),
      author: data.profile.name,
      icon: data.profile.avatar ? absolute(data.profile.avatar) : null,
      generator: settings.get('site.title'),
      entries: [...files, ...albumEntries],
    })
  );
}

const feedUrl = (req, username, origin) =>
  req.customDomain ? `${origin}/feed.xml` : `${origin}/u/${encodeURIComponent(username)}/feed.xml`;

router.get('/feed.xml', async (req, res, next) => {
  if (!req.customDomain) return next();
  return sendFeed(req, res, req.customDomain.username);
});

router.get('/u/:username/feed.xml', (req, res) => sendFeed(req, res, req.params.username));

router.get('/u/:username/avatar', async (req, res) => {
  const found = avatars.assertFound(await avatars.read(req.params.username));
  const current = req.query.v === found.version;
  res.removeHeader('Content-Security-Policy');
  res.set('Cache-Control', current ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('ETag', `"${found.version}"`);
  if (req.fresh) return res.status(304).end();
  return res.type('image/webp').send(found.image);
});

router.get('/u/:username/icons/:key', async (req, res) => {
  const image = await icons.read(req.params.username, req.params.key);
  if (!image) throw notFound('Dieses Symbol gibt es nicht.');
  res.removeHeader('Content-Security-Policy');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.type('image/webp').send(image);
});

const clickLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

router.post('/u/:username/links/:id/click', sameOriginOnly, clickLimiter, async (req, res) => {
  const found = await profiles.findPublic(req.params.username);
  const id = Number(req.params.id);
  if (!found || found.profile.blocked || !Number.isSafeInteger(id)) return res.status(204).end();
  if (req.customDomain && found.row.username !== req.customDomain.username) return res.status(204).end();
  const owner = Boolean(req.user && req.user.id === Number(found.row.id));
  const link = profiles.publicLinks(found.profile.links, found.row.username).find((entry) => entry.id === id && entry.type === 'link');
  if (link && !owner && !stats.isCrawler(req.get('user-agent'))) await stats.record('pl', id, 'views');
  return res.status(204).end();
});

async function contactPhoto(row) {
  if (!row.avatar || !avatars.enabled()) return null;
  const image = await avatars.file(row.id);
  if (!image) return null;
  return sharp(image).flatten({ background: '#ffffff' }).resize(256, 256).jpeg({ quality: 82 }).toBuffer();
}

router.get('/u/:username/contact.vcf', async (req, res) => {
  const found = await profiles.findPublic(req.params.username);
  if (!found || found.profile.blocked || !found.profile.contactCard) throw notFound(MISSING);
  if (req.customDomain && found.row.username !== req.customDomain.username) throw notFound(MISSING);
  const domain = domains.requestOrigin(req);
  const origin = domain || settings.get('site.baseUrl');
  const { row, profile } = found;
  const links = profiles.publicLinks(profile.links, row.username).filter((link) => link.type === 'link');
  const absolute = (url) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `${origin}${url}`);
  const card = vcard.build({
    name: profile.name || row.username,
    nickname: row.username,
    note: profile.bio,
    urls: [
      { url: req.customDomain ? `${origin}/` : absolute(`/u/${encodeURIComponent(row.username)}`), label: settings.get('site.title') },
      ...links.filter((link) => /^https?:/i.test(link.url)).map((link) => ({ url: link.url, label: link.label })),
    ],
    emails: links.filter((link) => /^mailto:/i.test(link.url)).map((link) => decodeURIComponent(link.url.slice(7).split('?')[0])),
    phones: links.filter((link) => /^tel:/i.test(link.url)).map((link) => link.url.slice(4)),
    photo: await contactPhoto(row).catch(() => null),
  });
  const file = `${(profile.name || row.username).replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || row.username}.vcf`;
  res.set('Cache-Control', 'no-store');
  res.attachment(file);
  return res.type('text/vcard; charset=utf-8').send(card);
});

router.get('/api/profiles/:username/files', async (req, res) => {
  const found = await profiles.findPublic(req.params.username);
  if (!found || found.profile.blocked || !found.profile.showFiles) throw notFound(MISSING);
  if (req.customDomain && found.row.username !== req.customDomain.username) throw notFound(MISSING);
  const domain = req.customDomain ? domains.requestOrigin(req) : null;
  res.json(await profiles.filesPage(found.row.username, Number.parseInt(req.query.page, 10) || 1, domain));
});

module.exports = router;
