'use strict';

const rateLimit = require('express-rate-limit');
const i18n = require('./i18n');

const TOO_MANY = 'Zu viele Versuche. Warte ein paar Minuten und versuche es dann erneut.';

const limiter = ({ windowMs, limit, message = TOO_MANY, ...rest }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: (req) => ({ error: i18n.translate(req.language, message) }),
    ...rest,
  });

module.exports = { limiter, TOO_MANY };
