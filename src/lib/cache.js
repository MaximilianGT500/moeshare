'use strict';

const entries = new Map();

async function remember(key, ttlMs, producer) {
  const entry = entries.get(key);
  if (entry && entry.expires > Date.now()) return entry.value;
  const value = await producer();
  entries.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

const clear = () => entries.clear();

module.exports = { remember, clear };
