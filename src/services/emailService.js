'use strict';

const db = require('../lib/db');
const ephemeral = require('../lib/ephemeral');
const logger = require('../lib/logger');
const { randomToken, sha256 } = require('../lib/secrets');
const { badRequest, conflict, forbidden, gone } = require('../lib/errors');
const { translate } = require('../lib/i18n');
const { formatBytes } = require('../lib/format');
const settings = require('./settingsService');
const mail = require('./mailService');

const log = logger.scope('mail');

const VERIFY = 'email-verify';
const PENDING = 'email-pending';
const RESET = 'password-reset';
const RESET_SENT = 'password-reset-sent';
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_GAP_MS = 2 * 60 * 1000;

const base = () => settings.get('site.baseUrl');
const site = () => settings.get('site.title');

function normalizeEmail(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) throw badRequest('Gib eine E-Mail-Adresse ein.', { field: 'email' });
  if (text.length > 191 || !settings.EMAIL_PATTERN.test(text))
    throw badRequest('Das ist keine gültige E-Mail-Adresse.', { field: 'email' });
  return text;
}

function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${name.length > 2 ? '…' : ''}@${domain}`;
}

async function state(userId) {
  const row = await db.get('SELECT email, email_verified_at FROM users WHERE id = ?', [userId]);
  const pending = await ephemeral.get(PENDING, String(userId));
  return {
    available: mail.ready(),
    email: row && row.email ? row.email : null,
    verifiedAt: row && row.email_verified_at ? Number(row.email_verified_at) : null,
    pending: pending ? { email: pending.email, sentAt: pending.sentAt } : null,
  };
}

async function startVerification(user, input, language) {
  if (!mail.ready()) throw forbidden('Der E-Mail-Versand ist auf diesem Server nicht eingerichtet.');
  const email = normalizeEmail(input);
  const current = await db.get('SELECT email, email_verified_at FROM users WHERE id = ?', [user.id]);
  if (current && current.email === email && current.email_verified_at)
    throw conflict('Diese Adresse ist schon bestätigt.', { field: 'email' });
  const taken = await db.get('SELECT id FROM users WHERE email = ? AND id <> ?', [email, user.id]);
  if (taken) throw conflict('Diese Adresse gehört schon zu einem anderen Konto.', { field: 'email' });
  const token = randomToken(24);
  const t = (text, params) => translate(language, text, params);
  const url = `${base()}/account/email?token=${encodeURIComponent(token)}`;
  try {
    await mail.send(email, language, {
      subject: t('Bestätige deine E-Mail-Adresse'),
      title: t('Bestätige deine E-Mail-Adresse'),
      paragraphs: [
        t('Hallo {username}, du möchtest diese Adresse mit deinem Konto bei {site} verbinden.', { username: user.username, site: site() }),
        t('Damit kannst du dein Passwort zurücksetzen und bekommst wichtige Hinweise zu deinem Konto.'),
      ],
      button: { label: t('Adresse bestätigen'), url },
      footer: t('Der Link gilt 24 Stunden. Wenn du das nicht warst, ignoriere diese Nachricht einfach.'),
    });
  } catch (error) {
    log.warn('Bestätigungsmail konnte nicht verschickt werden', { error });
    throw badRequest('Die E-Mail konnte nicht verschickt werden. Prüfe die Adresse oder versuche es später erneut.', { field: 'email' });
  }
  const previous = await ephemeral.get(PENDING, String(user.id));
  if (previous && previous.hash) await ephemeral.remove(VERIFY, previous.hash);
  const hash = sha256(token);
  await ephemeral.put(VERIFY, hash, { userId: user.id, email }, VERIFY_TTL_MS);
  await ephemeral.put(PENDING, String(user.id), { email, hash, sentAt: Date.now() }, VERIFY_TTL_MS);
  return state(user.id);
}

async function confirm(token) {
  const hash = sha256(String(token || ''));
  const entry = await ephemeral.take(VERIFY, hash);
  if (!entry) throw gone('Dieser Bestätigungslink ist abgelaufen oder wurde schon benutzt.');
  const previous = await db.get('SELECT username, email, email_verified_at, preferences FROM users WHERE id = ?', [entry.userId]);
  if (!previous) throw gone('Dieser Bestätigungslink ist abgelaufen oder wurde schon benutzt.');
  try {
    await db.run('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?', [entry.email, Date.now(), entry.userId]);
  } catch (error) {
    if (db.isUniqueViolation(error)) throw conflict('Diese Adresse gehört inzwischen zu einem anderen Konto.');
    throw error;
  }
  await ephemeral.remove(PENDING, String(entry.userId));
  if (previous.email && previous.email_verified_at && previous.email !== entry.email) {
    const language = mail.languageFor(previous);
    const t = (text, params) => translate(language, text, params);
    mail.sendSafely(previous.email, language, {
      subject: t('Deine E-Mail-Adresse wurde geändert'),
      title: t('Deine E-Mail-Adresse wurde geändert'),
      paragraphs: [
        t('Für dein Konto {username} bei {site} gilt ab jetzt eine neue E-Mail-Adresse: {email}.', {
          username: previous.username,
          site: site(),
          email: maskEmail(entry.email),
        }),
        t('Warst du das nicht? Melde dich sofort an, ändere dein Passwort und wende dich an einen Admin.'),
      ],
    });
  }
  return entry;
}

async function remove(userId) {
  const pending = await ephemeral.get(PENDING, String(userId));
  if (pending && pending.hash) await ephemeral.remove(VERIFY, pending.hash);
  await ephemeral.remove(PENDING, String(userId));
  await db.run('UPDATE users SET email = NULL, email_verified_at = NULL WHERE id = ?', [userId]);
}

async function findForReset(login) {
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

async function requestReset(login, fallbackLanguage) {
  if (!mail.ready()) throw forbidden('Der E-Mail-Versand ist auf diesem Server nicht eingerichtet.');
  const row = await findForReset(login);
  if (!row || !row.email || !row.email_verified_at || row.status !== 'active') return false;
  const marker = randomToken(9);
  const claimed = await ephemeral.putIfAbsent(RESET_SENT, String(row.id), { marker }, RESET_GAP_MS);
  if (!claimed || claimed.marker !== marker) return false;
  const token = randomToken(32);
  await ephemeral.put(RESET, sha256(token), { userId: row.id, stamp: Number(row.password_changed_at) || 0 }, RESET_TTL_MS);
  const language = mail.languageFor(row) || fallbackLanguage;
  const t = (text, params) => translate(language, text, params);
  await mail.sendSafely(row.email, language, {
    subject: t('Passwort zurücksetzen'),
    title: t('Neues Passwort festlegen'),
    paragraphs: [
      t('Hallo {username}, für dein Konto bei {site} wurde ein neues Passwort angefordert.', { username: row.username, site: site() }),
      t('Mit dem Knopf legst du ein neues Passwort fest. Deine Zwei-Faktor-Anmeldung bleibt dabei aktiv.'),
    ],
    button: { label: t('Neues Passwort festlegen'), url: `${base()}/reset?token=${encodeURIComponent(token)}` },
    footer: t('Der Link gilt eine Stunde. Wenn du das nicht angefordert hast, kannst du diese Nachricht ignorieren.'),
  });
  return true;
}

async function peekReset(token) {
  const entry = await ephemeral.get(RESET, sha256(String(token || '')));
  if (!entry) return null;
  const row = await db.get('SELECT id, username, status, password_changed_at FROM users WHERE id = ?', [entry.userId]);
  if (!row || row.status !== 'active' || (Number(row.password_changed_at) || 0) !== entry.stamp) return null;
  return { entry, user: row };
}

async function consumeReset(token) {
  const found = await peekReset(token);
  if (!found) throw gone('Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.', { code: 'expired' });
  const taken = await ephemeral.take(RESET, sha256(String(token)));
  if (!taken) throw gone('Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.', { code: 'expired' });
  return found.user;
}

const SECURITY_EVENTS = {
  password_changed: {
    subject: 'Dein Passwort wurde geändert',
    text: 'Das Passwort für dein Konto {username} bei {site} wurde gerade geändert.',
  },
  password_reset: {
    subject: 'Dein Passwort wurde zurückgesetzt',
    text: 'Das Passwort für dein Konto {username} bei {site} wurde über den Link aus der E-Mail neu festgelegt.',
  },
  mfa_enabled: {
    subject: 'Zwei-Faktor-Anmeldung eingeschaltet',
    text: 'Für dein Konto {username} bei {site} ist jetzt die Zwei-Faktor-Anmeldung aktiv.',
  },
  mfa_disabled: {
    subject: 'Zwei-Faktor-Anmeldung abgeschaltet',
    text: 'Für dein Konto {username} bei {site} wurde die Zwei-Faktor-Anmeldung abgeschaltet.',
  },
  passkey_added: {
    subject: 'Neuer Passkey hinzugefügt',
    text: 'Zu deinem Konto {username} bei {site} wurde ein neuer Passkey hinzugefügt: {name}.',
  },
};

function notifySecurity(userId, event, params = {}) {
  const spec = SECURITY_EVENTS[event];
  if (!spec) return Promise.resolve(false);
  return mail
    .notifyUser(userId, 'security', (language, row) => {
      const t = (text, values) => translate(language, text, values);
      return {
        subject: t(spec.subject),
        title: t(spec.subject),
        paragraphs: [
          t(spec.text, { username: row.username, site: site(), name: params.name ? translate(language, params.name) : '' }),
          t('Warst du das nicht? Melde dich sofort an, ändere dein Passwort und wende dich an einen Admin.'),
        ],
        button: { label: t('Konto öffnen'), url: `${base()}/account#sicherheit` },
      };
    })
    .catch(() => false);
}

