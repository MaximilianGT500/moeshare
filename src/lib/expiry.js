'use strict';

const EXPIRY_CHOICES = ['never', '10m', '1h', '6h', '1d', '3d', '7d', '30d', '90d', '365d'];
const UNITS = { m: 60 * 1000, min: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000, w: 7 * 24 * 60 * 60 * 1000 };
const LIMIT_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const NEVER = new Set(['', 'never', 'nie', '0', 'none', 'off', 'aus', 'false']);

function durationOf(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return NaN;
    return input === 0 ? null : Math.round(input) * UNITS.m;
  }
  const text = String(input).trim().toLowerCase();
  if (NEVER.has(text)) return null;
  if (/^\d{1,6}$/.test(text)) return Number(text) * UNITS.m;
  const match = /^(\d{1,4})\s*(min|m|h|d|w)$/.exec(text);
  if (!match) return NaN;
  const ms = Number(match[1]) * UNITS[match[2]];
  return ms > 0 && ms <= LIMIT_MS ? ms : NaN;
}

const choiceMs = (choice) => (choice === 'never' ? null : durationOf(choice));

function resolveExpiry(input, { fallback = 'never', max = 'never' } = {}) {
  const explicit = durationOf(input);
  if (Number.isNaN(explicit)) return { error: 'invalid' };
  const limit = choiceMs(max);
  if (explicit === undefined) {
    const ms = choiceMs(fallback);
    return { ms: limit !== null && (ms === null || ms > limit) ? limit : ms };
  }
  if (limit !== null && (explicit === null || explicit > limit)) return { error: 'too_long', limit: max };
  return { ms: explicit };
}

module.exports = { EXPIRY_CHOICES, durationOf, resolveExpiry, choiceMs };
