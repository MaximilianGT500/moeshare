'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const { berlinDay, parseBerlinDate } = require('../lib/format');
const settings = require('./settingsService');
const files = require('./fileService');

const ACTIVITY_DAYS = 14;

function lastDays(count) {
  const today = new Date(`${berlinDay()}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - (count - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}

async function activity() {
  const days = lastDays(ACTIVITY_DAYS);
  const [year, month, day] = days[0].split('-');
  const since = parseBerlinDate(`${day}.${month}.${year}, 00:00:00`);
  const rows = await db.all('SELECT created_at FROM file_data WHERE created_at >= ?', [since]);
  const uploads = {};
  for (const row of rows) {
    const key = berlinDay(new Date(Number(row.created_at)));
    uploads[key] = (uploads[key] || 0) + 1;
  }
  return days.map((entry) => ({ day: entry, uploads: uploads[entry] || 0 }));
}

const collect = () =>
  cache.remember('stats:home', 60000, async () => {
    const summary = await files.globalStats();
    const days = await activity();
    return {
      values: {
        files: summary.files,
        storage: summary.storageBytes,
        views: summary.views,
        users: summary.users,
        images: summary.images,
        videos: summary.videos,
        audio: summary.audio,
        today: days[days.length - 1].uploads,
      },
      activity: days,
    };
  });

const options = () => ({
  enabled: settings.get('home.enabled'),
  headline: settings.get('home.headline'),
  text: settings.get('home.text'),
  stats: settings.get('home.stats'),
  activity: settings.get('home.activity'),
  signIn: settings.get('home.signIn'),
});

async function publicStats() {
  const { values, activity: days } = await collect();
  return {
    stats: settings.get('home.stats').map((key) => ({ key, value: values[key] })),
    activity: settings.get('home.activity') ? days : null,
  };
}

async function allStats() {
  const { values, activity: days } = await collect();
  return { values, activity: days };
}

module.exports = { options, publicStats, allStats };
