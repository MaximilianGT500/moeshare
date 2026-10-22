'use strict';

const express = require('express');
const { gone, notFound, forbidden } = require('../lib/errors');
const { text } = require('../lib/input');
const { limiter } = require('../lib/limiter');
const { renderPage, renderMessage } = require('../lib/render');
const { requireApi, sameOriginOnly } = require('../middleware/auth');
const { isCrawler } = require('../lib/crawlers');
const links = require('../services/linkService');
const stats = require('../services/statsService');
const protection = require('../services/protectionService');
const settings = require('../services/settingsService');

const router = express.Router();
const signedIn = requireApi();

const MISSING = 'Diesen Kurzlink gibt es nicht (mehr).';
const EXPIRED = 'Dieser Kurzlink ist abgelaufen.';
const USED = 'Dieser Kurzlink wurde schon so oft geöffnet wie erlaubt.';
const BLOCKED = 'Dieser Kurzlink wurde von der Moderation gesperrt.';

async function publicLink(req) {
  const row = await links.find(req.params.code);
  if (!row) return null;
  if (req.customDomain && Number(row.user_id) !== req.customDomain.userId) return null;
  return row;
}

const unlockLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });

router.get('/s/:code', async (req, res) => {
  const row = await publicLink(req);
  if (!row) return renderMessage(res, 404, MISSING);
  const access = await links.access(req, row);
  if (access.state === 'expired') return renderMessage(res, 410, EXPIRED, { title: 'Abgelaufen' });
  if (access.state === 'blocked') return renderMessage(res, 451, BLOCKED, { title: 'Inhalt gesperrt' });
  if (access.state === 'used') return renderMessage(res, 410, USED, { title: 'Nicht mehr verfügbar' });
  if (access.state === 'locked') {
    return renderPage(res, {
      page: 'view',
      title: 'Geschützter Link',
      head: '<meta name="robots" content="noindex" />',
      data: {
        locked: {
          kind: 'link',
          state: 'locked',
          slug: row.code,
          password: true,
          once: false,
          expiresAt: row.expires_at ? Number(row.expires_at) : null,
        },
      },
    });
  }
  const crawler = isCrawler(req.get('user-agent'));
  if (!crawler && !access.owner && !(await links.click(row))) return renderMessage(res, 410, USED, { title: 'Nicht mehr verfügbar' });
  if (!access.owner) stats.track(req, 'l', row.id, 'views');
  res.set('Referrer-Policy', 'no-referrer');
  return res.redirect(302, row.url);
});

router.post('/s/:code/unlock', sameOriginOnly, unlockLimiter, async (req, res) => {
  const row = await publicLink(req);
  if (!row || !row.password_hash) throw notFound(MISSING);
  const access = await links.access(req, row);
  if (access.state === 'expired') throw gone(EXPIRED);
  if (access.state === 'blocked') throw forbidden(BLOCKED);
  if (!(await protection.checkPassword(row.password_hash, typeof req.body.password === 'string' ? req.body.password : ''))) {
    throw forbidden('Das Passwort stimmt nicht.', { code: 'wrong_password', field: 'password' });
  }
  protection.grant(req, res, 'l', row.id);
  res.json({ ok: true });
});

router.get('/api/links', signedIn, async (req, res) => {
  res.json(await links.list(req.user.id, { page: req.query.page, limit: req.query.limit, search: text(req.query.search, 200) }));
});

router.post('/api/links', signedIn, async (req, res) => {
  if (!settings.get('links.enabled')) throw notFound('Der Link-Kürzer ist auf diesem Server abgeschaltet.');
  res.json(await links.create(req.user, req.body.url, req.body));
});

router.patch('/api/links/:id', signedIn, async (req, res) => {
  res.json({ link: await links.update(req.user.id, req.params.id, req.body) });
});

router.get('/api/links/:id/stats', signedIn, async (req, res) => {
  const link = await links.owned(req.user.id, req.params.id);
  res.json(await stats.series('l', link.id, { days: req.query.days }));
});

router.delete('/api/links/:id', signedIn, async (req, res) => {
  await links.remove(req.user.id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
