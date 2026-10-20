'use strict';

const crypto = require('crypto');
const logger = require('../lib/logger');
const { storedIp } = require('../lib/request');

const log = logger.scope('http');
const FORWARDED_ID = /^[\w.-]{6,64}$/;

const pathOf = (req) => req.originalUrl.split('?')[0];

function requestLog(req, res, next) {
  const forwarded = req.get('x-request-id');
  req.id = forwarded && FORWARDED_ID.test(forwarded) ? forwarded : crypto.randomBytes(6).toString('base64url');
  res.set('X-Request-Id', req.id);
  if (!logger.enabled('debug') || req.path === '/healthz') return next();

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    log.debug(`${req.method} ${pathOf(req)} ${res.statusCode}`, {
      ms: Math.round(ms * 10) / 10,
      bytes: Number(res.get('content-length')) || undefined,
      ip: storedIp(req),
      id: req.id,
    });
  });
  return next();
}

module.exports = { requestLog, pathOf };
