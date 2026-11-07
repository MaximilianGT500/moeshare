import { useEffect, useRef, useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoginRounded from '@mui/icons-material/LoginRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import SwitchAccountRounded from '@mui/icons-material/SwitchAccountRounded';
import ForwardToInboxRounded from '@mui/icons-material/ForwardToInboxRounded';
import MarkEmailReadRounded from '@mui/icons-material/MarkEmailReadRounded';
import type { LinkInfo, MfaChallenge } from '../../lib/types';
import { postAuth, Shake } from './AuthLayout';
import { StepHeader } from './ResetSteps';
import { t } from '../../lib/i18n';

type Phase = 'working' | 'confirm' | 'failed';

export function LinkStep({
  link,
  canRequest,
  onMfa,
  onSuccess,
}: {
  link: LinkInfo;
  canRequest: boolean;
  onMfa: (challenge: MfaChallenge) => void;
  onSuccess: (redirect: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>(() => (!link.valid ? 'failed' : link.current ? 'confirm' : 'working'));
  const [reason, setReason] = useState(link.valid ? '' : link.reason);
  const started = useRef(false);

  const signIn = async () => {
    if (!link.valid || started.current) return;
    started.current = true;
    setPhase('working');
    const result = await postAuth<{ mfa?: MfaChallenge }>('/api/auth/link', { token: link.token, remember: true });
    if (result.ok) window.history.replaceState(null, '', '/login');
    if (result.ok && result.data.mfa) {
      onMfa(result.data.mfa);
      return;
    }
    if (result.ok && result.data.redirect) {
      onSuccess(result.data.redirect);
      return;
    }
    setReason(result.data.error || t('Die Anmeldung hat nicht geklappt.'));
    setPhase('failed');
  };

  useEffect(() => {
    if (!link.valid) return;
    if (link.same) {
      onSuccess('/dashboard');
      return;
    }
    if (!link.current) signIn();
  }, []);

  if (phase === 'failed') {
    return (
      <Stack spacing={3}>
        <StepHeader icon={<LinkOffRounded />} title={t('Link nicht mehr gültig')} text={reason} />
        <Stack spacing={1}>
          {canRequest && (
            <Button variant="contained" size="large" fullWidth href="/login#link">
              {t('Neuen Link per E-Mail anfordern')}
            </Button>
          )}
          <Button variant={canRequest ? 'tonal' : 'contained'} size="large" fullWidth href="/login">
            {t('Zur Anmeldung')}
          </Button>
        </Stack>
      </Stack>
    );
  }

  if (phase === 'confirm' && link.valid) {
    return (
      <Stack spacing={3}>
        <StepHeader
          icon={<SwitchAccountRounded />}
          title={t('Konto wechseln?')}
          text={t('Du bist gerade als {current} angemeldet. Dieser Link meldet dich als {username} an.', {
            current: link.current,
            username: link.username,
          })}
        />
        <Stack spacing={1}>
          <Button variant="contained" size="large" fullWidth onClick={signIn} startIcon={<LoginRounded />}>
            {t('Als {username} anmelden', { username: link.username })}
          </Button>
          <Button variant="tonal" size="large" fullWidth href="/dashboard">
            {t('Als {current} weitermachen', { current: link.current })}
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} aria-live="polite">
      <StepHeader
        icon={<LoginRounded />}
        title={t('Du wirst angemeldet')}
        text={link.valid ? t('Als {username}, einen Moment.', { username: link.username }) : ''}
      />
      <LinearProgress aria-label={t('Anmeldung läuft')} sx={{ borderRadius: 999 }} />
    </Stack>
  );
}

export function EmailLinkStep({ onBack }: { onBack: () => void }) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!login.trim()) {
      setError(t('Gib deinen Benutzernamen oder deine E-Mail-Adresse ein.'));
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    setError('');
    const result = await postAuth('/api/auth/link/request', { login: login.trim() });
    setBusy(false);
    if (result.ok) {
      setSent(true);
      return;
    }
    setError(result.data.error || t('Das hat nicht geklappt.'));
    setAttempt((value) => value + 1);
  };

  if (sent) {
    return (
      <Stack spacing={3}>
        <StepHeader
          icon={<MarkEmailReadRounded />}
          title={t('Schau in dein Postfach')}
          text={t(
            'Wenn zu dieser Angabe ein Konto mit bestätigter E-Mail-Adresse gehört, ist ein Link unterwegs. Er funktioniert genau einmal.'
          )}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          {t('Keine E-Mail bekommen? Prüfe den Spam-Ordner oder wende dich an einen Admin.')}
        </Typography>
        <Button variant="tonal" size="large" fullWidth onClick={onBack}>
          {t('Zurück zur Anmeldung')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <StepHeader
        icon={<ForwardToInboxRounded />}
        title={t('Link per E-Mail')}
        text={t('Wir schicken dir einen Link, mit dem du dich einmal ohne Passwort anmeldest.')}
      />
      <Box component="form" onSubmit={submit} noValidate>
        <Stack spacing={2}>
          <Shake attempt={attempt}>
            <TextField
              label={t('Benutzername oder E-Mail-Adresse')}
              fullWidth
              autoFocus
              value={login}
              error={!!error}
              onChange={(event) => {
                setLogin(event.target.value);
                if (error) setError('');
              }}
              slotProps={{ htmlInput: { autoComplete: 'username', autoCapitalize: 'off', spellCheck: false } }}
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
            {t('Link senden')}
          </Button>
        </Stack>
      </Box>
      <Box sx={{ textAlign: 'center' }}>
        <Link component="button" type="button" variant="body2" onClick={onBack} underline="hover">
          {t('Zurück zur Anmeldung')}
        </Link>
      </Box>
    </Stack>
  );
}
