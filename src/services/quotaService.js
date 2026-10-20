'use strict';

const { formatBytes } = require('../lib/format');
const users = require('./userService');

async function limitsFor(user) {
  const row = await users.findById(user.id);
  const { quotaBytes, maxFileBytes } = users.effectiveLimits(row);
  const used = await users.usageBytes(row.username);
  const remaining = quotaBytes ? Math.max(0, quotaBytes - used) : null;
  const candidates = [maxFileBytes, remaining].filter((value) => value !== null && value !== undefined);
  const limitedBy = remaining !== null && (maxFileBytes === null || remaining < maxFileBytes) ? 'quota' : 'file';
  const limits = { quotaBytes, maxFileBytes, used, remaining, limit: candidates.length ? Math.min(...candidates) : null, limitedBy };
  return { ...limits, message: messageFor(limits) };
}

function messageFor({ limitedBy, remaining, quotaBytes, maxFileBytes }) {
  if (limitedBy === 'quota') {
    return remaining > 0
      ? `Nicht genug Speicher frei: noch ${formatBytes(remaining)} von ${formatBytes(quotaBytes)}.`
      : `Dein Speicher ist voll (${formatBytes(quotaBytes)}). Lösche alte Dateien oder frag nach mehr Platz.`;
  }
  return `Die Datei ist zu groß. Erlaubt sind höchstens ${formatBytes(maxFileBytes)}.`;
}

module.exports = { limitsFor };
