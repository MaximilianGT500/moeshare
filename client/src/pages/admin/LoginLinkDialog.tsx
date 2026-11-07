import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { AdminUser, LoginLink } from '../../lib/types';
import { approveLoginLink, createLoginLink, errorMessage, ApiError, type LoginLinkResult } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { CopyTextButton } from '../../components/CopyButton';
import { GrowTransition } from '../../components/transitions';
import { UserAvatar } from '../../components/UserAvatar';
import { isCancelled, useSudo } from '../../components/Sudo';
import { c, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

export interface AccessSettings {
  passwordLogin: boolean;
  linksEnabled: boolean;
  defaultMinutes: number;
  maxMinutes: number;
  mailReady: boolean;
  baseUrl: string;
}

const AccessContext = createContext<AccessSettings>({
  passwordLogin: true,
  linksEnabled: true,
  defaultMinutes: 15,
  maxMinutes: 1440,
  mailReady: false,
  baseUrl: '',
});

export function AccessProvider({ value, children }: { value: AccessSettings; children: ReactNode }) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export const useAccess = () => useContext(AccessContext);

const PRESETS = [15, 60, 240, 1440, 10080];

export function durationLabel(minutes: number) {
  if (minutes >= 1440 && minutes % 1440 === 0) return minutes === 1440 ? t('1 Tag') : t('{count} Tage', { count: minutes / 1440 });
  if (minutes >= 60 && minutes % 60 === 0) return minutes === 60 ? t('1 Stunde') : t('{count} Stunden', { count: minutes / 60 });
  return minutes === 1 ? t('1 Minute') : t('{count} Minuten', { count: minutes });
}

function choicesFor(access: AccessSettings, current: number) {
  const values = new Set(PRESETS.filter((minutes) => minutes <= access.maxMinutes));
  values.add(Math.min(access.defaultMinutes, access.maxMinutes));
  values.add(Math.min(current, access.maxMinutes));
  return [...values].sort((a, b) => a - b);
}

export function LinkBox({ url }: { url: string }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: `${radius.md}px`,
        bgcolor: c.surfaceContainerHighest,
        fontFamily: fonts.mono,
        fontSize: '0.8125rem',
        wordBreak: 'break-all',
        userSelect: 'all',
      }}
    >
      {url}
    </Box>
  );
}

