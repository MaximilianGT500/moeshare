import type { ReactNode } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LoginRounded from '@mui/icons-material/LoginRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import LockClockRounded from '@mui/icons-material/LockClockRounded';
import PasswordRounded from '@mui/icons-material/PasswordRounded';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import TokenRounded from '@mui/icons-material/TokenRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import ManageAccountsRounded from '@mui/icons-material/ManageAccountsRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import GroupAddRounded from '@mui/icons-material/GroupAddRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import BrushRounded from '@mui/icons-material/BrushRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import PaletteOutlined from '@mui/icons-material/PaletteOutlined';
import type { AuditEvent } from '../lib/types';
import { formatDateTime, formatNumber, formatRelative } from '../lib/format';
import { providerIcon, providerLabel } from '../lib/providers';
import { c, ease, radius } from '../theme/tokens';
import { t } from '../lib/i18n';

const METHOD: Record<string, string> = {
  password: t('mit Passwort'),
  passkey: t('mit Passkey'),
  token: t('mit API-Token'),
  setup: t('bei der Einrichtung'),
  totp: t('mit Code'),
};

const methodText = (method: string) => METHOD[method] || (method ? t('mit {method}', { method: providerLabel(method) }) : '');

const SETTING_GROUPS: Record<string, string> = {
  site: t('Allgemein'),
  uploads: t('Uploads'),
  auth: t('Anmeldung'),
  embed: t('Embeds'),
  webhook: t('Benachrichtigungen'),
  system: t('System'),
  links: t('Kurzlinks'),
  albums: t('Alben'),
  storage: t('Speicherort'),
  backup: t('Sicherungen'),
  legal: t('Rechtliches'),
  view: t('Vorschauseiten'),
  profiles: t('Profilseiten'),
  domains: t('Eigene Domains'),
  trash: t('Papierkorb'),
  stats: t('Statistiken'),
  zip: t('ZIP-Download'),
  reports: t('Melden'),
  mail: t('E-Mail'),
};

const KIND_LABELS: Record<string, string> = { file: t('Datei'), album: t('Album'), link: t('Kurzlink'), profile: t('Profil') };

const REPORT_ACTIONS: Record<string, string> = {
  dismiss: t('verworfen'),
  block: t('Inhalt gesperrt'),
  unblock: t('Sperre aufgehoben'),
  delete: t('Inhalt gelöscht'),
  suspend: t('Konto gesperrt'),
};

type Tone = 'neutral' | 'good' | 'warn' | 'bad';

