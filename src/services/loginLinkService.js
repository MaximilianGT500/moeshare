'use strict';

const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const secrets = require('../lib/secrets');
const { badRequest, conflict, forbidden, notFound } = require('../lib/errors');
const { translate } = require('../lib/i18n');
const { safeNext, storedIp } = require('../lib/request');
const settings = require('./settingsService');
const mail = require('./mailService');
const webhook = require('./webhookService');

const log = logger.scope('einmal-links');

const PENDING_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_GAP_MS = 2 * 60 * 1000;
const EMAIL_MAX_MINUTES = 60;
const EMAIL_SENT = 'login-link-sent';
const SOURCES = ['admin', 'api', 'email', 'cli'];
const OPEN = ['pending', 'ready'];
const TOKEN = /^[A-Za-z0-9_-]{30,100}$/;

const enabled = () => settings.get('auth.loginLinks');
const emailReady = () => settings.get('auth.emailLinks') && mail.ready();
const site = () => settings.get('site.title');
const linkUrl = (token) => `${settings.get('site.baseUrl')}/login/link/${token}`;

const SELECT = `
  SELECT l.id, l.user_id, l.status, l.source, l.integration_id, l.requested_by, l.note, l.redirect, l.minutes, l.second_factor,
         l.delivery, l.created_at, l.expires_at, l.decided_at, l.used_at, l.used_ip,
         u.username, u.status AS user_status, i.name AS integration_name, c.username AS creator, d.username AS decider
  FROM login_links l
  JOIN users u ON u.id = l.user_id
  LEFT JOIN integrations i ON i.id = l.integration_id
  LEFT JOIN users c ON c.id = l.created_by
  LEFT JOIN users d ON d.id = l.decided_by
`;

function stateOf(row, now = Date.now()) {
  if (OPEN.includes(row.status) && Number(row.expires_at) <= now) return 'expired';
  return row.status;
}

const toRecord = (row) => ({
  id: Number(row.id),
  user: { id: Number(row.user_id), username: row.username || null },
  status: stateOf(row),
  source: row.source,
  integration: row.integration_id ? { id: Number(row.integration_id), name: row.integration_name || row.requested_by || null } : null,
  createdBy: row.creator || null,
  requestedBy: row.requested_by || null,
  decidedBy: row.decider || null,
  note: row.note || '',
  redirect: row.redirect || '',
  minutes: Number(row.minutes),
  secondFactor: Boolean(row.second_factor),
  delivery: row.delivery || null,
  createdAt: Number(row.created_at),
  expiresAt: Number(row.expires_at),
  decidedAt: row.decided_at ? Number(row.decided_at) : null,
  usedAt: row.used_at ? Number(row.used_at) : null,
  usedIp: row.used_ip || null,
});

function lifetime(input, cap = null) {
  const limit = Math.min(settings.get('auth.loginLinkMaxMinutes'), cap || Infinity);
  if (input === undefined || input === null || input === '') return Math.min(settings.get('auth.loginLinkMinutes'), limit);
  const minutes = typeof input === 'string' && input.trim() ? Number(input) : input;
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw badRequest('Die Gültigkeit ist eine ganze Zahl in Minuten, mindestens 1.', { field: 'minutes' });
  }
  if (minutes > limit) throw badRequest(`Erlaubt sind höchstens ${limit} Minuten.`, { field: 'minutes' });
  return minutes;
}

function cleanRedirect(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return null;
  if (value.length > 300 || !safeNext(value, '')) {
    throw badRequest('Das Ziel muss eine Adresse auf diesem Server sein, zum Beispiel /dashboard.', { field: 'redirect' });
  }
  return value;
}

function cleanNote(input) {
  const value = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';
  if (value.length > 200) throw badRequest('Die Notiz darf höchstens 200 Zeichen lang sein.', { field: 'note' });
  return value || null;
}

async function find(id) {
  const row = await db.get(`${SELECT} WHERE l.id = ?`, [Number(id) || 0]);
  if (!row) throw notFound('Diesen Einmal-Link gibt es nicht (mehr).');
  return toRecord(row);
}

const rawRow = (id) => db.get('SELECT * FROM login_links WHERE id = ?', [Number(id) || 0]);

function freshToken() {
  const token = secrets.randomToken(32);
  return { token, hash: secrets.sha256(token), sealed: secrets.encrypt(token) };
}

