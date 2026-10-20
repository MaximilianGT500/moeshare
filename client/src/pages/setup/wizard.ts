import type { SettingValue } from '../../lib/types';

export type Values = Record<string, SettingValue>;

export type StepKey = 'welcome' | 'account' | 'site' | 'home' | 'uploads' | 'signin' | 'notify' | 'review';

interface StepInfo {
  key: StepKey;
  label: string;
  title: string;
  intro: string;
}

export const STEPS: StepInfo[] = [
  {
    key: 'welcome',
    label: 'Start',
    title: 'Willkommen bei MoeShare',
    intro:
      'In ein paar Schritten legst du dein Admin-Konto an und stellst ein, wie deine Seite aussieht und was sie kann. Alles lässt sich später unter Admin › Einstellungen ändern.',
  },
  {
    key: 'account',
    label: 'Admin-Konto',
    title: 'Dein Admin-Konto',
    intro: 'Mit diesem Konto verwaltest du Einstellungen, Benutzer und Einladungen. Der Benutzername erscheint in deinen Datei-Links.',
  },
  {
    key: 'site',
    label: 'Seite',
    title: 'Deine Seite',
    intro: 'Name, Adresse und Farbe. Aus der Grundfarbe entsteht das ganze Farbschema, für helles und dunkles Design.',
  },
  {
    key: 'home',
    label: 'Startseite',
    title: 'Was Besucher zuerst sehen',
    intro: 'Die Adresse ohne Pfad kann eine Startseite mit Statistiken zeigen oder direkt weiterleiten.',
  },
  {
    key: 'uploads',
    label: 'Uploads',
    title: 'Uploads',
    intro: 'Größen, Speicher und was nach dem Hochladen mit Dateien passiert.',
  },
  {
    key: 'signin',
    label: 'Anmeldung',
    title: 'Anmeldung und Konten',
    intro: 'Wer ein Konto bekommt und wie gut Konten geschützt sein müssen.',
  },
  {
    key: 'notify',
    label: 'Benachrichtigungen',
    title: 'Benachrichtigungen',
    intro:
      'Auf Wunsch meldet MoeShare Uploads, neue Benutzer und Sicherheitsereignisse in einem Discord-Kanal. Du kannst das auch später einrichten.',
  },
  {
    key: 'review',
    label: 'Übersicht',
    title: 'Alles bereit?',
    intro: 'Prüfe deine Angaben. Mit dem Klick auf „MoeShare einrichten“ wird dein Konto angelegt und du bist direkt angemeldet.',
  },
];

export const STEP_SETTINGS: Partial<Record<StepKey, string[]>> = {
  site: ['site.title', 'site.baseUrl', 'site.uiColor', 'site.favicon'],
  home: ['home.enabled', 'site.redirectUrl'],
  uploads: [
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
  for (const [step, keys] of Object.entries(STEP_SETTINGS)) {
    if (keys.includes(field)) return step as StepKey;
  }
  return null;
}

export const COLOR_PRESETS = [
  { hex: '#8b5cf6', name: 'Violett' },
  { hex: '#3b82f6', name: 'Blau' },
  { hex: '#06b6d4', name: 'Türkis' },
  { hex: '#10b981', name: 'Grün' },
  { hex: '#eab308', name: 'Gelb' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#ef4444', name: 'Rot' },
  { hex: '#ec4899', name: 'Pink' },
];

export const WEBHOOK_EVENTS = [
  { key: 'upload', label: 'Uploads' },
  { key: 'delete', label: 'Löschungen' },
  { key: 'user', label: 'Benutzer' },
  { key: 'security', label: 'Sicherheit' },
  { key: 'processing', label: 'Verarbeitung' },
  { key: 'system', label: 'Systemfehler' },
];

export const isLocalOrigin = (value: unknown) => typeof value === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);

export function tokenFromInput(input: string): string {
  const text = input.trim();
  const match = /[?&]token=([^&#\s]+)/.exec(text);
  return decodeURIComponent(match ? match[1] : text);
}
