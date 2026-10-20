import { useEffect, useRef, useState, type FormEvent } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import type { LoginMethods, MfaChallenge, SiteInfo } from '../../lib/types';
import { BrandMark } from '../../components/BrandMark';
import { PasswordField } from '../../components/PasswordField';
import {
  browserSupportsWebAuthnAutofill,
  passkeyErrorMessage,
  passkeySupport,
  startAuthentication,
  WebAuthnAbortService,
} from '../../lib/webauthn';
import { OrDivider, postAuth, Shake } from './AuthLayout';
import { ProviderButtons } from './ProviderButtons';

interface Props {
  site: SiteInfo;
  methods: LoginMethods;
  next: string;
  initialError: string;
  onMfa: (challenge: MfaChallenge, remember: boolean) => void;
  onToken: () => void;
  onSuccess: (redirect: string) => void;
}

type PasskeyOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export function CredentialsStep({ site, methods, next, initialError, onMfa, onToken, onSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState<'' | 'password' | 'passkey'>('');
  const [attempt, setAttempt] = useState(0);
  const [forgot, setForgot] = useState(false);
  const support = passkeySupport(methods.passkeyOrigin);
  const passkeys = methods.passkey && support.ok;
  const conditional = useRef(false);

  const fail = (message: string) => {
    setError(message);
    setAttempt((n) => n + 1);
    setBusy('');
  };

  const verifyPasskey = async (flowId: string, response: unknown) => {
    const result = await postAuth('/api/auth/passkey', { flowId, response, remember, next });
    if (result.ok && result.data.redirect) {
      onSuccess(result.data.redirect);
      return true;
    }
    fail(result.data.error || 'Der Passkey wurde nicht akzeptiert.');
    return false;
  };

  useEffect(() => {
    if (!passkeys) return undefined;
    let cancelled = false;
    const run = async () => {
      if (!(await browserSupportsWebAuthnAutofill()) || cancelled) return;
      const options = await postAuth<{ flowId: string; options: PasskeyOptions }>('/api/auth/passkey/options', {});
      if (!options.ok || cancelled) return;
      conditional.current = true;
      try {
        const response = await startAuthentication({ optionsJSON: options.data.options, useBrowserAutofill: true });
        if (!cancelled) {
          setBusy('passkey');
          await verifyPasskey(options.data.flowId, response);
        }
      } catch {
      } finally {
        conditional.current = false;
      }
    };
    run();
    return () => {
      cancelled = true;
      if (conditional.current) WebAuthnAbortService.cancelCeremony();
    };
  }, [passkeys]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      fail('Gib Benutzername und Passwort ein.');
      return;
    }
    setBusy('password');
    setError('');
    const result = await postAuth<{ mfa?: MfaChallenge }>('/api/auth/login', { username: username.trim(), password, remember, next });
    if (result.ok && result.data.mfa) {
      setBusy('');
      onMfa(result.data.mfa, remember);
      return;
    }
    if (result.ok && result.data.redirect) {
      onSuccess(result.data.redirect);
      return;
    }
    setPassword('');
    fail(result.data.error || 'Die Anmeldung hat nicht geklappt.');
  };

  const signInWithPasskey = async () => {
    setBusy('passkey');
    setError('');
    const options = await postAuth<{ flowId: string; options: PasskeyOptions }>('/api/auth/passkey/options', {});
    if (!options.ok) {
      fail(options.data.error || 'Passkeys sind gerade nicht verfügbar.');
      return;
    }
    try {
      const response = await startAuthentication({ optionsJSON: options.data.options });
      await verifyPasskey(options.data.flowId, response);
    } catch (failure) {
      const message = passkeyErrorMessage(failure);
      if (message) fail(message);
      else setBusy('');
    }
  };

  const alternatives = passkeys || methods.providers.length > 0;

  return (
    <Stack spacing={3}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <m.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.12, type: 'spring', stiffness: 260, damping: 18 }}
        >
          <BrandMark src={site.favicon} title={site.title} size={76} ring />
        </m.div>
        <div>
          <Typography variant="h4" component="h1">
            {site.title}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Melde dich an, um deine Dateien zu verwalten.
          </Typography>
        </div>
      </Stack>

      <Box component="form" onSubmit={submit} noValidate>
        <Stack spacing={2}>
          <Shake attempt={attempt}>
            <Stack spacing={2}>
              <TextField
                label="Benutzername"
                name="username"
                fullWidth
                autoFocus
                value={username}
                error={!!error}
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (error) setError('');
                }}
                slotProps={{
                  htmlInput: { autoComplete: passkeys ? 'username webauthn' : 'username', autoCapitalize: 'off', spellCheck: false },
                }}
              />
              <PasswordField
                label="Passwort"
                name="password"
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  if (error) setError('');
                }}
                autoComplete="current-password"
                error={!!error}
              />
            </Stack>
          </Shake>

          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mt: '8px !important' }}
          >
            <FormControlLabel
              control={<Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)} />}
              label={<Typography variant="body2">Angemeldet bleiben</Typography>}
              sx={{ ml: -1 }}
            />
            <Link component="button" type="button" variant="body2" onClick={() => setForgot((v) => !v)} underline="hover">
              Passwort vergessen?
            </Link>
          </Box>
          <Collapse in={forgot} unmountOnExit>
            <Alert severity="info">
              Wende dich an einen Admin. Er setzt dein Passwort zurück, und beim nächsten Anmelden legst du ein neues fest.
            </Alert>
          </Collapse>

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
            disabled={busy !== ''}
            startIcon={busy === 'password' ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {busy === 'password' ? 'Wird geprüft' : 'Anmelden'}
          </Button>
        </Stack>
      </Box>

      {alternatives && (
        <Stack spacing={1.5}>
          <OrDivider />
          {passkeys && (
            <Button
              variant="outlined"
              size="large"
              fullWidth
              onClick={signInWithPasskey}
              disabled={busy !== ''}
              startIcon={busy === 'passkey' ? <CircularProgress size={18} color="inherit" /> : <FingerprintRounded />}
            >
              Mit Passkey anmelden
            </Button>
          )}
          <ProviderButtons
            providers={methods.providers}
            verb="Mit {name} anmelden"
            params={{ intent: 'login', remember: remember ? '1' : '0', next: next || undefined }}
            disabled={busy !== ''}
          />
        </Stack>
      )}

      {(methods.register || methods.token) && (
        <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
          {methods.register && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Noch kein Konto?{' '}
              <Link href="/register" underline="hover">
                Registrieren
              </Link>
            </Typography>
          )}
          {methods.token && (
            <Link component="button" type="button" variant="body2" onClick={onToken} underline="hover">
              Mit ShareX-Token anmelden
            </Link>
          )}
        </Stack>
      )}
    </Stack>
  );
}
