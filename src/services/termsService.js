'use strict';

const db = require('../lib/db');
const { badRequest, conflict } = require('../lib/errors');
const settings = require('./settingsService');

const MAX_TEXT = 100000;

const version = () => Number(settings.get('terms.version')) || 0;
const text = () => String(settings.get('terms.text') || '');
const active = () => Boolean(settings.get('terms.enabled')) && version() > 0 && text().trim().length > 0;

function required(user) {
  if (!user || !active()) return false;
  return (Number(user.termsVersion) || 0) < version();
}

function current() {
  return {
    enabled: active(),
    version: version(),
    publishedAt: Number(settings.get('terms.publishedAt')) || null,
    text: active() ? text() : '',
  };
}

async function publish({ text: input, minor = false, enabled = true }, actorId) {
  const body = String(input === undefined || input === null ? '' : input)
    .replace(/\r\n?/g, '\n')
    .trim();
  if (enabled && !body) throw badRequest('Schreib zuerst die Nutzungsbedingungen.', { field: 'text' });
  if (body.length > MAX_TEXT) throw badRequest(`Höchstens ${MAX_TEXT} Zeichen.`, { field: 'text' });
  const bump = !minor || version() === 0;
  const next = bump && enabled ? version() + 1 : version();
  const patch = { 'terms.text': body, 'terms.enabled': Boolean(enabled) };
  if (bump && enabled) {
    patch['terms.version'] = next;
    patch['terms.publishedAt'] = Date.now();
  }
  await settings.update(patch, actorId);
  if (actorId && enabled) {
    await db.run('UPDATE users SET terms_version = ?, terms_accepted_at = ? WHERE id = ?', [next, Date.now(), actorId]);
  }
  return { ...current(), bumped: bump && enabled };
}

async function accept(userId, wanted) {
  if (!active()) return { accepted: false };
  if (Number(wanted) !== version()) {
    throw conflict('Die Nutzungsbedingungen wurden gerade geändert. Lies bitte die neue Fassung.', { code: 'terms_changed' });
  }
  await db.run('UPDATE users SET terms_version = ?, terms_accepted_at = ? WHERE id = ?', [version(), Date.now(), userId]);
  return { accepted: true, version: version() };
}

async function stats() {
  const wanted = version();
  const accepted = wanted ? await db.count("SELECT COUNT(*) FROM users WHERE status = 'active' AND terms_version >= ?", [wanted]) : 0;
  const total = await db.count("SELECT COUNT(*) FROM users WHERE status = 'active'", []);
  return { ...current(), text: text(), accepted, pending: Math.max(0, total - accepted), total };
}

function stateOf(row) {
  const wanted = version();
  if (!active() || !row) return null;
  const accepted = Number(row.terms_version) || 0;
  return {
    version: accepted || null,
    acceptedAt: row.terms_accepted_at ? Number(row.terms_accepted_at) : null,
    current: accepted >= wanted,
  };
}

module.exports = { active, required, current, publish, accept, stats, stateOf, version };
