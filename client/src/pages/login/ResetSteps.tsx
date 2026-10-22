import { useState, type FormEvent, type ReactNode } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LockResetRounded from '@mui/icons-material/LockResetRounded';
import MarkEmailReadRounded from '@mui/icons-material/MarkEmailReadRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import { PasswordField } from '../../components/PasswordField';
import { postAuth, Shake } from './AuthLayout';
import { c, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

function Header({ icon, title, text }: { icon: ReactNode; title: string; text: ReactNode }) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
      <m.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.08, type: 'spring', stiffness: 260, damping: 18 }}
      >
        <Box
          sx={{
            width: 68,
            height: 68,
            borderRadius: `${radius.full}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: c.primaryContainer,
            color: c.onPrimaryContainer,
            '& svg': { fontSize: 32 },
          }}
        >
          {icon}
        </Box>
      </m.div>
      <div>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {text}
        </Typography>
      </div>
    </Stack>
  );
}

export function ForgotStep({ onBack }: { onBack: () => void }) {
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
    const result = await postAuth('/api/auth/forgot', { login: login.trim() });
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
        <Header
          icon={<MarkEmailReadRounded />}
          title={t('Schau in dein Postfach')}
          text={t('Wenn zu dieser Angabe ein Konto mit bestätigter E-Mail-Adresse gehört, ist ein Link unterwegs. Er gilt eine Stunde.')}
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
      <Header
        icon={<LockResetRounded />}
        title={t('Passwort vergessen')}
        text={t('Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.')}
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

export function ResetForm({
  reset,
  canRequest,
}: {
  reset: { valid: boolean; username: string; passwordMinLength: number };
  canRequest: boolean;
}) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(!reset.valid);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < reset.passwordMinLength) {
      setError(t('Das Passwort muss mindestens {count} Zeichen lang sein.', { count: reset.passwordMinLength }));
      setAttempt((value) => value + 1);
      return;
    }
    if (password !== repeat) {
      setError(t('Die beiden Passwörter stimmen nicht überein.'));
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    setError('');
    const token = new URLSearchParams(window.location.search).get('token') || '';
    const result = await postAuth('/api/auth/reset', { token, password });
    if (result.ok && result.data.redirect) {
      window.location.assign(result.data.redirect);
      return;
    }
    setBusy(false);
    if (result.status === 410) {
      setExpired(true);
      return;
    }
    setError(result.data.error || t('Das Passwort konnte nicht gespeichert werden.'));
    setAttempt((value) => value + 1);
  };

  if (expired) {
    return (
      <Stack spacing={3}>
        <Header icon={<LinkOffRounded />} title={t('Link abgelaufen')} text={t('Dieser Link ist abgelaufen oder wurde schon benutzt.')} />
        <Stack spacing={1}>
          {canRequest && (
            <Button variant="contained" size="large" fullWidth href="/login#vergessen">
              {t('Neuen Link anfordern')}
            </Button>
          )}
          <Button variant="tonal" size="large" fullWidth href="/login">
            {t('Zur Anmeldung')}
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Header
        icon={<LockResetRounded />}
        title={t('Neues Passwort')}
        text={t('Für {username}. Danach wirst du auf allen Geräten abgemeldet.', { username: reset.username })}
      />
      <Box component="form" onSubmit={submit} noValidate>
        <Stack spacing={2}>
          <Box component="input" type="text" name="username" autoComplete="username" value={reset.username} readOnly hidden />
          <Shake attempt={attempt}>
            <Stack spacing={2}>
              <PasswordField
                label={t('Neues Passwort')}
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  if (error) setError('');
                }}
                autoComplete="new-password"
                autoFocus
                error={!!error}
                strength={{ minLength: reset.passwordMinLength, username: reset.username }}
              />
              <PasswordField
                label={t('Passwort wiederholen')}
                value={repeat}
                onChange={(value) => {
                  setRepeat(value);
                  if (error) setError('');
                }}
                autoComplete="new-password"
                error={!!error}
              />
            </Stack>
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
            {t('Passwort speichern')}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
