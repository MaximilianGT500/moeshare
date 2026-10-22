import { useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import KeyRounded from '@mui/icons-material/KeyRounded';
import { readBoot } from '../../lib/boot';
import type { SetupBoot } from '../../lib/types';
import { AuthLayout } from '../login/AuthLayout';
import { c, fonts, radius } from '../../theme/tokens';
import { SetupWizard } from './SetupWizard';
import { tokenFromInput } from './wizard';
import { t } from '../../lib/i18n';

function LockedSetup({ rejected }: { rejected: boolean }) {
  const [input, setInput] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const token = tokenFromInput(input);
    if (token) window.location.assign(`/setup?token=${encodeURIComponent(token)}`);
  };
  return (
    <Stack spacing={3}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
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
          <KeyRounded />
        </Box>
        <div>
          <Typography variant="h4" component="h1">
            {t('Einrichtungslink öffnen')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {t(
              'Beim Start zeigt MoeShare in der Konsole einen Link mit Einrichtungscode. Nur wer ihn kennt, kann das erste Admin-Konto anlegen.'
            )}
          </Typography>
        </div>
      </Stack>
      {rejected && (
        <Alert severity="error">{t('Dieser Code passt nicht. Den aktuellen Link findest du in der Konsole des Servers.')}</Alert>
      )}
      <Box component="form" onSubmit={submit} noValidate>
        <Stack spacing={2}>
          <TextField
            label={t('Link oder Code')}
            autoFocus
            fullWidth
            value={input}
            onChange={(event) => setInput(event.target.value)}
            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false, style: { fontFamily: fonts.mono } } }}
          />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={!input.trim()}>
            {t('Einrichtung starten')}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

export function SetupPage() {
  const boot = readBoot<SetupBoot>();
  if (boot.setup.token && boot.setup.settings) return <SetupWizard boot={boot} />;
  return (
    <AuthLayout site={boot.site}>
      <LockedSetup rejected={boot.setup.tokenRejected} />
    </AuthLayout>
  );
}
