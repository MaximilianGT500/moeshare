'use strict';

const db = require('../lib/db');
const { badRequest } = require('../lib/errors');
const { berlinOffsetMs, berlinParts } = require('../lib/format');
const files = require('./fileService');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ROWS = 200000;
const TOP = 5;
const TYPES = ['image', 'video', 'audio', 'text', 'file'];

const yearStart = (year) => Date.UTC(year, 0, 1) - HOUR_MS;

function offsetCache() {
  const known = new Map();
  return (ms) => {
    const bucket = Math.floor(ms / HOUR_MS);
    if (!known.has(bucket)) known.set(bucket, berlinOffsetMs(ms));
    return known.get(bucket);
  };
}

function dayKey(local) {
  const date = new Date(local);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function longestStreak(days) {
  const sorted = [...days].sort();
  let best = null;
  let start = null;
  let previous = null;
  let length = 0;
  for (const day of sorted) {
    const ms = Date.parse(`${day}T00:00:00Z`);
    if (previous !== null && ms - previous === DAY_MS) length += 1;
    else {
      start = day;
      length = 1;
    }
    if (!best || length > best.days) best = { days: length, from: start, to: day };
    previous = ms;
  }
  return best;
}

async function availableYears(username, current) {
  const row = await db.get('SELECT MIN(created_at) AS first FROM file_data WHERE username = ? AND deleted_at IS NULL', [username]);
  const first = row && row.first ? Number(berlinParts(new Date(Number(row.first))).year) : current;
  const years = [];
  for (let year = current; year >= Math.max(first, current - 30); year -= 1) years.push(year);
  return years;
}

async function review(username, input, { domain = null, now = Date.now() } = {}) {
  const current = Number(berlinParts(new Date(now)).year);
  const year = input === undefined || input === null || input === '' ? current : Number(input);
  if (!Number.isInteger(year) || year < 1970 || year > current) throw badRequest('Ungültiges Jahr.', { field: 'year' });
  const start = yearStart(year);
  const end = yearStart(year + 1);
  const rows = await db.all(
    `SELECT id, filename, syntax, size_bytes, deduped, created_at, starred_at, views FROM file_data
     WHERE username = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY created_at LIMIT ${MAX_ROWS}`,
    [username, start, end]
  );
  const offset = offsetCache();
  const months = Array(12).fill(0);
  const weekdays = Array(7).fill(0);
  const hours = Array(24).fill(0);
  const types = Object.fromEntries(TYPES.map((type) => [type, 0]));
  const perDay = new Map();
  let bytes = 0;
  let views = 0;
  let starred = 0;
  for (const row of rows) {
    const created = Number(row.created_at);
    const local = created + offset(created);
    const date = new Date(local);
    months[date.getUTCMonth()] += 1;
    weekdays[(date.getUTCDay() + 6) % 7] += 1;
    hours[date.getUTCHours()] += 1;
    const key = dayKey(local);
    perDay.set(key, (perDay.get(key) || 0) + 1);
    types[files.typeOf(row.filename, row.syntax).type] += 1;
    if (Number(row.deduped) !== 1) bytes += Number(row.size_bytes) || 0;
    views += Number(row.views) || 0;
    if (row.starred_at) starred += 1;
  }
  let busiest = null;
  for (const [day, count] of perDay) if (!busiest || count > busiest.uploads) busiest = { day, uploads: count };

  const ids = rows.map((row) => Number(row.id));
  const reactionRows = ids.length
    ? await db.all(
        `SELECT r.ref_id, SUM(r.count) AS total FROM reactions r JOIN file_data f ON f.id = r.ref_id
         WHERE r.kind = 'f' AND f.username = ? AND f.deleted_at IS NULL AND f.created_at >= ? AND f.created_at < ?
         GROUP BY r.ref_id ORDER BY SUM(r.count) DESC, r.ref_id DESC`,
        [username, start, end]
      )
    : [];
  const reactions = reactionRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const topViewedIds = rows
    .filter((row) => Number(row.views) > 0)
    .sort((a, b) => Number(b.views) - Number(a.views) || Number(b.id) - Number(a.id))
    .slice(0, TOP)
    .map((row) => Number(row.id));
  const topReacted = reactionRows.filter((row) => Number(row.total) > 0).slice(0, TOP);
  const wanted = [...new Set([...topViewedIds, ...topReacted.map((row) => Number(row.ref_id)), ...(ids.length ? [ids[0]] : [])])];
  const fileRows = wanted.length ? await db.all(`SELECT * FROM file_data WHERE id IN (${wanted.map(() => '?').join(', ')})`, wanted) : [];
  const byId = new Map((await files.withTags(fileRows, { domain })).map((file) => [Number(file.id), file]));

  const [albums, links] = await Promise.all([
    db.count('SELECT COUNT(*) FROM albums a JOIN users u ON u.id = a.user_id WHERE u.username = ? AND a.created_at >= ? AND a.created_at < ?', [
      username,
      start,
      end,
    ]),
    db.count('SELECT COUNT(*) FROM links l JOIN users u ON u.id = l.user_id WHERE u.username = ? AND l.created_at >= ? AND l.created_at < ?', [
      username,
      start,
      end,
    ]),
  ]);

  return {
    year,
    years: await availableYears(username, current),
    complete: year < current,
    uploads: rows.length,
    bytes,
    types,
    months,
    weekdays,
    hours,
    activeDays: perDay.size,
    busiestDay: busiest,
    streak: longestStreak(perDay.keys()),
    views,
    reactions,
    starred,
    albums,
    links,
    first: ids.length ? byId.get(ids[0]) || null : null,
    topViewed: topViewedIds.map((id) => byId.get(id)).filter(Boolean),
    topReacted: topReacted
      .map((row) => ({ file: byId.get(Number(row.ref_id)), reactions: Number(row.total) || 0 }))
      .filter((entry) => entry.file),
  };
}

module.exports = { review };
