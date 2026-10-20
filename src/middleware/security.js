'use strict';

const crypto = require('crypto');
const config = require('../config');
const errorReports = require('../lib/errorReports');

const devOrigin = config.devServer ? new URL(config.devServer).origin : null;
const dev = devOrigin ? [devOrigin] : [];

const UNSAFE_UPLOAD = /\.(x?html?|xht|svgz?|xml|xslt?|shtml|mht(ml)?)$/i;
const UPLOAD_POLICY =
  "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; font-src 'self' data:";

function pagePolicy(nonce) {
  const directives = [
    ['default-src', "'self'"],
    ['script-src', "'self'", `'nonce-${nonce}'`, ...dev],
    ['style-src', "'self'", "'unsafe-inline'", ...dev],
    ['img-src', '*', 'data:', 'blob:'],
    ['media-src', "'self'", 'blob:', 'data:'],
    ['font-src', "'self'", 'data:', ...dev],
    ['connect-src', "'self'", ...dev, ...dev.map((origin) => origin.replace(/^http/, 'ws'))],
    ['worker-src', "'self'", 'blob:'],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'self'"],
  ];
  if (errorReports.active()) directives.push(['report-uri', '/api/csp-report']);
  return directives.map((parts) => parts.join(' ')).join('; ');
}

function contentSecurityPolicy(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.set('Content-Security-Policy', pagePolicy(nonce));
  next();
}

function protectUpload(res, file) {
  if (UNSAFE_UPLOAD.test(file)) res.setHeader('Content-Security-Policy', UPLOAD_POLICY);
}

module.exports = { contentSecurityPolicy, protectUpload };