export function LinkResultDialog({
  result,
  onClose,
}: {
  result: { url: string; username: string; expiresAt: number; sent?: string | null; mailError?: string | null } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!result}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="link-result-title"
      sx={{ zIndex: 1550 }}
    >
      <DialogTitle id="link-result-title">{t('Einmal-Link für {username}', { username: result?.username })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {result?.sent && <Alert severity="success">{t('Per E-Mail an {email} verschickt.', { email: result.sent })}</Alert>}
          {result?.mailError && <Alert severity="warning">{result.mailError}</Alert>}
          {result && <LinkBox url={result.url} />}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t(
              'Gültig bis {time}. Wer den Link öffnet, ist sofort als {username} angemeldet. Gib ihn deshalb nur an diese Person weiter.',
              {
                time: formatDateTime(result ? new Date(result.expiresAt) : null),
                username: result?.username,
              }
            )}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        {result && (
          <CopyTextButton value={result.url} message={t('Einmal-Link kopiert')} icon={<ContentCopyRounded fontSize="inherit" />}>
            {t('Link kopieren')}
          </CopyTextButton>
        )}
        <Button variant="contained" onClick={onClose}>
          {t('Fertig')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type Target = Pick<AdminUser, 'id' | 'username' | 'avatar' | 'email' | 'emailVerified' | 'status' | 'role'>;

export function LoginLinkDialog({
  open,
  user,
  users,
  request,
  onClose,
  onDone,
}: {
  open: boolean;
  user?: Target | null;
  users?: Target[];
  request?: LoginLink | null;
  onClose: () => void;
  onDone: (result: LoginLinkResult, username: string) => void;
}) {
  const access = useAccess();
  const sudo = useSudo();
  const [chosen, setChosen] = useState<Target | null>(null);
  const [minutes, setMinutes] = useState(access.defaultMinutes);
  const [redirect, setRedirect] = useState('');
  const [note, setNote] = useState('');
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState('');

  useEffect(() => {
    if (!open) return;
    setChosen(user || null);
    setMinutes(Math.min(request ? request.minutes : access.defaultMinutes, access.maxMinutes));
    setRedirect('');
    setNote('');
    setEmail(Boolean(request && request.delivery === 'email'));
    setError('');
    setField('');
  }, [open, user, request, access.defaultMinutes, access.maxMinutes]);

  const target = request ? null : chosen;
  const targetName = request ? request.user.username || '' : target?.username || '';
  const canMail = access.mailReady && (request ? true : Boolean(target?.email && target.emailVerified));
  const choices = useMemo(() => choicesFor(access, minutes), [access, minutes]);

  const submit = async () => {
    if (!request && !target) {
      setError(t('Wähle zuerst ein Konto aus.'));
      setField('user');
      return;
    }
    setBusy(true);
    setError('');
    setField('');
    try {
      const result = request
        ? await sudo(() => approveLoginLink(request.id, { minutes, email: canMail && email }))
        : await sudo(() =>
            createLoginLink({
              userId: target!.id,
              minutes,
              redirect: redirect.trim() || undefined,
              note: note.trim() || undefined,
              email: canMail && email,
            })
          );
      onDone(result, targetName);
    } catch (failure) {
      if (!isCancelled(failure)) {
        setError(errorMessage(failure));
        setField(failure instanceof ApiError ? failure.field : '');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="login-link-title"
      sx={{ zIndex: 1550 }}
    >
      <DialogTitle id="login-link-title">
        {request
          ? t('Anfrage von {who} freigeben', { who: request.integration?.name || request.requestedBy || t('unbekannt') })
          : targetName
            ? t('Einmal-Link für {username}', { username: targetName })
            : t('Einmal-Link erstellen')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {request
              ? t('Nach der Freigabe kann {username} sich genau einmal mit dem Link anmelden. Die Integration ruft ihn dann selbst ab.', {
                  username: targetName,
                })
              : t('Der Link meldet das Konto genau einmal an, ganz ohne Passwort. Nach dem Öffnen oder nach Ablauf ist er verbraucht.')}
          </Typography>
          {request?.note && (
            <Alert severity="info" icon={false}>
              {request.note}
            </Alert>
          )}
          {!request && !user && (
            <Autocomplete
              options={(users || []).filter((candidate) => candidate.status === 'active')}
              value={chosen}
              onChange={(_event, next) => setChosen(next)}
              getOptionLabel={(option) => option.username}
              slotProps={{ popper: { sx: { zIndex: 1600 } } }}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderOption={({ key, ...props }, option) => (
                <Box component="li" key={key} {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <UserAvatar name={option.username} src={option.avatar} size={28} />
                  {option.username}
                  {option.role === 'admin' && (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {t('Admin')}
                    </Typography>
                  )}
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} label={t('Konto')} error={field === 'user' || field === 'userId'} autoFocus />
              )}
            />
          )}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('Gültig für')}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={minutes}
              onChange={(_event, next) => next && setMinutes(next)}
              aria-label={t('Gültig für')}
              sx={{ flexWrap: 'wrap' }}
            >
              {choices.map((value) => (
                <ToggleButton key={value} value={value}>
                  {durationLabel(value)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {field === 'minutes' && (
              <Typography variant="caption" component="p" sx={{ color: c.error, mt: 0.75 }}>
                {error}
              </Typography>
            )}
          </Box>
          {!request && (
            <>
              <TextField
                label={t('Danach öffnen (optional)')}
                value={redirect}
                onChange={(event) => setRedirect(event.target.value)}
                placeholder="/dashboard"
                error={field === 'redirect'}
                helperText={field === 'redirect' ? error : t('Eine Seite auf diesem Server. Leer lassen für das Dashboard.')}
                slotProps={{ htmlInput: { spellCheck: false, maxLength: 300, style: { fontFamily: fonts.mono } } }}
              />
              <TextField
                label={t('Notiz (optional)')}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                error={field === 'note'}
                helperText={t('Zum Beispiel der Grund. Erscheint in der Liste der Einmal-Links.')}
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
            </>
          )}
          {canMail && (
            <FormControlLabel
              control={<Checkbox checked={email} onChange={(event) => setEmail(event.target.checked)} />}
              label={
                request
                  ? t('Zusätzlich per E-Mail an {username} schicken', { username: targetName })
                  : t('Per E-Mail an {email} schicken', { email: target?.email })
              }
            />
          )}
          <Collapse in={!!error && !['minutes', 'redirect'].includes(field)} unmountOnExit>
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          </Collapse>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || (!request && !target)}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {request ? t('Freigeben') : t('Link erstellen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
