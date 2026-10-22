import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ComputerRounded from '@mui/icons-material/ComputerRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import TabletRounded from '@mui/icons-material/TabletRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import type { SessionInfo } from '../../lib/types';
import { errorMessage, revokeOtherSessions, revokeSession } from '../../lib/api';
import { formatDateTime, relativeMs } from '../../lib/format';
import { SettingsSection } from '../../components/SettingsKit';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { providerLabel } from '../../lib/providers';
import { c, ease, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

function DeviceIcon({ device }: { device: string }) {
  if (/iPhone|Android/.test(device)) return <SmartphoneRounded />;
  if (/iPad/.test(device)) return <TabletRounded />;
  if (/curl|ShareX/.test(device)) return <TerminalRounded />;
  return <ComputerRounded />;
}

export function SessionRow({ session, onRevoke }: { session: SessionInfo; onRevoke?: () => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, sm: 3 }, py: 2 }}>
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: `${radius.md}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: session.current ? c.primaryContainer : c.surfaceContainerHighest,
          color: session.current ? c.onPrimaryContainer : c.onSurfaceVariant,
        }}
      >
        <DeviceIcon device={session.device} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: '0.9375rem' }}>
          {session.device}
          {session.current && (
            <Chip size="small" label={t('Dieses Gerät')} sx={{ bgcolor: c.primary, color: c.onPrimary, fontWeight: 700 }} />
          )}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {session.current ? t('Gerade aktiv') : t('Aktiv {lastSeenAt}', { lastSeenAt: relativeMs(session.lastSeenAt) })}
          {session.ip ? `, ${session.ip}` : ''}
        </Typography>
        <Tooltip title={t('Angemeldet am {dateTime}', { dateTime: formatDateTime(new Date(session.createdAt)) })}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('Angemeldet mit {method} {createdAt}', { method: providerLabel(session.method), createdAt: relativeMs(session.createdAt) })}
            {session.persistent ? '' : t(', bis der Browser schließt')}
          </Typography>
        </Tooltip>
      </Box>
      {onRevoke && !session.current && (
        <Tooltip title={t('Abmelden')}>
          <IconButton
            aria-label={t('{device} abmelden', { device: session.device })}
            onClick={onRevoke}
            sx={{ '&:hover': { color: c.error } }}
          >
            <LogoutRounded />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export function SessionsPanel({ sessions, reload }: { sessions: SessionInfo[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const others = sessions.filter((s) => !s.current);

  const revoke = async (session: SessionInfo) => {
    try {
      await revokeSession(session.id);
      toast(t('{device} abgemeldet', { device: session.device }), { variant: 'success' });
      reload();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const revokeOthers = async () => {
    const ok = await confirm({
      title: t('Alle anderen Geräte abmelden?'),
      message: tn(
        others.length,
        'Ein Gerät wird sofort abgemeldet. ShareX und andere Programme mit API-Token sind davon nicht betroffen.',
        '{count} Geräte werden sofort abgemeldet. ShareX und andere Programme mit API-Token sind davon nicht betroffen.'
      ),
      confirmLabel: t('Abmelden'),
      icon: <DevicesRounded />,
    });
    if (!ok) return;
    try {
      const result = await revokeOtherSessions();
      toast(result.count === 1 ? t('Ein Gerät abgemeldet') : t('{count} Geräte abgemeldet', { count: result.count }), {
        variant: 'success',
      });
      reload();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  return (
    <Stack spacing={4}>
      <SettingsSection
        id="geraete"
        title={t('Angemeldete Geräte')}
        description={t('Siehst du ein Gerät, das du nicht kennst? Melde es ab und ändere dein Passwort.')}
        action={
          others.length > 0 && (
            <Button variant="tonal" onClick={revokeOthers} startIcon={<LogoutRounded />}>
              {t('Alle anderen abmelden')}
            </Button>
          )
        }
      >
        <AnimatePresence initial={false}>
          {sessions.map((session) => (
            <m.div
              key={session.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: ease.emphasizedDecelerate }}
            >
              <SessionRow session={session} onRevoke={() => revoke(session)} />
            </m.div>
          ))}
        </AnimatePresence>
      </SettingsSection>
    </Stack>
  );
}
