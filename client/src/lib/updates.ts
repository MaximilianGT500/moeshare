import type { UpdateInfo } from './types';
import { t } from './i18n';

const DISMISSED = 'ms-dismissed-update';

export function readDismissedUpdate() {
  try {
    return window.localStorage.getItem(DISMISSED) || '';
  } catch {
    return '';
  }
}

export function writeDismissedUpdate(version: string) {
  try {
    window.localStorage.setItem(DISMISSED, version);
  } catch {}
}

export function updateSteps(install: UpdateInfo['install']): { command: string; note: string } | null {
  if (install === 'docker') {
    return {
      command: 'docker compose pull && docker compose up -d',
      note: t('Im Ordner mit der docker-compose.yml ausführen, beim Installationsskript ist das /opt/moeshare.'),
    };
  }
  if (install === 'script') {
    return {
      command: 'curl -fsSL https://moeshare.moestudio.net/install.sh | sudo bash -s -- --update',
      note: t('Das Skript holt die neue Version und startet MoeShare neu.'),
    };
  }
  if (install === 'git') {
    return { command: 'git pull && npm install', note: t('Im Ordner von MoeShare ausführen und MoeShare danach neu starten.') };
  }
  return null;
}

export function updateError(error: string | null) {
  if (!error) return '';
  if (error === 'invalid') return t('Die Versionsangaben haben ein ungültiges Format.');
  if (error === 'timeout') return t('Der Server mit den Versionsangaben hat nicht rechtzeitig geantwortet.');
  if (error.startsWith('status:'))
    return t('Der Server mit den Versionsangaben antwortet mit Status {status}.', { status: error.slice(7) });
  return t('Der Server mit den Versionsangaben ist nicht erreichbar.');
}

export function updateNotes(notes: UpdateInfo['notes'], language: string) {
  const own = language === 'en' ? notes.en : notes.de;
  return own.length ? own : language === 'en' ? notes.de : notes.en;
}
