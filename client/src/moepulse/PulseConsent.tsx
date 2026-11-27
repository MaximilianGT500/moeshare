import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

export interface PulseTexts {
  title: string;
  summary: string;
  stats: string[];
  errors: string[];
  note: string;
}

export interface PulseChoice {
  stats: boolean;
  errors: boolean;
}

export interface PulseState {
  installId: string | null;
  lastHeartbeat: number | null;
  lastError: string | null;
  blocked?: boolean;
}

export interface PulseConsentProps {
  texts: PulseTexts;
  value: PulseChoice;
  onChange: (value: PulseChoice) => void | Promise<void>;
  preview?: () => Promise<unknown>;
  onForget?: () => Promise<boolean | void>;
  status?: PulseState | null;
  disabled?: boolean;
  language?: 'de' | 'en';
}

const LABELS = {
  de: {
    stats: 'Nutzungsstatistik teilen',
    statsHint: 'Version, System und Speicherplatz, ohne persönliche Daten',
    errors: 'Fehlerberichte senden',
    errorsHint: 'Fehlermeldungen mit Programmstelle, bereinigt',
    details: 'Was genau gesendet wird',
    hide: 'Weniger zeigen',
    preview: 'Vorschau',
    previewTitle: 'Das würde gesendet',
    previewText: 'So sieht die nächste Meldung aus. Fehlerberichte kommen nur, wenn ein Fehler auftritt.',
    forget: 'Gesendete Daten löschen',
    forgetTitle: 'Gesendete Daten löschen?',
    forgetText:
      'MoeStudio löscht alles, was diese Installation bisher geschickt hat. Danach ist die Statistik aus. Schaltest du sie wieder ein, meldet sich die Installation als neue.',
    forgetDone: 'Gelöscht. Die Statistik ist jetzt aus.',
    forgetFailed: 'Löschen hat nicht geklappt. Versuch es später noch einmal.',
    cancel: 'Abbrechen',
    close: 'Schließen',
    confirm: 'Löschen',
    never: 'Noch nichts gesendet',
    last: 'Zuletzt gesendet',
    problem: 'Letzter Versuch fehlgeschlagen',
    blocked:
      'MoeStudio nimmt von dieser Installation gerade keine Daten an. Es wird nichts gesendet. Hebt MoeStudio die Sperre auf, geht es von selbst weiter.',
  },
  en: {
    stats: 'Share usage statistics',
    statsHint: 'Version, system and disk space, no personal data',
    errors: 'Send error reports',
    errorsHint: 'Error messages with the place in the code, cleaned',
    details: 'What exactly is sent',
    hide: 'Show less',
    preview: 'Preview',
    previewTitle: 'This would be sent',
    previewText: 'This is what the next report looks like. Error reports are only sent when an error happens.',
    forget: 'Delete sent data',
    forgetTitle: 'Delete sent data?',
    forgetText:
      'MoeStudio deletes everything this installation has sent so far. Statistics are turned off afterwards. If you turn them on again, the installation reports as a new one.',
    forgetDone: 'Deleted. Statistics are now off.',
    forgetFailed: 'Deleting did not work. Please try again later.',
    cancel: 'Cancel',
    close: 'Close',
    confirm: 'Delete',
    never: 'Nothing sent yet',
    last: 'Last sent',
    problem: 'Last attempt failed',
    blocked:
      'MoeStudio currently does not accept data from this installation. Nothing is sent. Once MoeStudio lifts the block, it continues on its own.',
  },
};

export function PulseConsent({ texts, value, onChange, preview, onForget, status, disabled, language = 'de' }: PulseConsentProps) {
  const t = LABELS[language];
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const time = new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const toggle = (key: keyof PulseChoice, label: string, hint: string) => (
    <FormControlLabel
      disabled={disabled}
      control={<Switch checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />}
      label={
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {label}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {hint}
          </Typography>
        </Box>
      }
      sx={{ m: 0, gap: 1, alignItems: 'center' }}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {texts.title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', textWrap: 'pretty' }}>
          {texts.summary}
        </Typography>
      </Box>
      {toggle('stats', t.stats, t.statsHint)}
      {toggle('errors', t.errors, t.errorsHint)}
      <Box>
        <Link component="button" type="button" variant="body2" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          {open ? t.hide : t.details}
        </Link>
        <Collapse in={open}>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {[...texts.stats, ...texts.errors].map((line) => (
              <Typography component="li" variant="body2" key={line} sx={{ color: 'text.secondary' }}>
                {line}
              </Typography>
            ))}
          </Box>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
            {texts.note}
          </Typography>
        </Collapse>
      </Box>
      {status?.blocked && <Alert severity="warning">{t.blocked}</Alert>}
      {status && !status.blocked && (
        <Typography variant="caption" sx={{ color: status.lastError ? 'error.main' : 'text.secondary' }}>
          {status.lastError
            ? `${t.problem}: ${status.lastError}`
            : status.lastHeartbeat
              ? `${t.last}: ${time.format(status.lastHeartbeat)}`
              : t.never}
        </Typography>
      )}
      {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {preview && (
          <Button
            variant="outlined"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setShown(JSON.stringify(await preview(), null, 2));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.preview}
          </Button>
        )}
        {onForget && status?.installId && (
          <Button color="error" disabled={busy} onClick={() => setAsking(true)}>
            {t.forget}
          </Button>
        )}
      </Box>
      <Dialog open={shown !== null} onClose={() => setShown(null)} maxWidth="md" fullWidth>
        <DialogTitle>{t.previewTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t.previewText}</DialogContentText>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: 2,
              bgcolor: 'action.hover',
              overflow: 'auto',
              fontSize: 12.5,
              lineHeight: 1.55,
              maxHeight: '60vh',
            }}
          >
            {shown}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShown(null)}>{t.close}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={asking} onClose={() => setAsking(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t.forgetTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t.forgetText}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAsking(false)}>{t.cancel}</Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const done = await onForget?.();
                setMessage(done === false ? { ok: false, text: t.forgetFailed } : { ok: true, text: t.forgetDone });
              } catch {
                setMessage({ ok: false, text: t.forgetFailed });
              } finally {
                setBusy(false);
                setAsking(false);
              }
            }}
          >
            {t.confirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
