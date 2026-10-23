'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const settings = require('./services/settingsService');
const { loadSession } = require('./middleware/auth');
const { customDomain } = require('./middleware/customDomain');
const { requestLog } = require('./middleware/requestLog');
const { contentSecurityPolicy } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errors');
const redirects = require('./services/redirectService');
const i18n = require('./lib/i18n');

const trustProxy = () => (settings.get('system.trustProxy') ? 1 : false);

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy());
  settings.onChange((keys) => keys.includes('system.trustProxy') && app.set('trust proxy', trustProxy()));

  app.use(requestLog);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());

  app.use('/app/assets', express.static(path.join(config.paths.ui, 'assets'), { maxAge: '365d', immutable: true }), (req, res) =>
    res.status(404).end()
  );
  app.use(require('./routes/pwa'));
  app.use(require('./routes/i18n'));
  app.use(express.static(config.paths.public, { maxAge: '7d', index: false }));

  const json = express.json({ limit: '1mb' });
  const form = express.urlencoded({ extended: false, limit: '1mb' });
  const ownParser = new Set(['/api/texts', '/upload/text', '/api/account/watermark', '/api/account/watermark/preview']);
  app.use((req, res, next) => (ownParser.has(req.path) ? next() : json(req, res, next)));
  app.use((req, res, next) => (ownParser.has(req.path) ? next() : form(req, res, next)));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.language = i18n.detect(req, settings);
    next();
  });
  app.use((req, res, next) => {
    req.body ??= {};
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(contentSecurityPolicy);
  app.use(require('./routes/reports'));
  app.use(require('./routes/domains'));
  app.use(customDomain);
  app.use(loadSession);
  app.use((req, res, next) => {
    if (req.user) req.language = i18n.detect(req, settings);
    res.set('Content-Language', req.language);
    next();
  });

  app.use(redirects.middleware);
  app.use(require('./routes/profiles'));
  app.use(require('./routes/home'));
  app.use(require('./routes/setup'));
  app.use(require('./routes/auth'));
  app.use(require('./routes/dashboard'));
  app.use(require('./routes/account'));
  app.use(require('./routes/design'));
  app.use(require('./routes/embed'));
  app.use(require('./routes/admin'));
  app.use(require('./routes/moderation'));
  app.use(require('./routes/files'));
  app.use(require('./routes/upload'));
  app.use(require('./routes/links'));
  app.use(require('./routes/albums'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
