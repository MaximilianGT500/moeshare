import { useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import type { MfaChallenge } from '../../lib/types';
import { OtpInput } from '../../components/OtpInput';
import { UserAvatar } from '../../components/UserAvatar';
import { passkeyErrorMessage, passkeySupport, startAuthentication } from '../../lib/webauthn';
import { postAuth, Shake } from './AuthLayout';
import { c, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

interface Props {
  challenge: MfaChallenge;
  passkeyOrigin: string;
  onBack: () => void;
  onSuccess: (redirect: string) => void;
  onExpired: (message: string) => void;
}

type PasskeyOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export function SecondFactorStep({ challenge, passkeyOrigin, onBack, onSuccess, onExpired }: Props) {
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'code' | 'passkey'>('');
  const [attempt, setAttempt] = useState(0);
  const passkeys = challenge.methods.includes('passkey') && passkeySupport(passkeyOrigin).ok;

  const fail = (message: string) => {
    setError(message);
    setAttempt((n) => n + 1);
    setBusy('');
  };

  const verify = async (value: string) => {
    setBusy('code');
    setError('');
    const result = await postAuth<{ code?: string }>('/api/auth/mfa', { ticket: challenge.ticket, code: value });
    if (result.ok && result.data.redirect) {
      onSuccess(result.data.redirect);
      return;
    }
    if (result.status === 410) {
      onExpired(result.data.error || t('Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.'));
      return;
    }
    setCode('');
    fail(result.data.error || t('Der Code stimmt nicht.'));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'code' && code.length === 6) verify(code);
    if (mode === 'recovery' && recovery.trim()) verify(recovery.trim());
  };

  const withPasskey = async () => {
    setBusy('passkey');
    setError('');
    const options = await postAuth<{ flowId: string; options: PasskeyOptions }>('/api/auth/mfa/passkey/options', {
      ticket: challenge.ticket,
    });
    if (!options.ok) {
      if (options.status === 410) onExpired(options.data.error || t('Die Anmeldung ist abgelaufen.'));
      else fail(options.data.error || t('Passkeys sind gerade nicht verfügbar.'));
      return;
    }
    try {
      const response = await startAuthentication({ optionsJSON: options.data.options });
      const result = await postAuth('/api/auth/mfa/passkey', { ticket: challenge.ticket, flowId: options.data.flowId, response });
      if (result.ok && result.data.redirect) onSuccess(result.data.redirect);
      else fail(result.data.error || t('Der Passkey wurde nicht akzeptiert.'));
    } catch (failure) {
      const message = passkeyErrorMessage(failure);
      if (message) fail(message);
      else setBusy('');
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
            bgcolor: c.primaryContainer,
            color: c.onPrimaryContainer,
            '& svg': { fontSize: 30 },
          }}
        >
          <PhonelinkLockRounded />
        </Box>
        <div>
          <Typography variant="h5" component="h1">
            {t('Bestätige die Anmeldung')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {mode === 'code'
              ? t('Gib den 6-stelligen Code aus deiner Authenticator-App ein.')
              : t('Gib einen deiner Wiederherstellungscodes ein. Jeder Code funktioniert nur einmal.')}
          </Typography>
        </div>
        {challenge.username && (
          <Chip avatar={<UserAvatar name={challenge.username} size={24} />} label={challenge.username} variant="outlined" />
        )}
      </Stack>

      <Box component="form" onSubmit={submit} noValidate>
        <Stack spacing={2}>
          <Shake attempt={attempt}>
            {mode === 'code' ? (
              <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={busy !== ''} error={!!error} autoFocus />
            ) : (
              <TextField
                label={t('Wiederherstellungscode')}
                fullWidth
                autoFocus
                value={recovery}
                error={!!error}
                placeholder="abcde-fghij"
                onChange={(event) => setRecovery(event.target.value)}
                slotProps={{
                  htmlInput: {
                    autoComplete: 'off',
                    spellCheck: false,
                    autoCapitalize: 'off',
                    style: { fontFamily: fonts.mono, letterSpacing: '0.06em' },
                  },
                }}
              />
            )}
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
            disabled={busy !== '' || (mode === 'code' ? code.length !== 6 : !recovery.trim())}
            startIcon={busy === 'code' ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {busy === 'code' ? t('Wird geprüft') : t('Bestätigen')}
          </Button>
          {passkeys && (
            <Button
              variant="outlined"
              size="large"
              fullWidth
              onClick={withPasskey}
              disabled={busy !== ''}
              startIcon={busy === 'passkey' ? <CircularProgress size={18} color="inherit" /> : <FingerprintRounded />}
            >
              {t('Stattdessen Passkey verwenden')}
            </Button>
          )}
        </Stack>
      </Box>

      <Stack spacing={1} sx={{ alignItems: 'center' }}>
        <Link
          component="button"
          type="button"
          variant="body2"
          underline="hover"
          onClick={() => {
            setMode(mode === 'code' ? 'recovery' : 'code');
            setError('');
          }}
        >
          {mode === 'code' ? t('Kein Zugriff auf die App? Wiederherstellungscode verwenden') : t('Code aus der App eingeben')}
        </Link>
        <Button size="small" startIcon={<ArrowBackRounded />} onClick={onBack} sx={{ color: 'text.secondary' }}>
          {t('Zurück zur Anmeldung')}
        </Button>
      </Stack>
    </Stack>
  );
}
