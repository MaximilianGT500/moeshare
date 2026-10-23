'use strict';

const db = require('../lib/db');
const settings = require('./settingsService');
const users = require('./userService');
const identities = require('./identityService');
const oauth = require('./oauthService');

const summary = (user) => ({
  username: user.username,
  role: user.role,
  isAdmin: user.isAdmin,
  canCustomizeEmbed: user.isAdmin || settings.get('embed.allowUserTemplates'),
  canDesign:
    user.isAdmin ||
    settings.get('embed.allowUserTemplates') ||
    settings.get('view.allowUserDesigns') ||
    settings.get('profiles.enabled') ||
    settings.get('images.watermarks'),
});

async function confirmMethods(user) {
  const [row, passkeys, linked] = await Promise.all([
    users.findById(user.id),
    db.count('SELECT COUNT(*) FROM passkeys WHERE user_id = ?', [user.id]),
    identities.listForUser(user.id),
  ]);
  return {
    password: Boolean(row.password),
    totp: Boolean(row.totp_enabled_at),
    passkey: settings.get('auth.passkeys') && passkeys > 0,
    providers: linked
      .filter(({ provider }) => oauth.isEnabled(provider))
      .map(({ provider }) => ({ key: provider, label: oauth.labelOf(provider) })),
    passkeyOrigin: new URL(settings.get('site.baseUrl')).origin,
  };
}

module.exports = { summary, confirmMethods };
