import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import { CopyIconButton } from '../../components/CopyButton';
import { downloadShareX, shareXKindLabel, shareXKinds, type ShareXFeatures } from '../../lib/sharex';
import { c, ease, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

export interface SetupResult {
  redirect: string;
  username: string;
  token: string | null;
  baseUrl: string;
}

export function SetupDone({
  result,
  siteTitle,
  homeEnabled,
  features,
}: {
  result: SetupResult;
  siteTitle: string;
  homeEnabled: boolean;
  features?: ShareXFeatures;
}) {
  const needsMfa = result.redirect.startsWith('/account?setup=');
  const kinds = shareXKinds(features);
  return (
    <Stack spacing={3.5}>
      <Box>
        <m.div
          initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.1 }}
          style={{ display: 'inline-flex' }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: c.primaryContainer,
              color: c.onPrimaryContainer,
              '& svg': { fontSize: 34 },
            }}
          >
            <TaskAltRounded />
          </Box>
        </m.div>
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: ease.emphasizedDecelerate }}
        >
          <Typography variant="h4" component="h1" sx={{ mt: 2.5 }}>
            {t('{siteTitle} ist eingerichtet', { siteTitle })}
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 1 }}>
            {t('Du bist als {username} angemeldet. Alles, was du eben eingestellt hast, findest du unter Admin › Einstellungen.', {
              username: result.username,
            })}
          </Typography>
        </m.div>
      </Box>

      {result.token && (
        <Box sx={{ p: 2.5, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainer }}>
          <Typography sx={{ fontWeight: 700 }}>{t('ShareX verbinden')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {kinds.length > 1
              ? t('Lade die Konfigurationen herunter und öffne sie, ShareX übernimmt sie mit einem Doppelklick.')
              : t('Lade die Konfiguration herunter und öffne sie, ShareX übernimmt sie mit einem Doppelklick.')}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mt: 2,
              pl: 1.5,
              pr: 0.5,
              py: 0.5,
              borderRadius: `${radius.sm}px`,
              bgcolor: c.surfaceContainerHighest,
            }}
          >
            <Box
              component="code"
              sx={{
                flex: 1,
                minWidth: 0,
                fontFamily: fonts.mono,
                fontSize: '0.8125rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {result.token}
            </Box>
            <CopyIconButton
              value={result.token}
              label={t('Token kopieren')}
              message={t('Token kopiert')}
              icon={<ContentCopyRounded fontSize="inherit" />}
            />
          </Box>
          {kinds.length > 1 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
              {kinds.map((kind) => (
                <Button
                  key={kind}
                  variant="tonal"
                  startIcon={<DownloadRounded />}
                  onClick={() => downloadShareX({ siteTitle, baseUrl: result.baseUrl, token: result.token!, kind, features })}
                >
                  {shareXKindLabel(kind)}
                </Button>
              ))}
            </Box>
          ) : (
            <Button
              sx={{ mt: 2 }}
              variant="tonal"
              startIcon={<DownloadRounded />}
              onClick={() => downloadShareX({ siteTitle, baseUrl: result.baseUrl, token: result.token!, features })}
            >
              {t('ShareX-Konfiguration herunterladen')}
            </Button>
          )}
          <Alert severity="info" sx={{ mt: 2 }}>
            {t('Das Token siehst du nur jetzt. Weitere erstellst du jederzeit unter Konto › ShareX und API.')}
          </Alert>
        </Box>
      )}

      <Box sx={{ p: 2.5, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainer }}>
        <Typography sx={{ fontWeight: 700 }}>{t('Impressum und Datenschutz')}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {t(
            'Ist dein MoeShare öffentlich erreichbar, trägst du beides unter Admin › Einstellungen › Rechtliches und Links ein. Die Links stehen dann im Fuß jeder Seite.'
          )}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {needsMfa ? (
          <Button variant="contained" size="large" href={result.redirect}>
            {t('Zwei-Faktor-Anmeldung einrichten')}
          </Button>
        ) : (
          <Button variant="contained" size="large" href="/dashboard">
            {t('Zum Dashboard')}
          </Button>
        )}
        {!needsMfa && (
          <Button variant="tonal" size="large" href="/admin#einstellungen">
            {t('Einstellungen öffnen')}
          </Button>
        )}
        {homeEnabled && !needsMfa && (
          <Button size="large" href="/">
            {t('Startseite ansehen')}
          </Button>
        )}
      </Box>
    </Stack>
  );
}
