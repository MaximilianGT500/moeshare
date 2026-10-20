'use strict';

const db = require('../lib/db');
const logger = require('../lib/logger');
const settings = require('./settingsService');
const { storedIp, deviceLabel } = require('../lib/request');

const events = logger.scope('audit');

const EVENTS = {
  login: 'Anmeldung',
  login_failed: 'Anmeldung fehlgeschlagen',
  account_locked: 'Konto nach Fehlversuchen kurz gesperrt',
  reauth_failed: 'Bestätigung fehlgeschlagen',
  logout: 'Abmeldung',
  password_changed: 'Passwort geändert',
  password_reset: 'Passwort zurückgesetzt',
  mfa_enabled: 'Zwei-Faktor-Anmeldung eingerichtet',
  mfa_disabled: 'Zwei-Faktor-Anmeldung abgeschaltet',
  mfa_reset: 'Zwei-Faktor-Anmeldung zurückgesetzt',
  recovery_codes_regenerated: 'Neue Wiederherstellungscodes',
  recovery_code_used: 'Anmeldung mit Wiederherstellungscode',
  passkey_added: 'Passkey hinzugefügt',
  passkey_removed: 'Passkey entfernt',
  discord_linked: 'Discord verknüpft',
  discord_unlinked: 'Discord getrennt',
  identity_linked: 'Dienst verknüpft',
  identity_unlinked: 'Dienst getrennt',
  token_created: 'API-Token erstellt',
  token_revoked: 'API-Token widerrufen',
  sessions_revoked: 'Sitzungen beendet',
  user_registered: 'Registriert',
  user_created: 'Konto angelegt',
  user_updated: 'Konto geändert',
  user_suspended: 'Konto gesperrt',
  user_unsuspended: 'Konto entsperrt',
  user_deleted: 'Benutzer gelöscht',
  account_deleted: 'Eigenes Konto gelöscht',
  invite_created: 'Einladung erstellt',
  invite_revoked: 'Einladung gelöscht',
  settings_updated: 'Einstellungen geändert',
  file_deleted: 'Datei eines anderen Kontos gelöscht',
  embed_updated: 'Embed geändert',
};

const WARNINGS = new Set(['login_failed', 'account_locked', 'reauth_failed', 'recovery_code_used']);

async function announce(action, { userId, actorId, ip, details }) {
  const level = WARNINGS.has(action) ? 'warn' : 'info';
  if (!logger.enabled(level)) return;
  const ids = [...new Set([userId, actorId].filter(Boolean))];
  const rows = ids.length ? await db.all(`SELECT id, username FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const name = (id) => (rows.find((row) => row.id === id) || {}).username;
  const { device, ...rest } = details;
  events[level](EVENTS[action] || action, {
    user: name(userId) || rest.username,
    by: actorId && actorId !== userId ? name(actorId) : undefined,
    ip,
    ...rest,
    username: undefined,
    device,
  });
}

function log(action, { userId = null, actorId, req = null, details = {} } = {}) {
  const data = { ...details };
  if (req && !data.device) data.device = deviceLabel(req.get('user-agent'));
  const actor = actorId === undefined ? userId : actorId;
  const ip = req ? storedIp(req) : null;
  return db
    .run('INSERT INTO audit_log (at, user_id, actor_id, action, ip, details) VALUES (?, ?, ?, ?, ?, ?)', [
      Date.now(),
      userId,
      actor,
      action,
      ip,
      JSON.stringify(data),
    ])
    .then(() => announce(action, { userId, actorId: actor, ip, details: data }))
    .catch((error) => events.error('Aktivität konnte nicht protokolliert werden', { action, error }));
}

const parse = (row) => {
  let details = {};
  try {
    details = row.details ? JSON.parse(row.details) : {};
  } catch {}
  return {
    id: row.id,
    at: row.at,
    action: row.action,
    ip: row.ip,
    details,
    user: row.user_id ? { id: row.user_id, username: row.username || null } : null,
    actor: row.actor_id ? { id: row.actor_id, username: row.actor_name || null } : null,
  };
};

async function list({ userId = null, limit = 50, before = null, actions = null } = {}) {
  const where = [];
  const params = [];
  if (userId) {
    where.push('(a.user_id = ? OR a.actor_id = ?)');
    params.push(userId, userId);
  }
  if (before) {
    where.push('a.id < ?');
    params.push(before);
  }
  if (actions && actions.length) {
    where.push(`a.action IN (${actions.map(() => '?').join(',')})`);
    params.push(...actions);
  }
  const rows = await db.all(
    `SELECT a.*, u.username AS username, act.username AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN users act ON act.id = a.actor_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY a.id DESC
     LIMIT ?`,
    [...params, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)]
  );
  return rows.map(parse);
}

async function prune() {
  const days = settings.get('system.auditRetentionDays');
  const result = await db.run('DELETE FROM audit_log WHERE at < ?', [Date.now() - days * 86400000]);
  return result.changes;
}

module.exports = { log, list, prune };
