import { useEffect, useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import { downloadShareX, shareXKindLabel, shareXKinds, type ShareXFeatures } from '../lib/sharex';
import { t } from '../lib/i18n';
import { CopyTextButton } from './CopyButton';
import { GrowTransition } from './transitions';
import { c, fonts, radius } from '../theme/tokens';

export function TokenNameDialog({
  open,
  onClose,
  onCreate,
  title = t('Neues API-Token'),
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  title?: string;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName('');
  }, [open]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onCreate(name.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="token-name-title"
    >
      <Box component="form" onSubmit={submit}>
        <DialogTitle id="token-name-title">{title}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('Name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            fullWidth
            helperText={t('Woran du das Token später erkennst, z. B. „ShareX am PC“ oder „Backup-Skript“.')}
            slotProps={{ htmlInput: { maxLength: 60 } }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {t('Abbrechen')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !name.trim()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {t('Erstellen')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function TokenRevealDialog({
  token,
  onClose,
  siteTitle,
  baseUrl,
  forUser,
  features,
}: {
  token: string | null;
  onClose: () => void;
  siteTitle: string;
  baseUrl: string;
  forUser?: string;
  features?: ShareXFeatures;
}) {
  const kinds = shareXKinds(features);
  const download = (kind: (typeof kinds)[number]) => token && downloadShareX({ siteTitle, baseUrl, token, kind, features });
  return (
    <Dialog open={!!token} onClose={onClose} maxWidth="sm" fullWidth slots={{ transition: GrowTransition }} aria-labelledby="token-title">
      <DialogTitle id="token-title">{forUser ? t('Token für {forUser}', { forUser }) : t('Dein neues Token')}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {forUser
            ? t('Das Token wird nur jetzt angezeigt. Wer es hat, kann in das Konto von {forUser} hochladen und Dateien löschen.', {
                forUser,
              })
            : t('Das Token wird nur jetzt angezeigt. Wer es hat, kann in dein Konto hochladen und Dateien löschen.')}
        </Alert>
        <Box
          sx={{
            p: 2,
            borderRadius: `${radius.md}px`,
            bgcolor: c.surfaceContainerHighest,
            fontFamily: fonts.mono,
            fontSize: '0.875rem',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {token}
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
          {kinds.length > 1
            ? t(
                'Am einfachsten: Lade die ShareX-Konfigurationen herunter und öffne sie mit einem Doppelklick. ShareX übernimmt Adresse und Token automatisch.'
              )
            : t(
                'Am einfachsten: Lade die ShareX-Konfiguration herunter und öffne die Datei mit einem Doppelklick. ShareX übernimmt Adresse und Token automatisch.'
              )}
        </Typography>
        {kinds.length > 1 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
            {kinds.map((kind) => (
              <Button key={kind} variant="tonal" startIcon={<DownloadRounded />} onClick={() => download(kind)}>
                {shareXKindLabel(kind)}
              </Button>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        {token && (
          <CopyTextButton value={token} message={t('Token kopiert')} icon={<ContentCopyRounded fontSize="inherit" />}>
            {t('Token kopieren')}
          </CopyTextButton>
        )}
        {kinds.length === 1 && (
          <Button variant="tonal" startIcon={<DownloadRounded />} onClick={() => download('files')}>
            {t('ShareX-Konfiguration')}
          </Button>
        )}
        <Button variant="contained" onClick={onClose}>
          {t('Fertig')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