async function create({
  user,
  source,
  actorId = null,
  integration = null,
  requestedBy = null,
  minutes,
  redirect,
  note,
  secondFactor = false,
  pending = false,
  delivery = null,
}) {
  if (!SOURCES.includes(source)) throw new Error(`Unbekannte Quelle: ${source}`);
  if (!user || user.status !== 'active') {
    throw badRequest('Dieses Konto ist gesperrt. Gesperrte Konten bekommen keine Einmal-Links.', { field: 'user' });
  }
  const length = lifetime(minutes, integration ? integration.maxMinutes : null);
  const now = Date.now();
  const fresh = pending ? null : freshToken();
  const id = await db.insertRow('login_links', {
    user_id: user.id,
    token_hash: fresh ? fresh.hash : null,
    sealed: fresh ? fresh.sealed : null,
    status: pending ? 'pending' : 'ready',
    source,
    integration_id: integration ? integration.id : null,
    created_by: actorId,
    requested_by: requestedBy ? String(requestedBy).slice(0, 80) : null,
    note: cleanNote(note),
    redirect: cleanRedirect(redirect),
    minutes: length,
    second_factor: secondFactor ? 1 : 0,
    delivery: delivery === 'email' ? 'email' : null,
    created_at: now,
    expires_at: now + (pending ? PENDING_MS : length * 60 * 1000),
  });
  log.info(pending ? 'Einmal-Link angefragt' : 'Einmal-Link erstellt', {
    user: user.username,
    source,
    integration: integration ? integration.name : undefined,
    minutes: length,
  });
  return { link: await find(id), url: fresh ? linkUrl(fresh.token) : null };
}

async function assertActiveUser(userId) {
  const user = await db.get('SELECT id, status FROM users WHERE id = ?', [userId]);
  if (!user || user.status !== 'active') {
    throw badRequest('Dieses Konto ist gesperrt. Gesperrte Konten bekommen keine Einmal-Links.', { field: 'user' });
  }
}

async function approve(id, actorId, { minutes } = {}) {
  const row = await rawRow(id);
  if (!row) throw notFound('Diesen Einmal-Link gibt es nicht (mehr).');
  if (stateOf(row) !== 'pending') throw conflict('Diese Anfrage ist schon erledigt oder abgelaufen.');
  await assertActiveUser(row.user_id);
  if (await blockedByIntegration(row)) throw conflict('Die Integration ist abgeschaltet oder darf für dieses Konto keine Links anfordern.');
  const length = minutes === undefined || minutes === null || minutes === '' ? Number(row.minutes) : lifetime(minutes);
  const fresh = freshToken();
  const now = Date.now();
  const { changes } = await db.run(
    `UPDATE login_links SET status = 'ready', token_hash = ?, sealed = ?, minutes = ?, expires_at = ?, decided_by = ?, decided_at = ?
     WHERE id = ? AND status = 'pending' AND expires_at > ?`,
    [fresh.hash, fresh.sealed, length, now + length * 60 * 1000, actorId, now, row.id, now]
  );
  if (changes !== 1) throw conflict('Diese Anfrage ist schon erledigt oder abgelaufen.');
  return { link: await find(row.id), url: linkUrl(fresh.token) };
}

async function deny(id, actorId) {
  const row = await rawRow(id);
  if (!row) throw notFound('Diesen Einmal-Link gibt es nicht (mehr).');
  const { changes } = await db.run(
    "UPDATE login_links SET status = 'denied', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
    [actorId, Date.now(), row.id]
  );
  if (changes !== 1) throw conflict('Diese Anfrage ist schon erledigt.');
  return find(row.id);
}

async function revoke(id, { integrationId = null } = {}) {
  const row = await rawRow(id);
  if (!row || (integrationId && Number(row.integration_id) !== Number(integrationId))) {
    throw notFound('Diesen Einmal-Link gibt es nicht (mehr).');
  }
  const { changes } = await db.run(
    "UPDATE login_links SET status = 'revoked', sealed = NULL WHERE id = ? AND status IN ('pending', 'ready')",
    [row.id]
  );
  return { link: await find(row.id), changed: changes === 1 };
}

const revokeForUser = (userId) =>
  db
    .run("UPDATE login_links SET status = 'revoked', sealed = NULL WHERE user_id = ? AND status IN ('pending', 'ready')", [userId])
    .then((result) => result.changes);

async function urlOf(id) {
  const row = await rawRow(id);
  if (!row || stateOf(row) !== 'ready' || !row.sealed) return null;
  try {
    return linkUrl(secrets.decrypt(row.sealed));
  } catch (error) {
    log.warn('Ein Einmal-Link lässt sich nicht mehr entschlüsseln', { id: row.id, error });
    return null;
  }
}