interface Described {
  icon: ReactNode;
  title: string;
  detail?: string;
  tone: Tone;
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

function describeEvent(event: AuditEvent): Described {
  const d = event.details || {};
  switch (event.action) {
    case 'login':
      return { icon: <LoginRounded />, title: t('Angemeldet {method}', { method: methodText(str(d.method)) }).trim(), tone: 'good' };
    case 'login_failed':
      return {
        icon: <ErrorOutlineRounded />,
        title: d.method === 'totp' ? t('Falscher Bestätigungscode') : t('Falsches Passwort'),
        tone: 'warn',
      };
    case 'account_locked':
      return { icon: <LockClockRounded />, title: t('Konto kurz gesperrt nach zu vielen Fehlversuchen'), tone: 'bad' };
    case 'reauth_failed':
      return { icon: <ErrorOutlineRounded />, title: t('Bestätigung fehlgeschlagen'), tone: 'warn' };
    case 'logout':
      return { icon: <LogoutRounded />, title: t('Abgemeldet'), tone: 'neutral' };
    case 'password_changed':
      return {
        icon: <PasswordRounded />,
        title: t('Passwort geändert'),
        detail: d.endedSessions ? t('{number} andere Sitzungen beendet', { number: formatNumber(Number(d.endedSessions)) }) : undefined,
        tone: 'neutral',
      };
    case 'password_reset':
      return {
        icon: <KeyRounded />,
        title:
          d.via === 'cli'
            ? t('Zugang über die Kommandozeile zurückgesetzt')
            : d.method === 'email'
              ? t('Passwort per E-Mail-Link zurückgesetzt')
              : t('Passwort zurückgesetzt'),
        tone: 'warn',
      };
    case 'mfa_enabled':
      return { icon: <PhonelinkLockRounded />, title: t('Zwei-Faktor-Anmeldung eingerichtet'), tone: 'good' };
    case 'mfa_disabled':
      return { icon: <PhonelinkLockRounded />, title: t('Zwei-Faktor-Anmeldung abgeschaltet'), tone: 'bad' };
    case 'mfa_reset':
      return { icon: <PhonelinkLockRounded />, title: t('Zwei-Faktor-Anmeldung zurückgesetzt'), tone: 'bad' };
    case 'recovery_codes_regenerated':
      return { icon: <KeyRounded />, title: t('Neue Wiederherstellungscodes erstellt'), tone: 'neutral' };
    case 'recovery_code_used':
      return {
        icon: <KeyRounded />,
        title: t('Mit Wiederherstellungscode angemeldet'),
        detail: typeof d.left === 'number' ? t('noch {left} Codes übrig', { left: d.left }) : undefined,
        tone: 'warn',
      };
    case 'passkey_added':
      return { icon: <FingerprintRounded />, title: t('Passkey hinzugefügt'), detail: str(d.name) || undefined, tone: 'good' };
    case 'passkey_removed':
      return {
        icon: <FingerprintRounded />,
        title: d.count ? t('{number} Passkeys entfernt', { number: formatNumber(Number(d.count)) }) : t('Passkey entfernt'),
        tone: 'neutral',
      };
    case 'discord_linked':
      return { icon: <ForumRounded />, title: t('Discord verknüpft'), detail: str(d.discord) || undefined, tone: 'good' };
    case 'discord_unlinked':
      return { icon: <ForumRounded />, title: t('Discord getrennt'), tone: 'neutral' };
    case 'identity_linked':
      return {
        icon: providerIcon(str(d.provider)),
        title: t('{providerLabel} verknüpft', { providerLabel: providerLabel(str(d.provider)) }),
        detail: str(d.name) || undefined,
        tone: 'good',
      };
    case 'identity_unlinked':
      return {
        icon: providerIcon(str(d.provider)),
        title: t('{providerLabel} getrennt', { providerLabel: providerLabel(str(d.provider)) }),
        tone: 'neutral',
      };
    case 'token_created':
      return { icon: <TokenRounded />, title: t('API-Token erstellt'), detail: str(d.name) || undefined, tone: 'neutral' };
    case 'token_revoked':
      return { icon: <TokenRounded />, title: t('API-Token widerrufen'), tone: 'neutral' };
    case 'sessions_revoked':
      return {
        icon: <DevicesRounded />,
        title:
          Number(d.count) === 1
            ? t('Eine Sitzung beendet')
            : t('{number} Sitzungen beendet', { number: formatNumber(Number(d.count) || 0) }),
        tone: 'neutral',
      };
    case 'user_registered':
      return {
        icon: <PersonAddRounded />,
        title:
          d.method && d.method !== 'password'
            ? t('{value} registriert', { value: methodText(str(d.method)).replace(/^mit/, 'Mit') })
            : d.invite
              ? t('Über Einladung registriert')
              : t('Registriert'),
        tone: 'good',
      };
    case 'user_created':
      return {
        icon: <PersonAddRounded />,
        title: d.via === 'setup' ? t('Bei der Einrichtung angelegt') : t('Konto angelegt'),
        tone: 'good',
      };
    case 'user_updated': {
      const parts = [];
      if (d.role) parts.push(d.role === 'admin' ? t('jetzt Admin') : t('jetzt Mitglied'));
      if ('quotaBytes' in d || 'maxFileBytes' in d) parts.push(t('Limits geändert'));
      return { icon: <ManageAccountsRounded />, title: t('Konto geändert'), detail: parts.join(', ') || undefined, tone: 'neutral' };
    }
    case 'user_suspended':
      return { icon: <BlockRounded />, title: t('Konto gesperrt'), tone: 'bad' };
    case 'user_unsuspended':
      return { icon: <LockOpenRounded />, title: t('Konto entsperrt'), tone: 'good' };
    case 'user_deleted':
      return { icon: <DeleteOutlineRounded />, title: t('Benutzer gelöscht'), detail: str(d.username) || undefined, tone: 'bad' };
    case 'account_deleted':
      return { icon: <DeleteOutlineRounded />, title: t('Eigenes Konto gelöscht'), detail: str(d.username) || undefined, tone: 'bad' };
    case 'invite_created':
      return {
        icon: <GroupAddRounded />,
        title: d.role === 'admin' ? t('Admin-Einladung erstellt') : t('Einladung erstellt'),
        tone: 'neutral',
      };
    case 'invite_revoked':
      return { icon: <GroupAddRounded />, title: t('Einladung gelöscht'), tone: 'neutral' };
    case 'settings_updated': {
      const keys = Array.isArray(d.keys) ? (d.keys as string[]) : [];
      const groups = [...new Set(keys.map((key) => SETTING_GROUPS[key.split('.')[0]] || key))];
      return { icon: <TuneRounded />, title: t('Einstellungen geändert'), detail: groups.join(', ') || undefined, tone: 'neutral' };
    }
    case 'file_deleted':
      return {
        icon: <DeleteOutlineRounded />,
        title: d.trash
          ? t('Datei von {owner} in den Papierkorb gelegt', { owner: str(d.owner) })
          : t('Datei von {owner} gelöscht', { owner: str(d.owner) }),
        detail: str(d.filename) || undefined,
        tone: 'neutral',
      };
    case 'embed_updated':
      return { icon: <BrushRounded />, title: t('Embed geändert'), tone: 'neutral' };
    case 'design_updated':
      return { icon: <PaletteOutlined />, title: t('Design der Vorschauseite geändert'), tone: 'neutral' };
    case 'email_changed':
      return { icon: <MailOutlineRounded />, title: t('E-Mail-Adresse bestätigt'), detail: str(d.email) || undefined, tone: 'good' };
    case 'email_removed':
      return { icon: <MailOutlineRounded />, title: t('E-Mail-Adresse entfernt'), tone: 'neutral' };
    case 'domain_added':
      return { icon: <LanguageRounded />, title: t('Domain hinzugefügt'), detail: str(d.domain) || undefined, tone: 'neutral' };
    case 'domain_verified':
      return {
        icon: <LanguageRounded />,
        title: d.automatic ? t('Domain automatisch bestätigt') : t('Domain bestätigt'),
        detail: str(d.domain) || undefined,
        tone: 'good',
      };
    case 'domain_removed':
      return { icon: <LanguageRounded />, title: t('Domain entfernt'), detail: str(d.domain) || undefined, tone: 'neutral' };
    case 'domain_revoked':
      return { icon: <LanguageRounded />, title: t('Domain von einem Admin entfernt'), detail: str(d.domain) || undefined, tone: 'bad' };
    case 'report_resolved':
      return {
        icon: <FlagOutlined />,
        title: t('Meldung bearbeitet'),
        detail: REPORT_ACTIONS[str(d.action)] || undefined,
        tone: d.action === 'dismiss' ? 'neutral' : 'warn',
      };
    case 'content_blocked':
      return { icon: <BlockRounded />, title: t('Inhalt gesperrt'), detail: KIND_LABELS[str(d.kind)] || undefined, tone: 'bad' };
    case 'content_unblocked':
      return { icon: <LockOpenRounded />, title: t('Sperre aufgehoben'), detail: KIND_LABELS[str(d.kind)] || undefined, tone: 'good' };
    default:
      return { icon: <HistoryRounded />, title: event.action, tone: 'neutral' };
  }
}

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
  good: { bg: c.secondaryContainer, fg: c.onSecondaryContainer },
  warn: { bg: c.warningContainer, fg: c.onWarningContainer },
  bad: { bg: c.errorContainer, fg: c.onErrorContainer },
};

