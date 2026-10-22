import { useRef, useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined';
import type { ReportReason, ReportTarget } from '../lib/types';
import { ApiError, errorMessage, sendReport } from '../lib/api';
import { GrowTransition } from './transitions';
import { c, radius } from '../theme/tokens';
import { t } from '../lib/i18n';

export const REPORT_REASONS: ReportReason[] = ['illegal', 'copyright', 'privacy', 'spam', 'abuse', 'other'];

export const reasonLabel = (reason: ReportReason) =>
  ({
    illegal: t('Rechtswidriger Inhalt'),
    copyright: t('Urheberrecht'),
    privacy: t('Persönliche Daten'),
    spam: t('Spam oder Betrug'),
    abuse: t('Belästigung oder Gewalt'),
    other: t('Etwas anderes'),
  })[reason];

const reasonHint = (reason: ReportReason) =>
  ({
    illegal: t('Strafbare oder verbotene Inhalte.'),
    copyright: t('Der Inhalt verletzt deine Rechte oder die eines anderen.'),
    privacy: t('Fotos oder Daten einer Person ohne ihr Einverständnis.'),
    spam: t('Werbung, Schadsoftware oder Täuschung.'),
    abuse: t('Beleidigungen, Drohungen oder Hetze.'),
    other: t('Beschreibe kurz, worum es geht.'),
  })[reason];

const needsMessage = (reason: ReportReason | '') => reason === 'other' || reason === 'copyright';

export function ReportForm({
  target,
  askUrl = false,
  initialUrl = '',
  onDone,
  onCancel,
}: {
  target?: ReportTarget | null;
  askUrl?: boolean;
  initialUrl?: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState('');
  const [sent, setSent] = useState(false);
  const url = useRef<HTMLInputElement>(null);
  const message = useRef<HTMLInputElement>(null);
  const contact = useRef<HTMLInputElement>(null);
  const trap = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason) {
      setError(t('Wähle einen Grund aus.'));
      setField('reason');
      return;
    }
    setBusy(true);
    setError('');
    setField('');
    try {
      await sendReport({
        ...(askUrl ? { url: url.current?.value || '' } : { kind: target?.kind, target: target?.target }),
        reason,
        message: message.current?.value || '',
        contact: contact.current?.value || '',
        website: trap.current?.value || '',
      });
      setSent(true);
    } catch (failure) {
      setError(errorMessage(failure));
      setField(failure instanceof ApiError ? failure.field : '');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 2 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: `${radius.lg}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: c.secondaryContainer,
            color: c.onSecondaryContainer,
          }}
        >
          <MarkEmailReadOutlined />
        </Box>
        <Typography variant="h6">{t('Danke für deine Meldung')}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 380 }}>
          {t('Die Admins dieser Seite sehen sich den Inhalt an. Wenn du eine Adresse angegeben hast, melden sie sich bei Rückfragen.')}
        </Typography>
        {onDone && (
          <Button variant="tonal" onClick={onDone}>
            {t('Schließen')}
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Stack spacing={2.5}>
        {askUrl && (
          <TextField
            inputRef={url}
            label={t('Adresse des Inhalts')}
            placeholder="https://…/view/…"
            defaultValue={initialUrl}
            fullWidth
            error={field === 'url'}
            slotProps={{ htmlInput: { inputMode: 'url', spellCheck: false, autoComplete: 'off' } }}
          />
        )}
        <Box>
          <Typography variant="subtitle2" component="p" id="report-reason" sx={{ mb: 0.5 }}>
            {t('Was stimmt nicht?')}
          </Typography>
          <RadioGroup aria-labelledby="report-reason" value={reason} onChange={(event) => setReason(event.target.value as ReportReason)}>
            {REPORT_REASONS.map((value) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<Radio size="small" />}
                sx={{ alignItems: 'flex-start', mx: 0, py: 0.5, '& .MuiRadio-root': { mt: -0.5 } }}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {reasonLabel(value)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {reasonHint(value)}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </RadioGroup>
        </Box>
        <TextField
          inputRef={message}
          label={needsMessage(reason) ? t('Beschreibung') : t('Beschreibung (freiwillig)')}
          multiline
          minRows={3}
          fullWidth
          error={field === 'message'}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        <TextField
          inputRef={contact}
          label={t('Deine E-Mail-Adresse (freiwillig)')}
          helperText={t('Nur für Rückfragen. Sie ist nur für die Admins sichtbar.')}
          type="email"
          fullWidth
          error={field === 'contact'}
          slotProps={{ htmlInput: { autoComplete: 'email', spellCheck: false } }}
        />
        <Box aria-hidden sx={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <input ref={trap} name="website" tabIndex={-1} autoComplete="off" />
        </Box>
        <Collapse in={!!error} unmountOnExit>
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        </Collapse>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={busy}>
              {t('Abbrechen')}
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <FlagOutlined />}
          >
            {t('Meldung senden')}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export function ReportDialog({ open, target, onClose }: { open: boolean; target: ReportTarget | null; onClose: () => void }) {
  const [key, setKey] = useState(0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      slotProps={{ transition: { onExited: () => setKey((value) => value + 1) } }}
      aria-labelledby="report-title"
    >
      <DialogTitle id="report-title">{t('Inhalt melden')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
          {t('Verstößt dieser Inhalt gegen Gesetze oder die Regeln dieser Seite? Sag den Admins Bescheid.')}
        </Typography>
        <ReportForm key={key} target={target} onDone={onClose} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}

export function ReportButton({ target, disabled = false }: { target: ReportTarget; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small"
        color="inherit"
        startIcon={<FlagOutlined fontSize="small" />}
        onClick={() => !disabled && setOpen(true)}
        sx={{ color: 'text.secondary', fontWeight: 600 }}
        className="ms-report"
      >
        {t('Melden')}
      </Button>
      <ReportDialog open={open} target={target} onClose={() => setOpen(false)} />
    </>
  );
}