const validToken = (token) => typeof token === 'string' && TOKEN.test(token);

async function blockedByIntegration(row) {
  if (row.source !== 'api' || !row.integration_id) return false;
  const found = await db.get('SELECT i.enabled, i.allow_admins, u.role FROM integrations i, users u WHERE i.id = ? AND u.id = ?', [
    row.integration_id,
    row.user_id,
  ]);
  if (!found) return false;
  return !Number(found.enabled) || (found.role === 'admin' && !Number(found.allow_admins));
}

function allowedSources() {
  const sources = ['cli'];
  if (enabled()) sources.push('admin', 'api');
  if (settings.get('auth.emailLinks')) sources.push('email');
  return sources;
}

async function peek(token) {
  if (!validToken(token)) return { valid: false, reason: 'unknown' };
  const row = await db.get(`${SELECT} WHERE l.token_hash = ?`, [secrets.sha256(token)]);
  if (!row) return { valid: false, reason: 'unknown' };
  const state = stateOf(row);
  if (state !== 'ready') return { valid: false, reason: state === 'denied' ? 'revoked' : state };
  if (!allowedSources().includes(row.source)) return { valid: false, reason: 'disabled' };
  if (row.user_status !== 'active') return { valid: false, reason: 'suspended' };
  if (await blockedByIntegration(row)) return { valid: false, reason: 'revoked' };
  return { valid: true, userId: Number(row.user_id), username: row.username, expiresAt: Number(row.expires_at) };
}

async function consume(token, req = null) {
  if (!validToken(token)) return null;
  const hash = secrets.sha256(token);
  const current = await db.get('SELECT source, integration_id, user_id FROM login_links WHERE token_hash = ?', [hash]);
  if (!current || (await blockedByIntegration(current))) return null;
  const now = Date.now();
  const sources = allowedSources();
  const { changes } = await db.run(
    `UPDATE login_links SET status = 'used', used_at = ?, used_ip = ?, sealed = NULL
     WHERE token_hash = ? AND status = 'ready' AND expires_at > ? AND source IN (${sources.map(() => '?').join(', ')})
       AND user_id IN (SELECT id FROM users WHERE status = 'active')`,
    [now, req ? storedIp(req) : null, hash, now, ...sources]
  );
  if (changes !== 1) return null;
  const row = await db.get(`${SELECT} WHERE l.token_hash = ?`, [hash]);
  return row ? toRecord(row) : null;
}

