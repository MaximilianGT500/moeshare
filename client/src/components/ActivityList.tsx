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
import type { AuditEvent } from '../lib/types';
import { formatDateTime, formatNumber, formatRelative } from '../lib/format';
import { providerIcon, providerLabel } from '../lib/providers';
import { c, ease, radius } from '../theme/tokens';

const METHOD: Record<string, string> = {
  password: 'mit Passwort',
  passkey: 'mit Passkey',
  token: 'mit API-Token',
  setup: 'bei der Einrichtung',
  totp: 'mit Code',
};

const methodText = (method: string) => METHOD[method] || (method ? `mit ${providerLabel(method)}` : '');

const SETTING_GROUPS: Record<string, string> = {
  site: 'Allgemein',
  uploads: 'Uploads',
  auth: 'Anmeldung',
  embed: 'Embeds',
  webhook: 'Benachrichtigungen',
  system: 'System',
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
      return { icon: <LoginRounded />, title: `Angemeldet ${methodText(str(d.method))}`.trim(), tone: 'good' };
    case 'login_failed':
      return {
        icon: <ErrorOutlineRounded />,
        title: d.method === 'totp' ? 'Falscher Bestätigungscode' : 'Falsches Passwort',
        tone: 'warn',
      };
    case 'account_locked':
      return { icon: <LockClockRounded />, title: 'Konto kurz gesperrt nach zu vielen Fehlversuchen', tone: 'bad' };
    case 'reauth_failed':
      return { icon: <ErrorOutlineRounded />, title: 'Bestätigung fehlgeschlagen', tone: 'warn' };
    case 'logout':
      return { icon: <LogoutRounded />, title: 'Abgemeldet', tone: 'neutral' };
    case 'password_changed':
      return {
        icon: <PasswordRounded />,
        title: 'Passwort geändert',
        detail: d.endedSessions ? `${formatNumber(Number(d.endedSessions))} andere Sitzungen beendet` : undefined,
        tone: 'neutral',
      };
    case 'password_reset':
      return {
        icon: <KeyRounded />,
        title: d.via === 'cli' ? 'Zugang über die Kommandozeile zurückgesetzt' : 'Passwort zurückgesetzt',
        tone: 'warn',
      };
    case 'mfa_enabled':
      return { icon: <PhonelinkLockRounded />, title: 'Zwei-Faktor-Anmeldung eingerichtet', tone: 'good' };
    case 'mfa_disabled':
      return { icon: <PhonelinkLockRounded />, title: 'Zwei-Faktor-Anmeldung abgeschaltet', tone: 'bad' };
    case 'mfa_reset':
      return { icon: <PhonelinkLockRounded />, title: 'Zwei-Faktor-Anmeldung zurückgesetzt', tone: 'bad' };
    case 'recovery_codes_regenerated':
      return { icon: <KeyRounded />, title: 'Neue Wiederherstellungscodes erstellt', tone: 'neutral' };
    case 'recovery_code_used':
      return {
        icon: <KeyRounded />,
        title: 'Mit Wiederherstellungscode angemeldet',
        detail: typeof d.left === 'number' ? `noch ${d.left} Codes übrig` : undefined,
        tone: 'warn',
      };
    case 'passkey_added':
      return { icon: <FingerprintRounded />, title: 'Passkey hinzugefügt', detail: str(d.name) || undefined, tone: 'good' };
    case 'passkey_removed':
      return {
        icon: <FingerprintRounded />,
        title: d.count ? `${formatNumber(Number(d.count))} Passkeys entfernt` : 'Passkey entfernt',
        tone: 'neutral',
      };
    case 'discord_linked':
      return { icon: <ForumRounded />, title: 'Discord verknüpft', detail: str(d.discord) || undefined, tone: 'good' };
    case 'discord_unlinked':
      return { icon: <ForumRounded />, title: 'Discord getrennt', tone: 'neutral' };
    case 'identity_linked':
      return {
        icon: providerIcon(str(d.provider)),
        title: `${providerLabel(str(d.provider))} verknüpft`,
        detail: str(d.name) || undefined,
        tone: 'good',
      };
    case 'identity_unlinked':
      return { icon: providerIcon(str(d.provider)), title: `${providerLabel(str(d.provider))} getrennt`, tone: 'neutral' };
    case 'token_created':
      return { icon: <TokenRounded />, title: 'API-Token erstellt', detail: str(d.name) || undefined, tone: 'neutral' };
    case 'token_revoked':
      return { icon: <TokenRounded />, title: 'API-Token widerrufen', tone: 'neutral' };
    case 'sessions_revoked':
      return {
        icon: <DevicesRounded />,
        title: Number(d.count) === 1 ? 'Eine Sitzung beendet' : `${formatNumber(Number(d.count) || 0)} Sitzungen beendet`,
        tone: 'neutral',
      };
    case 'user_registered':
      return {
        icon: <PersonAddRounded />,
        title:
          d.method && d.method !== 'password'
            ? `${methodText(str(d.method)).replace(/^mit/, 'Mit')} registriert`
            : d.invite
              ? 'Über Einladung registriert'
              : 'Registriert',
        tone: 'good',
      };
    case 'user_created':
      return { icon: <PersonAddRounded />, title: d.via === 'setup' ? 'Bei der Einrichtung angelegt' : 'Konto angelegt', tone: 'good' };
    case 'user_updated': {
      const parts = [];
      if (d.role) parts.push(d.role === 'admin' ? 'jetzt Admin' : 'jetzt Mitglied');
      if ('quotaBytes' in d || 'maxFileBytes' in d) parts.push('Limits geändert');
      return { icon: <ManageAccountsRounded />, title: 'Konto geändert', detail: parts.join(', ') || undefined, tone: 'neutral' };
    }
    case 'user_suspended':
      return { icon: <BlockRounded />, title: 'Konto gesperrt', tone: 'bad' };
    case 'user_unsuspended':
      return { icon: <LockOpenRounded />, title: 'Konto entsperrt', tone: 'good' };
    case 'user_deleted':
      return { icon: <DeleteOutlineRounded />, title: 'Benutzer gelöscht', detail: str(d.username) || undefined, tone: 'bad' };
    case 'account_deleted':
      return { icon: <DeleteOutlineRounded />, title: 'Eigenes Konto gelöscht', detail: str(d.username) || undefined, tone: 'bad' };
    case 'invite_created':
      return { icon: <GroupAddRounded />, title: d.role === 'admin' ? 'Admin-Einladung erstellt' : 'Einladung erstellt', tone: 'neutral' };
    case 'invite_revoked':
      return { icon: <GroupAddRounded />, title: 'Einladung gelöscht', tone: 'neutral' };
    case 'settings_updated': {
      const keys = Array.isArray(d.keys) ? (d.keys as string[]) : [];
      const groups = [...new Set(keys.map((key) => SETTING_GROUPS[key.split('.')[0]] || key))];
      return { icon: <TuneRounded />, title: 'Einstellungen geändert', detail: groups.join(', ') || undefined, tone: 'neutral' };
    }
    case 'file_deleted':
      return {
        icon: <DeleteOutlineRounded />,
        title: `Datei von ${str(d.owner)} gelöscht`,
        detail: str(d.filename) || undefined,
        tone: 'neutral',
      };
    case 'embed_updated':
      return { icon: <BrushRounded />, title: 'Embed geändert', tone: 'neutral' };
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
  empty = 'Noch keine Aktivität.',
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
                {[info.detail, actor ? `durch ${actor}` : '', meta].filter(Boolean).join(' – ')}
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
