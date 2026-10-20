'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const errorReports = require('../lib/errorReports');

const router = express.Router();

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const reportBody = express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '16kb' });

router.post('/api/csp-report', limiter, reportBody, (req, res) => {
  errorReports.securityReport(req.body);
  res.status(204).end();
});

module.exports = router;