const REASON_LABELS = {
  illegal: 'Rechtswidriger Inhalt',
  copyright: 'Urheberrecht',
  privacy: 'Persönliche Daten',
  spam: 'Spam oder Betrug',
  abuse: 'Belästigung oder Gewalt',
  other: 'Etwas anderes',
};

function notifyReport(report) {
  return mail
    .notifyAdmins('reports', (language) => {
      const t = (text, values) => translate(language, text, values);
      return {
        subject: t('Neue Meldung: {reason}', { reason: t(REASON_LABELS[report.reason] || report.reason) }),
        title: t('Jemand hat einen Inhalt gemeldet'),
        paragraphs: [
          t('Grund: {reason}', { reason: t(REASON_LABELS[report.reason] || report.reason) }),
          `${t('Inhalt')}: ${report.url || report.target}`,
          ...(report.message ? [`${t('Nachricht')}: ${report.message}`] : []),
        ],
        button: { label: t('Meldungen öffnen'), url: `${base()}/admin#meldungen` },
      };
    })
    .catch(() => 0);
}

function notifyNewUser(username, method) {
  return mail
    .notifyAdmins('users', (language) => {
      const t = (text, values) => translate(language, text, values);
      return {
        subject: t('Neuer Benutzer: {username}', { username }),
        title: t('Neuer Benutzer: {username}', { username }),
        paragraphs: [t('{username} hat sich gerade bei {site} registriert ({method}).', { username, site: site(), method: t(method) })],
        button: { label: t('Benutzer öffnen'), url: `${base()}/admin#benutzer` },
      };
    })
    .catch(() => 0);
}

