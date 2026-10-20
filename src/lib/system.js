'use strict';

const os = require('os');
const config = require('../config');

function systemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const uptime = os.uptime();
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: os.type(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus.length ? cpus[0].model : 'Unbekannt',
    cpuCores: cpus.length,
    loadavg: os.loadavg(),
    memory: { total, free, used: total - free, usedPercent: Math.round(((total - free) / total) * 100) },
    processMemoryBytes: process.memoryUsage().rss,
    uptime: {
      seconds: uptime,
      days: Math.floor(uptime / 86400),
      hours: Math.floor((uptime % 86400) / 3600),
      minutes: Math.floor((uptime % 3600) / 60),
    },
    nodeVersion: process.version,
    appVersion: config.version,
  };
}

module.exports = { systemInfo };
