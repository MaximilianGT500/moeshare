'use strict';

const express = require('express');
const { badRequest } = require('../lib/errors');
const { requireApi, sameOriginOnly } = require('../middleware/auth');
const comments = require('../services/commentService');
const audit = require('../services/auditService');

const router = express.Router();
const signedIn = requireApi();

router.get('/api/comments/recent', signedIn, async (req, res) => {
  res.json({
    enabled: comments.enabled(),
    mode: comments.mode(),
    comments: await comments.recentFor(req.user.id, { limit: req.query.limit }),
  });
});

router.delete('/api/comments/:id', sameOriginOnly, async (req, res) => {
  const body = req.body || {};
  const removed = await comments.remove(req.params.id, req.user || null, { token: typeof body.token === 'string' ? body.token : null });
  if (removed.byModerator) {
    audit.log('comment_removed', {
      userId: removed.ownerId,
      actorId: req.user.id,
      req,
      details: { kind: removed.row.kind === 'a' ? 'album' : 'file', excerpt: String(removed.row.body).slice(0, 80) },
    });
  }
  res.json({ ok: true });
});

router.patch('/api/comments/:id', signedIn, async (req, res) => {
  const body = req.body || {};
  if (typeof body.hidden !== 'boolean') throw badRequest('Erwartet wird an oder aus.', { field: 'hidden' });
  res.json({ ok: true, comment: await comments.hide(req.params.id, req.user, body.hidden) });
});

module.exports = router;
