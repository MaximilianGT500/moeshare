import { locale, t } from './i18n';
import { formatDateTime } from './format';
import type { CameraInfo } from './types';

const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

export function exposureText(seconds: number) {
  if (seconds >= 0.95) return `${decimal.format(seconds)} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

export function focalText(camera: CameraInfo) {
  if (!camera.focal) return null;
  const focal = decimal.format(camera.focal);
  if (camera.focal35 && Math.abs(camera.focal35 - camera.focal) >= 1) {
    return t('{focal} mm ({full} mm KB)', { focal, full: decimal.format(camera.focal35) });
  }
  return `${focal} mm`;
}

export function settingsText(camera: CameraInfo) {
  const parts = [
    focalText(camera),
    camera.aperture ? `ƒ/${decimal.format(camera.aperture)}` : null,
    camera.exposure ? exposureText(camera.exposure) : null,
    camera.iso ? `ISO ${camera.iso}` : null,
    camera.bias ? `${camera.bias > 0 ? '+' : '−'}${decimal.format(Math.abs(camera.bias))} EV` : null,
    camera.flash ? t('mit Blitz') : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function takenAt(camera: CameraInfo): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(camera.taken || '');
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const takenText = (camera: CameraInfo) => {
  const date = takenAt(camera);
  return date ? formatDateTime(date) : null;
};

export const hasCamera = (camera: CameraInfo | null | undefined): camera is CameraInfo =>
  !!camera && !!(camera.camera || camera.lens || settingsText(camera) || camera.taken);
