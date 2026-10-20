'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const settings = require('./services/settingsService');
const { loadSession } = require('./middleware/auth');
const { requestLog } = require('./middleware/requestLog');
const { contentSecurityPolicy, protectUpload } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errors');

const trustProxy = () => (settings.get('system.trustProxy') ? 1 : false);

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('views', config.paths.views);
  app.set('view engine', 'ejs');
  app.set('trust proxy', trustProxy());
  settings.onChange((keys) => keys.includes('system.trustProxy') && app.set('trust proxy', trustProxy()));

  app.use(requestLog);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());

  app.use(
    '/uploads',
    express.static(config.paths.uploads, {
      maxAge: '365d',
      immutable: true,
      setHeaders(res, file) {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        if (file.endsWith('.m3u8')) res.setHeader('Cache-Control', 'no-cache');
        protectUpload(res, file);
      },
    })
  );
  app.use('/app/assets', express.static(path.join(config.paths.ui, 'assets'), { maxAge: '365d', immutable: true }), (req, res) =>
    res.status(404).end()
  );
  app.use(express.static(config.paths.public, { maxAge: '7d', index: false }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.body ??= {};
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(contentSecurityPolicy);
  app.use(require('./routes/reports'));
  app.use(loadSession);

  app.use(require('./routes/home'));
  app.use(require('./routes/setup'));
  app.use(require('./routes/auth'));
  app.use(require('./routes/dashboard'));
  app.use(require('./routes/account'));
  app.use(require('./routes/embed'));
  app.use(require('./routes/admin'));
  app.use(require('./routes/files'));
  app.use(require('./routes/upload'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