async function sendInvite(input, invite, inviter, language) {
  if (!mail.ready()) throw forbidden('Der E-Mail-Versand ist auf diesem Server nicht eingerichtet.');
  const email = normalizeEmail(input);
  const t = (text, values) => translate(language, text, values);
  try {
    await mail.send(email, language, {
      subject: t('Einladung zu {site}', { site: site() }),
      title: t('Du bist eingeladen'),
      paragraphs: [
        t('{inviter} lädt dich zu {site} ein. Dort kannst du Bilder, Videos und Dateien teilen.', { inviter, site: site() }),
        ...(invite.quotaBytes ? [t('Dir stehen {size} Speicher zur Verfügung.', { size: formatBytes(invite.quotaBytes) })] : []),
      ],
      button: { label: t('Konto anlegen'), url: invite.url },
      footer: invite.expiresAt
        ? t('Die Einladung läuft am {date} ab.', {
            date: new Date(invite.expiresAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE'),
          })
        : '',
    });
  } catch (error) {
    log.warn('Einladung konnte nicht verschickt werden', { error });
    throw badRequest('Die E-Mail konnte nicht verschickt werden. Prüfe die Adresse oder versuche es später erneut.', { field: 'email' });
  }
  return email;
}

module.exports = {
  REASON_LABELS,
  normalizeEmail,
  maskEmail,
  state,
  startVerification,
  confirm,
  remove,
  requestReset,
  peekReset,
  consumeReset,
  notifySecurity,
  notifyReport,
  notifyNewUser,
  sendInvite,
};
