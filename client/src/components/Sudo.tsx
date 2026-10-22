import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import { ApiError, errorMessage, reauthPasskeyOptions, reauthWithCode, reauthWithPasskey, reauthWithPassword } from '../lib/api';
import { authUrl, providerIcon } from '../lib/providers';
import { passkeyErrorMessage, passkeySupport, startAuthentication } from '../lib/webauthn';
import { GrowTransition } from './transitions';
import { PasswordField } from './PasswordField';
import { OtpInput } from './OtpInput';
import { c } from '../theme/tokens';

import type { SudoMethods } from '../lib/types';
import { t } from '../lib/i18n';

type Runner = <T>(action: () => Promise<T>) => Promise<T>;

const SudoContext = createContext<Runner>((action) => action());

export const useSudo = () => useContext(SudoContext);

export const isCancelled = (error: unknown) => error instanceof ApiError && error.code === 'cancelled';

export function SudoProvider({ methods, children }: { methods: SudoMethods; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolver = useRef<(ok: boolean) => void>(() => {});

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    []
  );

  const run = useCallback<Runner>(
    async (action) => {
      try {
        return await action();
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'reauth_required') throw error;
        const ok = await ask();
        if (!ok) throw new ApiError('Abgebrochen.', 0, { code: 'cancelled' });
        return action();
      }
    },
    [ask]
  );

  const finish = (ok: boolean) => {
    setOpen(false);
    resolver.current(ok);
  };

  return (
    <SudoContext.Provider value={run}>
      {children}
      <ReauthDialog open={open} methods={methods} onDone={finish} />
    </SudoContext.Provider>
  );
}

function ReauthDialog({ open, methods, onDone }: { open: boolean; methods: SudoMethods; onDone: (ok: boolean) => void }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'password' | 'code'>(methods.password ? 'password' : 'code');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const support = passkeySupport(methods.passkeyOrigin);
  const canPasskey = methods.passkey && support.ok;
  const hasForm = methods.password || methods.totp;

  const reset = () => {
    setPassword('');
    setCode('');
    setError('');
    setBusy(false);
    setMode(methods.password ? 'password' : 'code');
  };

  const submit = async (event?: FormEvent, value = code) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'password') await reauthWithPassword(password);
      else await reauthWithCode(value);
      onDone(true);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  const withPasskey = async () => {
    setBusy(true);
    setError('');
    try {
      const { flowId, options } = await reauthPasskeyOptions();
      const response = await startAuthentication({ optionsJSON: options });
      await reauthWithPasskey(flowId, response);
      onDone(true);
    } catch (failure) {
      const message = failure instanceof ApiError ? failure.message : passkeyErrorMessage(failure);
      if (message) setError(message);
      setBusy(false);
    }
  };

  const next = window.location.pathname + window.location.hash;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onDone(false)}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      slotProps={{ transition: { onExited: reset } }}
      aria-labelledby="reauth-title"
      sx={{ zIndex: 1560 }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.primary, '& svg': { fontSize: 28 } }}>
        <ShieldRounded />
      </Box>
      <DialogTitle id="reauth-title" sx={{ textAlign: 'center' }}>
        {t('Bestätige, dass du es bist')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2.5 }}>
          {t('Für diese Änderung braucht es eine kurze Bestätigung. Danach hast du 10 Minuten Ruhe.')}
        </Typography>

        <Stack spacing={2}>
          {hasForm && (
            <Box component="form" onSubmit={submit} noValidate>
              {mode === 'password' ? (
                <PasswordField
                  label={t('Passwort')}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  autoFocus
                  error={!!error}
                />
              ) : (
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onComplete={(value) => submit(undefined, value)}
                  disabled={busy}
                  error={!!error}
                  autoFocus
                />
              )}
              {methods.password && methods.totp && (
                <Button size="small" sx={{ mt: 1 }} onClick={() => setMode(mode === 'password' ? 'code' : 'password')}>
                  {mode === 'password' ? t('Stattdessen Code aus der App eingeben') : t('Stattdessen Passwort eingeben')}
                </Button>
              )}
            </Box>
          )}

          <Collapse in={!!error} unmountOnExit>
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          </Collapse>

          {(canPasskey || methods.providers.length > 0) && hasForm && (
            <Divider>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('oder')}
              </Typography>
            </Divider>
          )}
          {canPasskey && (
            <Button variant="outlined" startIcon={<FingerprintRounded />} onClick={withPasskey} disabled={busy} fullWidth>
              {t('Mit Passkey bestätigen')}
            </Button>
          )}
          {methods.providers.map((provider) => (
            <Button
              key={provider.key}
              variant="outlined"
              startIcon={providerIcon(provider.key)}
              href={authUrl(provider.key, { intent: 'reauth', next })}
              disabled={busy}
              fullWidth
            >
              {t('Mit {label} bestätigen', { label: provider.label })}
            </Button>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onDone(false)} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        {hasForm && (
          <Button
            variant="contained"
            onClick={() => submit()}
            disabled={busy || (mode === 'password' ? !password : code.length !== 6)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {t('Bestätigen')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
