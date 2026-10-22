import type { SettingValue } from '../../lib/types';
import { t } from '../../lib/i18n';

export type Values = Record<string, SettingValue>;

export type StepKey = 'welcome' | 'database' | 'account' | 'site' | 'home' | 'uploads' | 'signin' | 'notify' | 'review';

interface StepInfo {
  key: StepKey;
  label: string;
  title: string;
  intro: string;
}

export const STEPS: StepInfo[] = [
  {
    key: 'welcome',
    label: t('Start'),
    title: t('Willkommen bei MoeShare'),
    intro: t(
      'In ein paar Schritten legst du dein Admin-Konto an und stellst ein, wie deine Seite aussieht und was sie kann. Alles lässt sich später unter Admin › Einstellungen ändern.'
    ),
  },
  {
    key: 'database',
    label: t('Datenbank'),
    title: t('Wo sollen die Daten liegen?'),
    intro: t(
      'MoeShare speichert Konten, Einstellungen und Dateiinfos in einer Datenbank. SQLite braucht keine Einrichtung und reicht für die meisten Server. Umziehen kannst du später jederzeit.'
    ),
  },
  {
    key: 'account',
    label: t('Admin-Konto'),
    title: t('Dein Admin-Konto'),
    intro: t('Mit diesem Konto verwaltest du Einstellungen, Benutzer und Einladungen. Der Benutzername erscheint in deinen Datei-Links.'),
  },
  {
    key: 'site',
    label: t('Seite'),
    title: t('Deine Seite'),
    intro: t('Name, Adresse und Farbe. Aus der Grundfarbe entsteht das ganze Farbschema, für helles und dunkles Design.'),
  },
  {
    key: 'home',
    label: t('Startseite'),
    title: t('Was Besucher zuerst sehen'),
    intro: t('Die Adresse ohne Pfad kann eine Startseite mit Statistiken zeigen oder direkt weiterleiten.'),
  },
  {
    key: 'uploads',
    label: t('Uploads'),
    title: t('Uploads'),
    intro: t('Größen, Speicher und was nach dem Hochladen mit Dateien passiert.'),
  },
  {
    key: 'signin',
    label: t('Anmeldung'),
    title: t('Anmeldung und Konten'),
    intro: t('Wer ein Konto bekommt und wie gut Konten geschützt sein müssen.'),
  },
  {
    key: 'notify',
    label: t('Benachrichtigungen'),
    title: t('Benachrichtigungen'),
    intro: t(
      'Auf Wunsch meldet MoeShare Uploads, neue Benutzer und Sicherheitsereignisse in einem Discord-Kanal. Du kannst das auch später einrichten.'
    ),
  },
  {
    key: 'review',
    label: t('Übersicht'),
    title: t('Alles bereit?'),
    intro: t('Prüfe deine Angaben. Mit dem Klick auf „MoeShare einrichten“ wird dein Konto angelegt und du bist direkt angemeldet.'),
  },
];

export const STEP_SETTINGS: Partial<Record<StepKey, string[]>> = {
  site: ['site.title', 'site.baseUrl', 'site.uiColor', 'site.favicon', 'site.language'],
  home: ['home.enabled', 'site.redirectUrl'],
  uploads: [
    'uploads.urlStyle',
    'uploads.maxFileBytes',
    'uploads.defaultQuotaBytes',
    'uploads.preview',
    'uploads.removeMetadata',
    'uploads.dominantColor',
    'uploads.hls',
    'uploads.urlFetch',
  ],
  signin: ['auth.registration', 'auth.enforceMfa', 'auth.passkeys'],
  notify: ['webhook.enabled', 'webhook.url', 'webhook.events'],
};

export function stepOfField(field: string): StepKey | null {
  if (field === 'username' || field === 'password') return 'account';
  if (field === 'database') return 'database';
  for (const [step, keys] of Object.entries(STEP_SETTINGS)) {
    if (keys.includes(field)) return step as StepKey;
  }
  return null;
}

export const COLOR_PRESETS = [
  { hex: '#8b5cf6', name: t('Violett') },
  { hex: '#3b82f6', name: t('Blau') },
  { hex: '#06b6d4', name: t('Türkis') },
  { hex: '#10b981', name: t('Grün') },
  { hex: '#eab308', name: t('Gelb') },
  { hex: '#f97316', name: t('Orange') },
  { hex: '#ef4444', name: t('Rot') },
  { hex: '#ec4899', name: t('Pink') },
];

export const WEBHOOK_EVENTS = [
  { key: 'upload', label: t('Uploads') },
  { key: 'delete', label: t('Löschungen') },
  { key: 'user', label: t('Benutzer') },
  { key: 'security', label: t('Sicherheit') },
  { key: 'processing', label: t('Verarbeitung') },
  { key: 'system', label: t('Systemfehler') },
];

export type DatabaseClient = 'sqlite' | 'postgres' | 'mysql';

export interface DatabaseForm {
  client: DatabaseClient;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export const DEFAULT_PORTS: Record<Exclude<DatabaseClient, 'sqlite'>, string> = { postgres: '5432', mysql: '3306' };

export function databaseUrl(form: DatabaseForm): string {
  if (form.client === 'sqlite') return 'sqlite:db/datenbank.sqlite';
  const auth = form.user ? `${encodeURIComponent(form.user)}${form.password ? `:${encodeURIComponent(form.password)}` : ''}@` : '';
  const host = form.host.includes(':') && !form.host.startsWith('[') ? `[${form.host}]` : form.host.trim();
  const port = form.port.trim() || DEFAULT_PORTS[form.client];
  const query = form.ssl ? (form.client === 'postgres' ? '?sslmode=require' : '?ssl=true') : '';
  return `${form.client}://${auth}${host}:${port}/${encodeURIComponent(form.database.trim())}${query}`;
}

export const isLocalOrigin = (value: unknown) => typeof value === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);

export function tokenFromInput(input: string): string {
  const text = input.trim();
  const match = /[?&]token=([^&#\s]+)/.exec(text);
  return decodeURIComponent(match ? match[1] : text);
}
