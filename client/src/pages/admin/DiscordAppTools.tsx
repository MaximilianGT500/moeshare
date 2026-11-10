import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import { SettingRow } from '../../components/SettingsKit';
import { CopyIconButton } from '../../components/CopyButton';
import { useToast } from '../../components/Toaster';
import { errorMessage, fetchDiscordApp, registerDiscordCommands, type DiscordAppState } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { c, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';
import { siteName } from '../../lib/boot';

export function DiscordAppTools({ unsaved }: { unsaved: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<DiscordAppState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchDiscordApp()
      .then((next) => alive && setState(next))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [unsaved]);

  const register = async () => {
    setBusy(true);
    try {
      const next = await registerDiscordCommands();
      setState(next);
      toast(t('Befehle bei Discord eingetragen. Es kann einen Moment dauern, bis sie überall erscheinen.'), {
        variant: 'success',
        duration: 6000,
      });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error', duration: 9000 });
      fetchDiscordApp()
        .then(setState)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  return (
    <>
      <SettingRow
        label={t('Interactions Endpoint URL')}
        description={t(
          'Trag diese Adresse im Developer Portal unter General Information ein. Discord prüft sie beim Speichern, die App muss dafür hier schon eingeschaltet sein.'
        )}
        stacked
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pl: 1.5,
            pr: 0.5,
            py: 0.5,
            borderRadius: `${radius.sm}px`,
            bgcolor: c.surfaceContainerHighest,
            fontFamily: fonts.mono,
            fontSize: '0.8125rem',
            wordBreak: 'break-all',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>{state.endpoint}</Box>
          <CopyIconButton
            value={state.endpoint}
            label={t('Adresse kopieren')}
            message={t('Adresse kopiert')}
            icon={<ContentCopyRounded fontSize="inherit" />}
            size="small"
          />
        </Box>
      </SettingRow>
      <SettingRow
        label={t('Befehle')}
        description={t(
          'Trägt „In {name} speichern“, /hochladen und /kürzen bei Discord ein. Nach einer Namensänderung noch einmal ausführen.',
          {
            name: siteName(),
          }
        )}
        stacked
      >
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="tonal"
              onClick={register}
              disabled={busy || unsaved || !state.credentials}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SyncRounded />}
            >
              {t('Befehle bei Discord eintragen')}
            </Button>
            {state.registeredAt && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('Zuletzt eingetragen: {date}', { date: formatDateTime(new Date(state.registeredAt)) })}
              </Typography>
            )}
          </Box>
          {!state.credentials && <Alert severity="info">{t('Trag oben Client-ID und Client-Secret ein und speichere sie.')}</Alert>}
          {state.credentials && unsaved && <Alert severity="info">{t('Speichere zuerst deine Änderungen.')}</Alert>}
          {state.error && <Alert severity="warning">{state.error}</Alert>}
          {!state.login && (
            <Alert severity="info">
              {t(
                'Die App erkennt Konten am verknüpften Discord. Schalte dafür die Anmeldung mit Discord ein, verknüpfen geht dann unter Konto › Sicherheit.'
              )}
            </Alert>
          )}
        </Box>
      </SettingRow>
    </>
  );
}
