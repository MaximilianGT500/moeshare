import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { CLIENTS, clientFilename, clientScript, clientSteps, type ClientKind } from '../lib/clients';
import { downloadText } from '../lib/sharex';
import { siteSlug } from '../lib/boot';
import { CopyIconButton, CopyTextButton } from './CopyButton';
import { GrowTransition } from './transitions';
import { c, fonts, radius } from '../theme/tokens';
import { t } from '../lib/i18n';

function Code({ value, label }: { value: string; label: string }) {
  return (
    <Box sx={{ position: 'relative', borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHighest }}>
      <Box
        component="pre"
        sx={{ m: 0, p: 2, pr: 6, fontFamily: fonts.mono, fontSize: '0.8125rem', lineHeight: 1.6, overflowX: 'auto', maxHeight: 360 }}
      >
        {value}
      </Box>
      <Box sx={{ position: 'absolute', top: 6, right: 6 }}>
        <CopyIconButton value={value} size="small" label={label} message={t('Kopiert')} icon={<ContentCopyRounded fontSize="inherit" />} />
      </Box>
    </Box>
  );
}

function ShortcutSteps({ baseUrl, token }: { baseUrl: string; token: string }) {
  const steps = [
    t('Öffne Kurzbefehle und lege einen neuen Kurzbefehl an.'),
    t('Füge „Fotos auswählen“ hinzu, am Mac auch „Bildschirmfoto aufnehmen“.'),
    t('Füge „Inhalte von URL abrufen“ hinzu. Adresse: {url}, Methode POST.', { url: `${baseUrl}/upload` }),
    t('Lege dort unter Header den Eintrag Authorization mit deinem Token als Wert an.'),
    t(
      'Stelle den Anfragetext auf Formular und füge ein Feld vom Typ Datei mit dem Namen file hinzu. Als Wert wählst du das Foto aus Schritt 2.'
    ),
    t('Füge „Wörterbuchwert abrufen“ für den Schlüssel view hinzu und danach „In Zwischenablage kopieren“.'),
  ];
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}>
        {steps.map((step) => (
          <Typography component="li" variant="body2" key={step}>
            {step}
          </Typography>
        ))}
      </Box>
      <Code value={token} label={t('Token kopieren')} />
    </Box>
  );
}

export function ClientSetupDialog({
  kind,
  token,
  siteTitle,
  baseUrl,
  onClose,
}: {
  kind: ClientKind | null;
  token: string | null;
  siteTitle: string;
  baseUrl: string;
  onClose: () => void;
}) {
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const spec = CLIENTS.find((item) => item.kind === kind) || null;
  const open = Boolean(spec && token);
  const filename = spec ? clientFilename(spec.kind, siteSlug()) : '';
  const script = spec && token ? clientScript(spec.kind, { site: siteTitle, baseUrl, token }) : '';
  const steps = spec ? clientSteps(spec.kind, filename) : [];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={phone} slots={{ transition: GrowTransition }}>
      <DialogTitle>{spec ? t('{name} einrichten', { name: spec.name }) : ''}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          <Alert severity="warning">
            {t('Das Token steht nur jetzt im Klartext da. Wer es hat, kann in dein Konto hochladen und Dateien löschen.')}
          </Alert>
          {spec?.kind === 'shortcuts' && token ? (
            <ShortcutSteps baseUrl={baseUrl} token={token} />
          ) : (
            <>
              <Code value={script} label={spec?.script ? t('Skript kopieren') : t('Befehl kopieren')} />
              {steps.length > 0 && (
                <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}>
                  {steps.map((step) => (
                    <Typography component="li" variant="body2" key={step}>
                      {step}
                    </Typography>
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {token && (
          <CopyTextButton value={token} message={t('Token kopiert')} icon={<ContentCopyRounded fontSize="inherit" />}>
            {t('Token kopieren')}
          </CopyTextButton>
        )}
        {spec?.script && (
          <Button variant="tonal" startIcon={<DownloadRounded />} onClick={() => downloadText(filename, script, 'text/x-shellscript')}>
            {t('Skript speichern')}
          </Button>
        )}
        <Button variant="contained" onClick={onClose}>
          {t('Fertig')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
