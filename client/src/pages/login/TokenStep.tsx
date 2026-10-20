import { useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentPasteRounded from '@mui/icons-material/ContentPasteRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import TokenRounded from '@mui/icons-material/TokenRounded';
import type { MfaChallenge } from '../../lib/types';
import { canReadClipboard } from '../../lib/clipboard';
import { postAuth, Shake } from './AuthLayout';
import { c, fonts, radius } from '../../theme/tokens';

export function TokenStep({
  next,
  onBack,
  onMfa,
  onSuccess,
}: {
  next: string;
  onBack: () => void;
  onMfa: (challenge: MfaChallenge, remember: boolean) => void;
  onSuccess: (redirect: string) => void;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) {
      setError('Füge zuerst dein Token ein.');
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    setError('');
    const result = await postAuth<{ mfa?: MfaChallenge }>('/api/auth/login/token', { token: token.trim(), remember: true, next });
    if (result.ok && result.data.mfa) return onMfa(result.data.mfa, true);
    if (result.ok && result.data.redirect) return onSuccess(result.data.redirect);
    setBusy(false);
    setError(result.data.error || 'Dieses Token ist ungültig.');
    setAttempt((n) => n + 1);
    return undefined;
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setToken(text);
    } catch {
      setError('Der Zugriff auf die Zwischenablage wurde nicht erlaubt. Füge das Token mit Strg+V ein.');
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: `${radius.full}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: c.secondaryContainer,
            color: c.onSecondaryContainer,
            '& svg': { fontSize: 30 },
          }}
        >
          <TokenRounded />
        </Box>
        <div>
          <Typography variant="h5" component="h1">
            Mit Token anmelden
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Das Token steht in deiner ShareX-Konfiguration im Header „Authorization“. Lege danach unter Konto ein Passwort fest.
          </Typography>
        </div>
      </Stack>
      <Box component="form" onSubmit={submit} noValidate>
        <Stack spacing={2}>
          <Shake attempt={attempt}>
            <TextField
              label="Token"
              fullWidth
              autoFocus
              type="password"
              value={token}
              error={!!error}
              onChange={(event) => {
                setToken(event.target.value);
                if (error) setError('');
              }}
              slotProps={{
                htmlInput: { autoComplete: 'off', spellCheck: false, autoCapitalize: 'off' },
                input: {
                  sx: { fontFamily: fonts.mono, fontSize: '0.9rem' },
                  endAdornment: canReadClipboard() ? (
                    <InputAdornment position="end">
                      <Tooltip title="Aus Zwischenablage einfügen">
                        <IconButton aria-label="Aus Zwischenablage einfügen" onClick={paste} edge="end" size="small">
                          <ContentPasteRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
          </Shake>
          <Collapse in={!!error} unmountOnExit>
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          </Collapse>
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={busy}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {busy ? 'Wird geprüft' : 'Anmelden'}
          </Button>
        </Stack>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Button size="small" startIcon={<ArrowBackRounded />} onClick={onBack} sx={{ color: 'text.secondary' }}>
          Zurück zur Anmeldung
        </Button>
      </Box>
    </Stack>
  );
}
