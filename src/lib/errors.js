'use strict';

class HttpError extends Error {
  constructor(status, message, { code, field, extra } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.extra = extra;
  }

  toJSON() {
    return { error: this.message, code: this.code, field: this.field, ...this.extra };
  }
}

const factory = (status) => (message, options) => new HttpError(status, message, options);

module.exports = {
  HttpError,
  badRequest: factory(400),
  unauthorized: factory(401),
  forbidden: factory(403),
  notFound: factory(404),
  conflict: factory(409),
  gone: factory(410),
  tooLarge: factory(413),
  tooManyRequests: factory(429),
  badGateway: factory(502),
};
