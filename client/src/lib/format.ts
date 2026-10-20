const LOCALE = 'de-DE';

const numberFormat = new Intl.NumberFormat(LOCALE);
export const formatNumber = (value: number) => numberFormat.format(Math.round(value || 0));

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
export function formatBytes(bytes: number, fractionDigits?: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, i);
  const digits = i === 0 ? 0 : (fractionDigits ?? (value < 10 ? 1 : 0));
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)} ${UNITS[i]}`;
}

const berlinParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function berlinOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(berlinParts.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}

export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const wall = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  let utc = wall - berlinOffsetMs(wall);
  utc = wall - berlinOffsetMs(utc);
  return new Date(utc);
}

const relative = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
const shortDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const fullDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatRelative(date: Date | null, now = Date.now()): string {
  if (!date) return '';
  const diff = (date.getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'gerade eben';
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(diff / 3600), 'hour');
  if (abs < 7 * 86400) return relative.format(Math.round(diff / 86400), 'day');
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return (sameYear ? shortDate : fullDate).format(date);
}

export const formatDateTime = (date: Date | null) => (date ? `${dateTime.format(date)} Uhr` : '');

export const formatDate = (date: Date | null) => (date ? fullDate.format(date) : '');

export const relativeMs = (ms: number | null | undefined, fallback = 'nie') => (ms ? formatRelative(new Date(ms)) : fallback);

export const relativeFromServer = (value: string | null | undefined) => formatRelative(parseServerDate(value));

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days} ${days === 1 ? 'Tag' : 'Tage'}, ${hours} Std.`;
  if (hours > 0) return `${hours} Std., ${minutes} Min.`;
  return `${minutes} Min.`;
}

export const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

export const storageSummary = (stats: { files: number; storageBytes: number }) =>
  `${plural(stats.files, 'Datei', 'Dateien')}, ${formatBytes(stats.storageBytes)} belegt`;

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,10})$/i.exec(filename);
  return match ? match[1].toLowerCase() : '';
}