export function ActivityList({
  events,
  showPeople = false,
  empty = t('Noch keine Aktivität.'),
}: {
  events: AuditEvent[];
  showPeople?: boolean;
  empty?: string;
}) {
  if (!events.length) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        {empty}
      </Typography>
    );
  }
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {events.map((event, index) => {
        const info = describeEvent(event);
        const tone = TONES[info.tone];
        const subject = event.user?.username;
        const actor = event.actor && event.actor.id !== event.user?.id ? event.actor.username : null;
        const device = typeof event.details.device === 'string' ? event.details.device : '';
        const meta = [device, event.ip].filter(Boolean).join(', ');
        return (
          <m.li
            key={event.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.025, duration: 0.3, ease: ease.emphasizedDecelerate }}
            style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '10px 0' }}
          >
            <Box
              aria-hidden
              sx={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: `${radius.full}px`,
                display: 'grid',
                placeItems: 'center',
                bgcolor: tone.bg,
                color: tone.fg,
                '& svg': { fontSize: 18 },
              }}
            >
              {info.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {showPeople && subject ? <Box component="span">{subject}: </Box> : null}
                {info.title}
              </Typography>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', wordBreak: 'break-word' }}>
                {[info.detail, actor ? t('durch {actor}', { actor }) : '', meta].filter(Boolean).join(' – ')}
              </Typography>
            </Box>
            <Tooltip title={formatDateTime(new Date(event.at))}>
              <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', pt: 0.25 }}>
                {formatRelative(new Date(event.at))}
              </Typography>
            </Tooltip>
          </m.li>
        );
      })}
    </Box>
  );
}
