import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import WifiTetheringRounded from '@mui/icons-material/WifiTetheringRounded';
import { SettingRow } from '../../components/SettingsKit';
import { useToast } from '../../components/Toaster';
import { checkTelegram, errorMessage, fetchTelegramAdmin } from '../../lib/api';
import type { TelegramAdminState } from '../../lib/types';
import { formatNumber, relativeMs } from '../../lib/format';
import { t, tn } from '../../lib/i18n';

export function TelegramTools({ unsaved, pendingToken }: { unsaved: boolean; pendingToken?: string }) {
  const toast = useToast();
  const [state, setState] = useState<TelegramAdminState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTelegramAdmin()
      .then((next) => alive && setState(next))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [unsaved]);

  const check = async () => {
    setBusy(true);
    try {
      const next = await checkTelegram(pendingToken || undefined);
      setState(next);
      toast(t('Verbunden mit @{bot}', { bot: next.bot?.username || '' }), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error', duration: 9000 });
      fetchTelegramAdmin()
        .then(setState)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  return (
    <SettingRow
      label={t('Verbindung')}
      description={
        state.bot
          ? t('Bot @{bot}, {linked}.', {
              bot: state.bot.username,
              linked: tn(state.linked, 'ein Konto verbunden', '{count} Konten verbunden', { count: formatNumber(state.linked) }),
            })
          : t('Prüft das Token und trägt die Befehle /hilfe, /letzte und /trennen beim Bot ein.')
      }
      stacked
    >
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="tonal"
            onClick={check}
            disabled={busy || (!state.configured && !pendingToken)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <WifiTetheringRounded />}
          >
            {t('Verbindung prüfen')}
          </Button>
          {state.lastMessageAt && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Letzte Nachricht {when}', { when: relativeMs(state.lastMessageAt) })}
            </Typography>
          )}
        </Box>
        {!state.configured && !pendingToken && <Alert severity="info">{t('Trag oben das Bot-Token von @BotFather ein.')}</Alert>}
        {state.enabled && unsaved && <Alert severity="info">{t('Speichere zuerst deine Änderungen.')}</Alert>}
        {state.error && <Alert severity="warning">{state.error}</Alert>}
      </Box>
    </SettingRow>
  );
}
