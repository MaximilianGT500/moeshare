import { useState, type FormEvent, type ReactNode } from 'react';
import { m } from 'motion/react';
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
import MailRounded from '@mui/icons-material/MailRounded';
import type { LoginBoot, SiteInfo } from '../../lib/types';
import { BrandMark } from '../../components/BrandMark';
import { PasswordField } from '../../components/PasswordField';
import { formatDate } from '../../lib/format';
import { ProviderButtons } from './ProviderButtons';
import { providerIcon } from '../../lib/providers';
import { OrDivider, postAuth, Shake } from './AuthLayout';
import { c, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const USERNAME_HINT = t('Buchstaben, Ziffern, Punkt, Unterstrich oder Bindestrich. Erscheint in deinen Datei-Links.');

function useAccountForm(url: string, extra: () => Record<string, unknown>, onSuccess: (redirect: string) => void, initialUsername = '') {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [field, setField] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setField('');
    const result = await postAuth(url, { username: username.trim(), password, ...extra() });
    if (result.ok && result.data.redirect) {
      onSuccess(result.data.redirect);
      return;
    }
    setBusy(false);
    setError(result.data.error || t('Das Konto konnte nicht angelegt werden.'));
    setField(result.data.field || '');
    setAttempt((n) => n + 1);
  };

  return { username, setUsername, password, setPassword, error, field, busy, attempt, submit, setError };
}

function Header({ site, icon, title, text }: { site: SiteInfo; icon?: ReactNode; title: string; text: string }) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
      <m.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.12, type: 'spring', stiffness: 260, damping: 18 }}
      >
        {icon ? (
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
        ) : (
          <BrandMark src={site.favicon} title={site.title} size={68} ring />
        )}
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

export function RegisterForm({ boot, onSuccess }: { boot: LoginBoot; onSuccess: (redirect: string) => void }) {
  const registration = boot.registration!;
  const { invite, oauth: pending } = registration;
  const form = useAccountForm(
    '/api/auth/register',
    () => ({ invite: invite?.code || undefined, oauth: pending?.id || undefined, remember: true }),
    onSuccess,
    pending ? pending.suggestion : ''
  );

  if (!registration.allowed) {
    return (
      <Stack spacing={3}>
        <Header
          site={boot.site}
          icon={<MailRounded />}
          title={t('Registrierung')}
          text={boot.error || t('Neue Konten gibt es auf diesem Server nur mit einer Einladung. Frag den Admin nach einem Link.')}
        />
        <Button variant="contained" size="large" href="/login" fullWidth>
          {t('Zur Anmeldung')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Header
        site={boot.site}
        title={pending ? t('Fast geschafft') : t('Konto erstellen')}
        text={
          pending
            ? t('Wähle noch deinen Benutzernamen. Er erscheint in deinen Datei-Links.')
            : t('Willkommen bei {title}.', { title: boot.site.title })
        }
      />

      {(invite || pending) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
          {pending && (
            <Chip
              icon={providerIcon(pending.provider)}
              label={`${pending.label}: ${pending.name}`}
              sx={{ bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, '& .MuiChip-icon': { color: 'inherit' } }}
            />
          )}
          {invite && (
            <Chip
              label={invite.createdBy ? t('Eingeladen von {createdBy}', { createdBy: invite.createdBy }) : t('Mit Einladung')}
              variant="outlined"
            />
          )}
          {invite && invite.role === 'admin' && (
            <Chip label={t('Admin-Rechte')} sx={{ bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer }} />
          )}
          {invite && invite.expiresAt && (
            <Chip label={t('Gültig bis {date}', { date: formatDate(new Date(invite.expiresAt)) })} variant="outlined" />
          )}
        </Box>
      )}

      <Box component="form" onSubmit={form.submit} noValidate>
        <Stack spacing={2}>
          <Shake attempt={form.attempt}>
            <Stack spacing={2}>
              <TextField
                label={t('Benutzername')}
                autoFocus
                fullWidth
                value={form.username}
                onChange={(event) => form.setUsername(event.target.value)}
                error={form.field === 'username'}
                helperText={USERNAME_HINT}
                slotProps={{ htmlInput: { autoComplete: 'username', autoCapitalize: 'off', spellCheck: false } }}
              />
              <PasswordField
                label={pending ? t('Passwort (optional)') : t('Passwort')}
                value={form.password}
                onChange={form.setPassword}
                autoComplete="new-password"
                error={form.field === 'password'}
                helperText={pending ? t('Damit kannst du dich auch ohne {label} anmelden.', { label: pending.label }) : undefined}
                strength={{ minLength: registration.passwordMinLength, username: form.username }}
              />
            </Stack>
          </Shake>
          <Collapse in={!!form.error} unmountOnExit>
            <Alert severity="error" role="alert">
              {form.error}
            </Alert>
          </Collapse>
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={form.busy}
            startIcon={form.busy ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {t('Konto erstellen')}
          </Button>
        </Stack>
      </Box>

      {!pending && registration.providers.length > 0 && (
        <Stack spacing={1.5}>
          <OrDivider />
          <ProviderButtons
            providers={registration.providers}
            verb={t('Mit {name} registrieren')}
            params={{ intent: 'signup', invite: invite ? invite.code : undefined }}
          />
        </Stack>
      )}

      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
        {t('Schon ein Konto?')}{' '}
        <Link href="/login" underline="hover">
          {t('Anmelden')}
        </Link>
      </Typography>
    </Stack>
  );
}
