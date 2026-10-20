'use strict';

const multer = require('multer');
const logger = require('../lib/logger');
const { HttpError } = require('../lib/errors');
const { renderMessage } = require('../lib/render');
const { pathOf } = require('./requestLog');

const log = logger.scope('http');

const API_PREFIXES = ['/api/', '/upload', '/file/', '/files', '/oembed/'];

const wantsJson = (req) => req.method !== 'GET' || API_PREFIXES.some((prefix) => req.path.startsWith(prefix));

function normalize(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return new HttpError(413, 'Die Datei ist zu groß!');
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return new HttpError(400, 'Unerwartetes Formularfeld!');
    return new HttpError(400, `Upload-Fehler: ${error.code}`);
  }
  if (error.type === 'entity.too.large') return new HttpError(413, 'Die Anfrage ist zu groß.');
  if (error.expose && error.status >= 400 && error.status < 500) return new HttpError(error.status, 'Die Anfrage ist ungültig.');
  return null;
}

function notFound(req, res) {
  if (wantsJson(req)) return res.status(404).json({ error: 'Nicht gefunden' });
  return renderMessage(res, 404, 'Diese Seite gibt es nicht.');
}

function errorHandler(error, req, res, next) {
  const known = normalize(error);
  if (!known) log.error(`${req.method} ${pathOf(req)} ist fehlgeschlagen`, { id: req.id, error });
  if (res.headersSent) return res.destroy();

  if (!known) {
    if (wantsJson(req)) return res.status(500).json({ error: `Interner Serverfehler (Fehler-ID ${req.id})`, requestId: req.id });
    return renderMessage(res, 500, 'Hier ist etwas schiefgelaufen. Versuche es gleich noch einmal.', {
      title: 'Fehler',
      requestId: req.id,
    });
  }
  if (wantsJson(req)) return res.status(known.status).json(known);
  return renderMessage(res, known.status, known.message, { title: known.status === 404 ? 'Nicht gefunden' : 'Fehler' });
}

module.exports = { notFound, errorHandler };
