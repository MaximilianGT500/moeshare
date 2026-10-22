'use strict';

const express = require('express');
const { HttpError, forbidden, notFound } = require('../lib/errors');
const { escapeHtml } = require('../lib/format');
const { limiter } = require('../lib/limiter');
const { renderPage, renderMessage } = require('../lib/render');
const { requireApi, sameOriginOnly } = require('../middleware/auth');
const albums = require('../services/albumService');
const designs = require('../services/designService');
const domains = require('../services/domainService');
const protection = require('../services/protectionService');
const settings = require('../services/settingsService');
const stats = require('../services/statsService');
const zips = require('../services/zipService');

const router = express.Router();
const signedIn = requireApi();

const MISSING = 'Dieses Album gibt es nicht (mehr).';
const BLOCKED = 'Dieses Album wurde von der Moderation gesperrt.';

const unlockLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });

const enabled = (req, res, next) => {
  if (!settings.get('albums.enabled')) throw notFound('Alben sind auf diesem Server abgeschaltet.');
  next();
};

async function publicAlbum(req) {
  const row = settings.get('albums.enabled') ? await albums.findByCode(req.params.code) : null;
  if (!row) return null;
  if (req.customDomain && Number(row.user_id) !== req.customDomain.userId) return null;
  return row;
}

router.get('/a/:code', async (req, res) => {
  const row = await publicAlbum(req);
  if (!row) return renderMessage(res, 404, MISSING);
  const access = albums.access(req, row);
  if (access.state === 'hidden') return renderMessage(res, 404, MISSING);
  if (access.state === 'blocked') return renderMessage(res, 451, BLOCKED, { title: 'Inhalt gesperrt' });
  if (access.state === 'locked') {
    return renderPage(res, {
      page: 'album',
      title: 'Geschütztes Album',
      head: '<meta name="robots" content="noindex" />',
      data: { locked: { kind: 'album', state: 'locked', slug: row.code, password: true } },
    });
  }
  const domain = domains.requestOrigin(req);
  const view = await albums.publicView(req, row, { domain });
  const style = await designs.forOwner(view.album.owner || '');
  if (!access.owner) stats.track(req, 'a', row.id, 'views');
  return renderPage(res, {
    page: 'album',
    titleRaw: view.album.title,
    head: [
      `<meta property="og:title" content="${escapeHtml(view.album.title)}" />`,
      '<meta property="og:type" content="website" />',
      '<meta name="robots" content="noindex" />',
    ].join('\n  '),
    data: {
      ...view,
      owner: Boolean(access.owner),
      design: style.design,
      css: style.css,
      report: settings.get('reports.enabled') ? { kind: 'album', target: row.code } : null,
    },
    scheme: style.design.scheme,
  });
});

router.get('/a/:code/zip', async (req, res) => {
  if (!settings.get('zip.enabled')) throw notFound('Der ZIP-Download ist auf diesem Server abgeschaltet.');
  const row = await publicAlbum(req);
  if (!row) throw notFound(MISSING);
  const access = albums.access(req, row);
  if (access.state === 'hidden') throw notFound(MISSING);
  if (access.state === 'blocked') throw new HttpError(451, BLOCKED);
  if (access.state === 'locked') return res.redirect(302, `/a/${encodeURIComponent(row.code)}`);
  const records = await albums.zipRecords(row);
  if (!records.length) throw notFound('In diesem Album gibt es nichts zum Herunterladen.');
  if (!access.owner) stats.track(req, 'a', row.id, 'downloads');
  return zips.send(res, records, row.title);
});

router.post('/a/:code/unlock', sameOriginOnly, unlockLimiter, async (req, res) => {
  const row = await publicAlbum(req);
  if (!row || !row.password_hash || row.visibility === 'private') throw notFound(MISSING);
  if (row.blocked_at) throw new HttpError(451, BLOCKED);
  if (!(await protection.checkPassword(row.password_hash, typeof req.body.password === 'string' ? req.body.password : ''))) {
    throw forbidden('Das Passwort stimmt nicht.', { code: 'wrong_password', field: 'password' });
  }
  protection.grant(req, res, 'a', row.id);
  res.json({ ok: true });
});

router.get('/api/albums', signedIn, enabled, async (req, res) => res.json({ albums: await albums.list(req.user) }));
router.post('/api/albums', signedIn, enabled, async (req, res) => res.json({ album: await albums.create(req.user, req.body) }));
router.get('/api/albums/:id', signedIn, enabled, async (req, res) => res.json({ album: await albums.get(req.user, req.params.id) }));
router.patch('/api/albums/:id', signedIn, enabled, async (req, res) =>
  res.json({ album: await albums.update(req.user, req.params.id, req.body) })
);
router.delete('/api/albums/:id', signedIn, enabled, async (req, res) => {
  await albums.remove(req.user, req.params.id);
  res.json({ ok: true });
});
router.get('/api/albums/:id/stats', signedIn, enabled, async (req, res) => {
  const album = await albums.get(req.user, req.params.id);
  res.json(await stats.series('a', album.id, { days: req.query.days }));
});
router.post('/api/albums/:id/files', signedIn, enabled, async (req, res) =>
  res.json({ album: await albums.addFiles(req.user, req.params.id, req.body.fileIds) })
);
router.delete('/api/albums/:id/files', signedIn, enabled, async (req, res) =>
  res.json({ album: await albums.removeFiles(req.user, req.params.id, req.body.fileIds) })
);
router.put('/api/albums/:id/order', signedIn, enabled, async (req, res) =>
  res.json({ album: await albums.reorder(req.user, req.params.id, req.body.fileIds) })
);

module.exports = router;
