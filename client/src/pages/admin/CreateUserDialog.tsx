import { useEffect, useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { AdminUser } from '../../lib/types';
import { createUser, errorMessage, ApiError } from '../../lib/api';
import { BytesField } from '../../components/Fields';
import { PasswordField } from '../../components/PasswordField';
import { CopyTextButton } from '../../components/CopyButton';
import { GrowTransition, SlideUpTransition } from '../../components/transitions';
import { isCancelled, useSudo } from '../../components/Sudo';
import { c, fonts, radius } from '../../theme/tokens';

export function CredentialsDialog({
  data,
  onClose,
  baseUrl,
  title = 'Zugang erstellt',
}: {
  data: { username: string; password: string } | null;
  onClose: () => void;
  baseUrl: string;
  title?: string;
}) {
  const text = data ? `Adresse: ${baseUrl}/login\nBenutzername: ${data.username}\nVorläufiges Passwort: ${data.password}` : '';
  return (
    <Dialog open={!!data} onClose={onClose} maxWidth="xs" fullWidth slots={{ transition: GrowTransition }} aria-labelledby="cred-title">
      <DialogTitle id="cred-title">{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Gib diese Daten auf sicherem Weg weiter. Beim ersten Anmelden legt {data?.username} ein eigenes Passwort fest.
        </Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: `${radius.md}px`,
            bgcolor: c.surfaceContainerHighest,
            fontFamily: fonts.mono,
            fontSize: '0.875rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {text}
        </Box>
      </DialogContent>
      <DialogActions>
        <CopyTextButton value={text} message="Zugangsdaten kopiert" icon={<ContentCopyRounded fontSize="inherit" />}>
          Kopieren
        </CopyTextButton>
        <Button variant="contained" onClick={onClose}>
          Fertig
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CreateUserDialog({
  open,
  onClose,
  onCreated,
  minPasswordLength,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: AdminUser, password: string | null) => void;
  minPasswordLength: number;
  defaults: { quotaBytes: number | null; maxFileBytes: number | null };
}) {
  const sudo = useSudo();
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'mitglied' | 'admin'>('mitglied');
  const [quota, setQuota] = useState<number | null>(null);
  const [maxFile, setMaxFile] = useState<number | null>(null);
  const [mustChange, setMustChange] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState('');

  useEffect(() => {
    if (!open) return;
    setUsername('');
    setPassword('');
    setRole('mitglied');
    setQuota(null);
    setMaxFile(null);
    setMustChange(true);
    setError('');
    setField('');
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setField('');
    try {
      const result = await sudo(() =>
        createUser({
          username: username.trim(),
          password: password || undefined,
          role,
          quotaBytes: quota,
          maxFileBytes: maxFile,
          mustChangePassword: mustChange,
        })
      );
      onCreated(result.user, result.password ?? (password || null));
    } catch (failure) {
      if (!isCancelled(failure)) {
        setError(errorMessage(failure));
        setField(failure instanceof ApiError ? failure.field : '');
      }
    } finally {
      setBusy(false);
    }
  };

  const limitHint = (value: number | null) => (value ? '' : 'Leer: Standard des Servers');

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullScreen={phone}
      maxWidth="sm"
      fullWidth
      slots={{ transition: phone ? SlideUpTransition : GrowTransition }}
      aria-labelledby="create-user-title"
    >
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'contents' }}>
        <DialogTitle id="create-user-title">Benutzer anlegen</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Benutzername"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
              fullWidth
              error={field === 'username'}
              helperText="2 bis 32 Zeichen: Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich"
              slotProps={{ htmlInput: { autoComplete: 'off', autoCapitalize: 'off', spellCheck: false } }}
            />
            <PasswordField
              label="Passwort (optional)"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              error={field === 'password'}
              helperText={password ? undefined : 'Leer lassen, dann erzeugt MoeShare ein sicheres Passwort.'}
              strength={password ? { minLength: minPasswordLength, username } : undefined}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Rolle
              </Typography>
              <ToggleButtonGroup exclusive value={role} onChange={(_event, next) => next && setRole(next)} aria-label="Rolle">
                <ToggleButton value="mitglied">Mitglied</ToggleButton>
                <ToggleButton value="admin">Admin</ToggleButton>
              </ToggleButtonGroup>
              {role === 'admin' && (
                <Typography variant="caption" component="p" sx={{ color: c.warning, mt: 1 }}>
                  Admins sehen alle Dateien und können Einstellungen und Benutzer ändern.
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Speicherlimit
                </Typography>
                <BytesField
                  label="Speicher"
                  value={quota}
                  onChange={setQuota}
                  nullLabel={defaults.quotaBytes ? 'Standard' : 'Standard (unbegrenzt)'}
                  helperText={limitHint(quota)}
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Größte erlaubte Datei
                </Typography>
                <BytesField
                  label="Dateigröße"
                  value={maxFile}
                  onChange={setMaxFile}
                  nullLabel={defaults.maxFileBytes ? 'Standard' : 'Standard (unbegrenzt)'}
                  helperText={limitHint(maxFile)}
                />
              </Box>
            </Box>
            <FormControlLabel
              control={<Switch checked={mustChange} onChange={(event) => setMustChange(event.target.checked)} />}
              label="Beim ersten Anmelden eigenes Passwort festlegen"
            />
            <Collapse in={!!error} unmountOnExit>
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            </Collapse>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || username.trim().length < 2}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Anlegen
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
