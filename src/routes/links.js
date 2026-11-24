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
const redirects = require('../services/redirectService');
const db = require('../lib/db');
const { displayPath } = require('../lib/slugs');
const { escapeHtml } = require('../lib/format');
const { translate } = require('../lib/i18n');

const router = express.Router();
const signedIn = requireApi();

const MISSING = 'Diesen Kurzlink gibt es nicht (mehr).';
const EXPIRED = 'Dieser Kurzlink ist abgelaufen.';
const USED = 'Dieser Kurzlink wurde schon so oft geöffnet wie erlaubt.';
const BLOCKED = 'Dieser Kurzlink wurde von der Moderation gesperrt.';

async function publicLink(req, code = req.params.code) {
  const row = await links.find(code);
  if (!row) return null;
  if (req.customDomain && Number(row.user_id) !== req.customDomain.userId) return null;
  return row;
}

const unlockLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });

async function movedLink(req, code = req.params.code) {
  const entry = await redirects.moved('link', `/s/${code}`);
  const row = entry ? await db.get('SELECT id, code, user_id FROM links WHERE id = ?', [entry.id]) : null;
  if (!row || (req.customDomain && Number(row.user_id) !== req.customDomain.userId)) return null;
  return `/s/${displayPath(row.code)}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function interstitial(req, res, row, access) {
  const host = hostOf(row.url);
  const heading = translate(req.language, 'Weiterleitung zu {host}', { host });
  res.set('Referrer-Policy', 'no-referrer');
  return renderPage(res, {
    page: 'view',
    title: 'Weiterleitung',
    head: [
      '<meta name="robots" content="noindex" />',
      `<meta property="og:title" content="${escapeHtml(heading)}" />`,
      `<meta property="og:description" content="${escapeHtml(row.url)}" />`,
    ].join('\n'),
    data: {
      interstitial: {
        code: row.code,
        url: row.url,
        host,
        secure: /^https:/i.test(row.url),
        next: `/s/${displayPath(row.code)}?go=1`,
        brokenSince: row.broken_since ? Number(row.broken_since) : null,
        checkedAt: row.checked_at ? Number(row.checked_at) : null,
        owner: Boolean(access.owner),
      },
    },
  });
}

router.get('/s/:code', async (req, res) => {
  const peek = req.params.code.length > 1 && req.params.code.endsWith('+');
  const code = peek ? req.params.code.slice(0, -1) : req.params.code;
  const row = await publicLink(req, code);
  if (!row) {
    const target = await movedLink(req, code);
    return target ? res.redirect(301, peek ? `${target}+` : target) : renderMessage(res, 404, MISSING);
  }
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
  if ((peek || links.interstitialFor(row)) && req.query.go !== '1') return interstitial(req, res, row, access);
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
  res.json(
    await links.list(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      search: text(req.query.search, 200),
      broken: req.query.broken === '1',
    })
  );
});

router.post('/api/links/:id/check', signedIn, async (req, res) => {
  res.json({ link: await links.checkNow(req.user.id, req.params.id) });
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
