'use strict';

const express = require('express');
const discord = require('../services/discordAppService');

const router = express.Router();
const raw = express.raw({ type: () => true, limit: '1mb' });

router.post('/api/discord/interactions', raw, async (req, res) => {
  if (!discord.ready()) return res.status(404).json({ error: 'Die Discord-App ist auf diesem Server abgeschaltet.' });
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!discord.verify(body, req.get('x-signature-ed25519'), req.get('x-signature-timestamp'))) {
    return res.status(401).json({ error: 'invalid request signature' });
  }
  let interaction;
  try {
    interaction = JSON.parse(body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'invalid json' });
  }
  return res.json(await discord.handle(interaction));
});

module.exports = router;
