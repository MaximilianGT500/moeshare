import type { EmbedTemplate, FileItem } from './types';
import { formatBytes } from './format';
import { t } from './i18n';

export const LIMITS = { siteName: 256, author: 256, title: 256, description: 350, url: 512 } as const;

export const PLACEHOLDERS: Array<{ token: string; label: string }> = [
  { token: '{dateiname}', label: t('Dateiname') },
  { token: '{name}', label: t('Name ohne Endung') },
  { token: '{endung}', label: t('Endung') },
  { token: '{größe}', label: t('Größe') },
  { token: '{datum}', label: t('Datum') },
  { token: '{uhrzeit}', label: t('Uhrzeit') },
  { token: '{nutzer}', label: t('Benutzer') },
  { token: '{aufrufe}', label: t('Aufrufe') },
  { token: '{auflösung}', label: t('Auflösung') },
  { token: '{typ}', label: t('Dateityp') },
  { token: '{seite}', label: t('Seitenname') },
];

const KEYS: Record<string, string> = {
  dateiname: 'filename',
  name: 'name',
  endung: 'extension',
  größe: 'size',
  groesse: 'size',
  datum: 'date',
  uhrzeit: 'time',
  nutzer: 'user',
  aufrufe: 'views',
  auflösung: 'resolution',
  aufloesung: 'resolution',
  breite: 'width',
  höhe: 'height',
  hoehe: 'height',
  typ: 'type',
  seite: 'site',
  filename: 'filename',
  size: 'size',
  date: 'date',
  time: 'time',
  user: 'user',
  username: 'user',
  views: 'views',
  resolution: 'resolution',
  width: 'width',
  height: 'height',
  type: 'type',
  site: 'site',
};

const TYPE_LABELS: Record<string, string> = { image: t('Bild'), video: t('Video'), audio: t('Audio'), text: t('Text'), file: t('Datei') };

type PlaceholderValues = Record<string, string | number>;

export function valuesFor(
  file: Pick<FileItem, 'filename' | 'sizeBytes' | 'date' | 'username' | 'views' | 'width' | 'height' | 'type'>,
  siteTitle: string
): PlaceholderValues {
  const dot = file.filename.lastIndexOf('.');
  const match = /^(\d{2}\.\d{2}\.\d{4}),?\s+(\d{2}:\d{2})/.exec(file.date || '');
  const hasResolution = file.width > 0 && file.height > 0;
  return {
    filename: file.filename,
    name: dot > 0 ? file.filename.slice(0, dot) : file.filename,
    extension: dot > 0 ? file.filename.slice(dot + 1).toLowerCase() : '',
    size: formatBytes(file.sizeBytes),
    date: match ? match[1] : '',
    time: match ? match[2] : '',
    user: file.username,
    views: file.views,
    resolution: hasResolution ? `${file.width}×${file.height}` : '',
    width: hasResolution ? file.width : '',
    height: hasResolution ? file.height : '',
    type: TYPE_LABELS[file.type] || t('Datei'),
    site: siteTitle,
  };
}

function fill(text: string, values: PlaceholderValues): string {
  if (!text) return '';
  return text.replace(/\{([^{}\s]{1,20})\}/g, (match, name: string) => {
    const key = KEYS[name.toLowerCase()];
    if (!key) return match;
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function unknownPlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\{([^{}\s]{1,20})\}/g)) {
    if (!KEYS[match[1].toLowerCase()]) out.add(match[0]);
  }
  return [...out];
}

export interface RenderedEmbed {
  enabled: boolean;
  siteName: string;
  siteUrl: string;
  author: string;
  authorUrl: string;
  title: string;
  description: string;
  largeImage: boolean;
}

export function render(template: EmbedTemplate, values: PlaceholderValues): RenderedEmbed {
  return {
    enabled: template.enabled,
    siteName: fill(template.siteName, values).slice(0, LIMITS.siteName),
    siteUrl: fill(template.siteUrl, values),
    author: fill(template.author, values).slice(0, LIMITS.author),
    authorUrl: fill(template.authorUrl, values),
    title: fill(template.title, values).slice(0, LIMITS.title),
    description: fill(template.description, values).slice(0, LIMITS.description),
    largeImage: template.largeImage,
  };
}

export const sameTemplate = (a: EmbedTemplate | null, b: EmbedTemplate | null) => JSON.stringify(a) === JSON.stringify(b);
