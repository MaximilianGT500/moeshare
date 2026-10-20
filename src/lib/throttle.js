'use strict';

class Throttle {
  constructor({ limit = 8, windowMs = 15 * 60 * 1000, lockMs = 15 * 60 * 1000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.lockMs = lockMs;
    this.entries = new Map();
  }

  _entry(key) {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (entry && entry.lockedUntil <= now && entry.windowStart + this.windowMs <= now) {
      this.entries.delete(key);
      entry = null;
    }
    if (!entry) {
      entry = { count: 0, windowStart: now, lockedUntil: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  lockedFor(key) {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.lockedUntil - Date.now());
  }

  fail(key) {
    const entry = this._entry(key);
    entry.count += 1;
    if (entry.count >= this.limit) {
      entry.lockedUntil = Date.now() + this.lockMs;
      entry.count = 0;
      entry.windowStart = Date.now();
      return this.lockMs;
    }
    return 0;
  }

  reset(key) {
    this.entries.delete(key);
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && entry.windowStart + this.windowMs <= now) this.entries.delete(key);
    }
  }
}

module.exports = { Throttle };
