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
import { downloadText, shareXConfig, shareXFilename } from '../../lib/sharex';
import { c, ease, fonts, radius } from '../../theme/tokens';

export interface SetupResult {
  redirect: string;
  username: string;
  token: string | null;
  baseUrl: string;
}

export function SetupDone({ result, siteTitle, homeEnabled }: { result: SetupResult; siteTitle: string; homeEnabled: boolean }) {
  const needsMfa = result.redirect.startsWith('/account?setup=');
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
            {siteTitle} ist eingerichtet
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 1 }}>
            Du bist als {result.username} angemeldet. Alles, was du eben eingestellt hast, findest du unter Admin › Einstellungen.
          </Typography>
        </m.div>
      </Box>

      {result.token && (
        <Box sx={{ p: 2.5, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainer }}>
          <Typography sx={{ fontWeight: 700 }}>ShareX verbinden</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Lade die Konfiguration herunter und öffne sie, ShareX übernimmt sie mit einem Doppelklick.
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
              label="Token kopieren"
              message="Token kopiert"
              icon={<ContentCopyRounded fontSize="inherit" />}
            />
          </Box>
          <Button
            sx={{ mt: 2 }}
            variant="tonal"
            startIcon={<DownloadRounded />}
            onClick={() =>
              downloadText(shareXFilename(siteTitle), shareXConfig({ siteTitle, baseUrl: result.baseUrl, token: result.token! }))
            }
          >
            ShareX-Konfiguration herunterladen
          </Button>
          <Alert severity="info" sx={{ mt: 2 }}>
            Das Token siehst du nur jetzt. Weitere erstellst du jederzeit unter Konto › ShareX und API.
          </Alert>
        </Box>
      )}

      <Box sx={{ p: 2.5, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainer }}>
        <Typography sx={{ fontWeight: 700 }}>Impressum und Datenschutz</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Ist dein MoeShare öffentlich erreichbar, trägst du beides unter Admin › Einstellungen › Rechtliches und Links ein. Die Links
          stehen dann im Fuß jeder Seite.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {needsMfa ? (
          <Button variant="contained" size="large" href={result.redirect}>
            Zwei-Faktor-Anmeldung einrichten
          </Button>
        ) : (
          <Button variant="contained" size="large" href="/dashboard">
            Zum Dashboard
          </Button>
        )}
        {!needsMfa && (
          <Button variant="tonal" size="large" href="/admin#einstellungen">
            Einstellungen öffnen
          </Button>
        )}
        {homeEnabled && !needsMfa && (
          <Button size="large" href="/">
            Startseite ansehen
          </Button>
        )}
      </Box>
    </Stack>
  );
}
