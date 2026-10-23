'use strict';

const crypto = require('crypto');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const { notFound } = require('../lib/errors');

const log = logger.scope('aufgaben');

const TTL = 12 * 60 * 60 * 1000;
const THROTTLE_MS = 700;

function start(user, kind, runner, { detail = null } = {}) {
  const id = crypto.randomBytes(12).toString('base64url');
  let job = { id, kind, userId: user.id, state: 'running', progress: 0, detail, startedAt: Date.now(), result: null, error: null };
  let queue = ephemeral.put('job', id, job, TTL);
  let finished = false;
  let last = 0;
  const save = (next) => {
    job = next;
    queue = queue.then(() => ephemeral.put('job', id, job, TTL)).catch(() => {});
    return queue;
  };
  const update = (fraction, extra = undefined) => {
    if (finished) return;
    const now = Date.now();
    if (now - last < THROTTLE_MS && extra === undefined) return;
    last = now;
    save({
      ...job,
      progress: Math.max(0, Math.min(1, Math.round((Number(fraction) || 0) * 1000) / 1000)),
      detail: extra === undefined ? job.detail : extra,
    });
  };
  const ready = queue.then(() =>
    Promise.resolve()
      .then(() => runner(update))
      .then(
        (result) => {
          finished = true;
          return save({ ...job, state: 'done', progress: 1, result: result === undefined ? null : result, finishedAt: Date.now() });
        },
        (error) => {
          finished = true;
          if (!error.status) log.warn('Eine Aufgabe ist fehlgeschlagen', { kind, error });
          return save({
            ...job,
            state: 'error',
            error: { message: error.message, status: error.status || 500, code: error.code || null },
            finishedAt: Date.now(),
          });
        }
      )
  );
  return { job, ready };
}

async function get(user, id, { admin = false } = {}) {
  const job = typeof id === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(id) ? await ephemeral.get('job', id) : null;
  if (!job || (!admin && job.userId !== user.id)) throw notFound('Diese Aufgabe gibt es nicht (mehr).');
  return job;
}

module.exports = { start, get };
