import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ForwardToInboxRounded from '@mui/icons-material/ForwardToInboxRounded';
import { ApiError, emailAlbum, emailFile, errorMessage } from '../lib/api';
import { t, tn } from '../lib/i18n';
import { useToast } from './Toaster';
import { GrowTransition } from './transitions';
import { c } from '../theme/tokens';

export interface EmailTarget {
  kind: 'file' | 'album';
  id: number;
  name: string;
}

const MAX_RECIPIENTS = 5;
const MAX_MESSAGE = 500;
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const split = (raw: string) =>
  raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

export function EmailShareDialog({ target, onClose, zIndex }: { target: EmailTarget | null; onClose: () => void; zIndex?: number }) {
  const toast = useToast();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setRecipients([]);
    setInput('');
    setMessage('');
    setFieldError(null);
    setError('');
  }, [target]);

  const add = (raw: string) => {
    const next = [...recipients];
    for (const part of split(raw)) if (!next.some((entry) => entry.toLowerCase() === part.toLowerCase())) next.push(part);
    setRecipients(next.slice(0, MAX_RECIPIENTS));
    setInput('');
    if (fieldError?.field === 'to') setFieldError(null);
  };

  const pending = split(input);
  const all = [...recipients, ...pending].slice(0, MAX_RECIPIENTS + 1);
  const invalid = all.filter((entry) => !ADDRESS.test(entry));
  const tooMany = recipients.length + pending.length > MAX_RECIPIENTS;

  const send = async () => {
    if (!target) return;
    const to = [...recipients, ...pending];
    setBusy(true);
    setFieldError(null);
    setError('');
    try {
      const data = { to, message: message.trim() || undefined };
      const result = target.kind === 'file' ? await emailFile(target.id, data) : await emailAlbum(target.id, data);
      toast(tn(result.sent, 'E-Mail an 1 Person verschickt', 'E-Mail an {count} Personen verschickt'), { variant: 'success' });
      onClose();
    } catch (failure) {
      if (failure instanceof ApiError && failure.field) setFieldError({ field: failure.field, message: failure.message });
      else setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const toError =
    fieldError?.field === 'to'
      ? fieldError.message
      : tooMany
        ? t('Höchstens {count} Empfänger.', { count: MAX_RECIPIENTS })
        : invalid.length && !input.trim()
          ? t('„{address}“ ist keine E-Mail-Adresse.', { address: invalid[0] })
          : '';

  return (
    <Dialog
      open={!!target}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="email-share-title"
      sx={zIndex ? { zIndex } : undefined}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <ForwardToInboxRounded sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="email-share-title" sx={{ textAlign: 'center' }}>
        {target?.kind === 'album' ? t('Album per E-Mail senden') : t('Per E-Mail senden')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2.5, overflowWrap: 'anywhere' }}>
          {target?.name}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Autocomplete
            multiple
            freeSolo
            options={[]}
            value={recipients}
            inputValue={input}
            onInputChange={(_event, next, reason) => {
              if (reason === 'reset') return;
              if (/[,;\s]$/.test(next)) add(next);
              else setInput(next);
            }}
            onChange={(_event, next) => {
              setRecipients(next.map(String).slice(0, MAX_RECIPIENTS));
              if (fieldError?.field === 'to') setFieldError(null);
            }}
            onBlur={() => input.trim() && add(input)}
            renderValue={(values, getItemProps) =>
              values.map((value, index) => {
                const { key, ...rest } = getItemProps({ index });
                return (
                  <Chip
                    key={key}
                    label={value}
                    size="small"
                    color={ADDRESS.test(value) ? 'default' : 'error'}
                    variant={ADDRESS.test(value) ? 'filled' : 'outlined'}
                    {...rest}
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                autoFocus
                label={t('An')}
                placeholder={recipients.length ? '' : t('name@example.org')}
                error={Boolean(toError)}
                helperText={toError || t('Bis zu {count} Adressen, getrennt mit Komma oder Leerzeichen.', { count: MAX_RECIPIENTS })}
                slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, inputMode: 'email', autoComplete: 'email' } }}
              />
            )}
          />
          <TextField
            label={t('Nachricht (optional)')}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            multiline
            minRows={3}
            maxRows={8}
            error={fieldError?.field === 'message'}
            helperText={
              fieldError?.field === 'message'
                ? fieldError.message
                : t('{count} von {max} Zeichen', { count: message.length, max: MAX_MESSAGE })
            }
            slotProps={{ htmlInput: { maxLength: MAX_MESSAGE } }}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t(
              'Die E-Mail kommt von dieser Seite und enthält deinen Namen, deine Nachricht und den Link. Hast du eine bestätigte E-Mail-Adresse, gehen Antworten direkt an dich.'
            )}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={send}
          disabled={busy || !all.length || invalid.length > 0 || tooMany}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ForwardToInboxRounded />}
        >
          {t('Senden')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