async function list({ userId = null, open = false, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (userId) {
    where.push('l.user_id = ?');
    params.push(userId);
  }
  if (open) {
    where.push("l.status IN ('pending', 'ready') AND l.expires_at > ?");
    params.push(Date.now());
  }
  const rows = await db.all(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE WHEN l.status = 'pending' AND l.expires_at > ? THEN 0 ELSE 1 END, l.id DESC
     LIMIT ?`,
    [...params, Date.now(), Math.min(Math.max(Number(limit) || 100, 1), 300)]
  );
  return rows.map(toRecord);
}

const pendingCount = () => db.count("SELECT COUNT(*) FROM login_links WHERE status = 'pending' AND expires_at > ?", [Date.now()]);

async function prune() {
  const now = Date.now();
  await db.run('UPDATE login_links SET sealed = NULL WHERE sealed IS NOT NULL AND expires_at <= ?', [now]);
  const { changes } = await db.run(
    "DELETE FROM login_links WHERE created_at < ? AND (status NOT IN ('pending', 'ready') OR expires_at <= ?)",
    [now - KEEP_MS, now]
  );
  return changes;
}

function duration(language, minutes) {
  const t = (text, params) => translate(language, text, params);
  if (minutes >= 1440 && minutes % 1440 === 0) return minutes === 1440 ? t('einen Tag') : t('{count} Tage', { count: minutes / 1440 });
  if (minutes >= 60 && minutes % 60 === 0) return minutes === 60 ? t('eine Stunde') : t('{count} Stunden', { count: minutes / 60 });
  return minutes === 1 ? t('eine Minute') : t('{count} Minuten', { count: minutes });
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  return `${name.slice(0, 2)}${name.length > 2 ? '…' : ''}@${domain}`;
}

function message(language, row, url, minutes, { requested }) {
  const t = (text, params) => translate(language, text, params);
  return {
    subject: t('Dein Anmeldelink für {site}', { site: site() }),
    title: t('Mit einem Klick anmelden'),
    paragraphs: [
      requested
        ? t('Hallo {username}, du hast einen Link zum Anmelden bei {site} angefordert.', { username: row.username, site: site() })
        : t('Hallo {username}, hier ist dein Link zum Anmelden bei {site}.', { username: row.username, site: site() }),
      t('Der Link funktioniert genau einmal und gilt {duration}.', { duration: duration(language, minutes) }),
    ],
    button: { label: t('Anmelden'), url },
    footer: t('Wenn du keinen Link erwartet hast, ignoriere diese Nachricht. Ohne den Link kommt niemand in dein Konto.'),
  };
}

async function sendToUser(id) {
  if (!mail.ready()) throw forbidden('Der E-Mail-Versand ist auf diesem Server nicht eingerichtet.');
  const link = await find(id);
  const url = await urlOf(id);
  if (!url) throw conflict('Dieser Einmal-Link ist nicht mehr gültig.');
  const row = await db.get('SELECT username, email, email_verified_at, preferences FROM users WHERE id = ?', [link.user.id]);
  if (!row || !row.email || !row.email_verified_at) {
    throw badRequest('Für dieses Konto ist keine bestätigte E-Mail-Adresse hinterlegt.', { field: 'email' });
  }
  const language = mail.languageFor(row);
  const minutes = Math.max(1, Math.round((link.expiresAt - Date.now()) / 60000));
  try {
    await mail.send(row.email, language, message(language, row, url, minutes, { requested: false }));
  } catch (error) {
    log.warn('Der Einmal-Link konnte nicht verschickt werden', { error });
    throw badRequest('Die E-Mail konnte nicht verschickt werden. Prüfe die Einstellungen für den Versand.');
  }
  return maskEmail(row.email);
}

async function findForLogin(login) {
  const value = typeof login === 'string' ? login.trim() : '';
  if (!value || value.length > 191) return null;
  if (value.includes('@')) {
    return db.get('SELECT * FROM users WHERE email = ? AND email_verified_at IS NOT NULL', [value.toLowerCase()]);
  }
  return db.get('SELECT * FROM users WHERE lower(username) = lower(?) ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END LIMIT 1', [
    value,
    value,
  ]);
}

async function requestByEmail(login, fallbackLanguage) {
  if (!emailReady()) throw forbidden('Anmeldelinks per E-Mail sind auf diesem Server nicht eingeschaltet.');
  const row = await findForLogin(login);
  if (!row || !row.email || !row.email_verified_at || row.status !== 'active') return false;
  const marker = secrets.randomToken(9);
  const claimed = await ephemeral.putIfAbsent(EMAIL_SENT, String(row.id), { marker }, EMAIL_GAP_MS);
  if (!claimed || claimed.marker !== marker) return false;
  const minutes = Math.min(settings.get('auth.loginLinkMinutes'), settings.get('auth.loginLinkMaxMinutes'), EMAIL_MAX_MINUTES);
  const { url } = await create({ user: row, source: 'email', minutes, secondFactor: true });
  const language = mail.languageFor(row) || fallbackLanguage;
  return mail.sendSafely(row.email, language, message(language, row, url, minutes, { requested: true }));
}

function notifyPending(link) {
  const who = link.integration ? link.integration.name : link.requestedBy || '?';
  const note = link.note ? `\n${link.note}` : '';
  webhook.notify('security', 'Einmal-Link angefragt', `**${who}** möchte einen Einmal-Link für **${link.user.username}**.${note}`);
  return mail
    .notifyAdmins('security', (language) => {
      const t = (text, params) => translate(language, text, params);
      return {
        subject: t('Einmal-Link für {username} angefragt', { username: link.user.username }),
        title: t('Eine Anmeldung wartet auf deine Freigabe'),
        paragraphs: [
          t('{who} möchte einen Einmal-Link für {username} bei {site}.', { who, username: link.user.username, site: site() }),
          ...(link.note ? [`${t('Notiz')}: ${link.note}`] : []),
          t('Die Anfrage verfällt nach 24 Stunden, wenn niemand sie freigibt.'),
        ],
        button: { label: t('Anfrage ansehen'), url: `${settings.get('site.baseUrl')}/admin#zugaenge` },
      };
    })
    .catch(() => 0);
}

module.exports = {
  SOURCES,
  PENDING_MS,
  enabled,
  emailReady,
  lifetime,
  create,
  approve,
  deny,
  revoke,
  revokeForUser,
  urlOf,
  find,
  peek,
  consume,
  list,
  pendingCount,
  prune,
  sendToUser,
  requestByEmail,
  notifyPending,
};
