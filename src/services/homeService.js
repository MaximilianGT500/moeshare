'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const { berlinDay } = require('../lib/format');
const settings = require('./settingsService');
const files = require('./fileService');

const ACTIVITY_DAYS = 14;
const DAY_SQL = "substr(creation_date, 7, 4) || '-' || substr(creation_date, 4, 2) || '-' || substr(creation_date, 1, 2)";

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
  const rows = await db.all(`SELECT day, COUNT(*) AS uploads FROM (SELECT ${DAY_SQL} AS day FROM file_data) WHERE day >= ? GROUP BY day`, [
    days[0],
  ]);
  const uploads = Object.fromEntries(rows.map((row) => [row.day, row.uploads]));
  return days.map((day) => ({ day, uploads: uploads[day] || 0 }));
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
