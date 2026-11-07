'use strict';

const crypto = require('crypto');
const config = require('../config');
const db = require('../lib/db');
const settings = require('./settingsService');
const files = require('./fileService');

const CACHE_MS = 15 * 1000;

let cached = { at: 0, text: '' };

const enabled = () => Boolean(settings.get('metrics.enabled'));

const hashOf = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function newToken() {
  const token = `msm_${crypto.randomBytes(24).toString('base64url')}`;
  return { token, hash: hashOf(token) };
}

function authorized(req) {
  const stored = settings.get('metrics.tokenHash');
  if (!stored) return false;
  const header = String(req.get('authorization') || '');
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return false;
  const given = Buffer.from(hashOf(match[1]));
  const expected = Buffer.from(stored);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const escapeLabel = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

function metric(lines, name, help, type, samples) {
  lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
  for (const sample of samples) {
    const labels = sample.labels ? Object.entries(sample.labels).map(([key, value]) => `${key}="${escapeLabel(value)}"`) : [];
    lines.push(`${name}${labels.length ? `{${labels.join(',')}}` : ''} ${Number.isFinite(sample.value) ? sample.value : 0}`);
  }
}

async function collect() {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [summary, users, links, albums, sessions, uploadsToday, reports, requests, certificates] = await Promise.all([
    files.globalStats(),
    db.all('SELECT status, role, COUNT(*) AS count FROM users GROUP BY status, role'),
    db.count('SELECT COUNT(*) FROM links'),
    db.count('SELECT COUNT(*) FROM albums'),
    db.count('SELECT COUNT(*) FROM sessions WHERE expires_at > ?', [now]),
    db.count('SELECT COUNT(*) FROM file_data WHERE created_at >= ?', [startOfDay.getTime()]),
    db.count("SELECT COUNT(*) FROM reports WHERE status = 'open'").catch(() => 0),
    db.count('SELECT COUNT(*) FROM upload_requests WHERE closed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)', [now]),
    db.all('SELECT domain, status, valid_to FROM certificates ORDER BY domain'),
  ]);
  const lines = [];
  metric(lines, 'moeshare_info', 'Laufende Version', 'gauge', [{ labels: { version: config.version }, value: 1 }]);
  metric(
    lines,
    'moeshare_users',
    'Konten nach Status und Rolle',
    'gauge',
    users.map((row) => ({ labels: { status: row.status, role: row.role }, value: Number(row.count) }))
  );
  metric(lines, 'moeshare_files', 'Dateien ohne Papierkorb', 'gauge', [{ value: summary.files }]);
  metric(lines, 'moeshare_files_by_type', 'Dateien nach Art', 'gauge', [
    { labels: { type: 'image' }, value: summary.images },
    { labels: { type: 'video' }, value: summary.videos },
    { labels: { type: 'audio' }, value: summary.audio },
    { labels: { type: 'text' }, value: summary.texts },
  ]);
  metric(lines, 'moeshare_storage_bytes', 'Belegter Speicher einschließlich älterer Fassungen', 'gauge', [{ value: summary.storageBytes }]);
  metric(lines, 'moeshare_deduplicated_bytes', 'Durch Duplikate gesparter Speicher', 'gauge', [{ value: summary.savedBytes }]);
  metric(lines, 'moeshare_views_total', 'Aufrufe aller Dateien', 'counter', [{ value: summary.views }]);
  metric(lines, 'moeshare_uploads_today', 'Uploads seit Mitternacht', 'gauge', [{ value: uploadsToday }]);
  metric(lines, 'moeshare_links', 'Kurzlinks', 'gauge', [{ value: links }]);
  metric(lines, 'moeshare_albums', 'Alben', 'gauge', [{ value: albums }]);
  metric(lines, 'moeshare_sessions_active', 'Gültige Sitzungen', 'gauge', [{ value: sessions }]);
  metric(lines, 'moeshare_reports_open', 'Offene Meldungen', 'gauge', [{ value: reports }]);
  metric(lines, 'moeshare_upload_requests_open', 'Offene Datei-Anfragen', 'gauge', [{ value: requests }]);
  metric(
    lines,
    'moeshare_certificate_expiry_timestamp_seconds',
    'Ablauf der Zertifikate aus der letzten Prüfung',
    'gauge',
    certificates
      .filter((row) => row.valid_to)
      .map((row) => ({ labels: { domain: row.domain }, value: Math.round(Number(row.valid_to) / 1000) }))
  );
  metric(
    lines,
    'moeshare_certificate_ok',
    'Ob das Zertifikat bei der letzten Prüfung in Ordnung war',
    'gauge',
    certificates.map((row) => ({ labels: { domain: row.domain, status: row.status }, value: row.status === 'ok' ? 1 : 0 }))
  );
  return lines;
}

function processLines() {
  const lines = [];
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  metric(lines, 'process_resident_memory_bytes', 'Arbeitsspeicher des Prozesses', 'gauge', [{ value: memory.rss }]);
  metric(lines, 'nodejs_heap_used_bytes', 'Belegter Heap', 'gauge', [{ value: memory.heapUsed }]);
  metric(lines, 'process_cpu_seconds_total', 'Verbrauchte Rechenzeit', 'counter', [{ value: (cpu.user + cpu.system) / 1e6 }]);
  metric(lines, 'process_start_time_seconds', 'Startzeit des Prozesses', 'gauge', [
    { value: Math.round(Date.now() / 1000 - process.uptime()) },
  ]);
  return lines;
}

async function render() {
  if (Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), text: (await collect()).join('\n') };
  return `${cached.text}\n${processLines().join('\n')}\n`;
}

module.exports = { enabled, authorized, newToken, render };
