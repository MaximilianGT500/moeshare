import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PasswordRounded from '@mui/icons-material/PasswordRounded';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import TokenRounded from '@mui/icons-material/TokenRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import type { AdminUser } from '../../lib/types';
import { providerIcon, providerLabel } from '../../lib/providers';
import {
  createUserToken,
  deleteUserById,
  errorMessage,
  fetchUserDetail,
  removeUserPasskeys,
  resetUserMfa,
  resetUserPassword,
  revokeUserSessions,
  revokeUserToken,
  unlinkUserIdentity,
  updateUser,
  type UserDetail,
} from '../../lib/api';
import { formatBytes, formatDate, formatNumber, relativeMs } from '../../lib/format';
import { SideSheet } from '../../components/SideSheet';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { BytesField } from '../../components/Fields';
import { QuotaMeter } from '../../components/QuotaMeter';
import { ActivityList } from '../../components/ActivityList';
import { UserAvatar } from '../../components/UserAvatar';
import { TokenNameDialog, TokenRevealDialog } from '../../components/TokenReveal';
import { GrowTransition } from '../../components/transitions';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { SessionRow } from '../account/SessionsPanel';
import { CredentialsDialog } from './CreateUserDialog';
import { RoleChip, StatusChip } from './userBits';
import { fonts } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

function SuspendDialog({ user, onClose, onConfirm }: { user: AdminUser | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [user]);
  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="suspend-title"
      sx={{ zIndex: 1550 }}
    >
      <DialogTitle id="suspend-title">{user?.username} sperren?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('{username} wird sofort abgemeldet und kann weder hochladen noch sich anmelden. Geteilte Links bleiben erreichbar.', {
            username: user?.username,
          })}
        </Typography>
        <TextField
          label={t('Grund (optional)')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          fullWidth
          helperText={t('Wird beim Anmeldeversuch angezeigt.')}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Abbrechen')}</Button>
        <Button variant="contained" color="error" onClick={() => onConfirm(reason.trim())}>
          {t('Sperren')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PasswordResetDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onDone: (password: string | null) => void;
}) {
  const sudo = useSudo();
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPassword('');
    setMustChange(true);
    setError('');
  }, [user]);
  const submit = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const result = await sudo(() => resetUserPassword(user.id, password, mustChange));
      onDone(result.password ?? (password || null));
    } catch (failure) {
      if (!isCancelled(failure)) setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={!!user}
      onClose={() => !busy && onClose()}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="reset-pw-title"
      sx={{ zIndex: 1550 }}
    >
      <DialogTitle id="reset-pw-title">{t('Passwort zurücksetzen')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('{username} wird auf allen Geräten abgemeldet. ShareX-Tokens bleiben gültig.', { username: user?.username })}
        </Typography>
        <Stack spacing={2}>
          <TextField
            label={t('Neues Passwort (optional)')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            fullWidth
            helperText={t('Leer lassen, dann erzeugt MoeShare eins.')}
            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false, style: { fontFamily: fonts.mono } } }}
          />
          <FormControlLabel
            control={<Switch checked={mustChange} onChange={(event) => setMustChange(event.target.checked)} />}
            label={t('Beim nächsten Anmelden ändern lassen')}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {t('Zurücksetzen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function UserSheet({
  userId,
  currentUser,
  onClose,
  onChanged,
  defaults,
  baseUrl,
  siteTitle,
}: {
  userId: number | null;
  currentUser: string;
  onClose: () => void;
  onChanged: (user: AdminUser | null) => void;
  defaults: { quotaBytes: number | null; maxFileBytes: number | null };
  baseUrl: string;
  siteTitle: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [quota, setQuota] = useState<number | null>(null);
  const [maxFile, setMaxFile] = useState<number | null>(null);
  const [suspending, setSuspending] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [naming, setNaming] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (id: number) => {
      try {
        const next = await fetchUserDetail(id);
        setDetail(next);
        setQuota(next.user.quotaBytes);
        setMaxFile(next.user.maxFileBytes);
        onChanged(next.user);
      } catch (failure) {
        toast(errorMessage(failure), { variant: 'error' });
      }
    },
    [onChanged, toast]
  );

  useEffect(() => {
    setDetail(null);
    if (userId) load(userId);
  }, [userId]);

  const user = detail?.user;
  const self = user?.username === currentUser;

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (!user) return;
    try {
      await sudo(action);
      toast(success, { variant: 'success' });
      await load(user.id);
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const setRole = async (role: 'admin' | 'mitglied') => {
    if (!user || role === user.role) return;
    const ok = await confirm({
      title:
        role === 'admin'
          ? t('{username} zum Admin machen?', { username: user.username })
          : t('{username} die Admin-Rechte nehmen?', { username: user.username }),
      message:
        role === 'admin'
          ? t('Admins sehen alle Dateien und können Benutzer und Einstellungen ändern.')
          : t('{username} wird zum Mitglied und verliert den Zugriff auf diesen Bereich.', { username: user.username }),
      confirmLabel: role === 'admin' ? t('Zum Admin machen') : t('Rechte entziehen'),
      destructive: role !== 'admin',
    });
    if (ok)
      run(
        () => updateUser(user.id, { role }),
        role === 'admin'
          ? t('{username} ist jetzt Admin', { username: user.username })
          : t('{username} ist jetzt Mitglied', { username: user.username })
      );
  };

  const saveLimits = async () => {
    if (!user) return;
    setSaving(true);
    await run(() => updateUser(user.id, { quotaBytes: quota, maxFileBytes: maxFile }), t('Limits gespeichert'));
    setSaving(false);
  };

  const remove = async () => {
    if (!user) return;
    const ok = await confirm({
      title: t('{username} löschen?', { username: user.username }),
      message: t(
        'Das Konto und alle {files} Dateien ({storageBytes}) werden endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.',
        { files: formatNumber(user.files), storageBytes: formatBytes(user.storageBytes) }
      ),
      confirmLabel: t('Endgültig löschen'),
    });
    if (!ok) return;
    try {
      await sudo(() => deleteUserById(user.id));
      toast(t('{username} wurde gelöscht', { username: user.username }), { variant: 'success' });
      onChanged(null);
      onClose();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const limitsDirty = user && (quota !== user.quotaBytes || maxFile !== user.maxFileBytes);

  return (
    <>
      <SideSheet
        open={userId !== null}
        onClose={onClose}
        leading={user ? <UserAvatar name={user.username} size={48} /> : <Skeleton variant="circular" width={48} height={48} />}
        title={user ? user.username : <Skeleton width={140} />}
        subtitle={
          user ? (
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
              <RoleChip role={user.role} />
              <StatusChip user={user} />
              {self && <Typography variant="caption">{t('Das bist du')}</Typography>}
            </Box>
          ) : null
        }
      >
        {!detail || !user ? (
          <Stack spacing={2} sx={{ pt: 2 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))}
          </Stack>
        ) : (
          <Stack spacing={3.5} sx={{ pt: 1 }}>
            {user.status === 'suspended' && (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() =>
                      run(() => updateUser(user.id, { status: 'active' }), t('{username} ist entsperrt', { username: user.username }))
                    }
                  >
                    {t('Entsperren')}
                  </Button>
                }
              >
                {t('Gesperrt')}
                {user.suspendedReason ? `: ${user.suspendedReason}` : ''}
              </Alert>
            )}

            <SettingsSection title={t('Überblick')}>
              <SettingRow label={t('Speicher')} stacked>
                <QuotaMeter usedBytes={user.storageBytes} quotaBytes={user.effectiveQuotaBytes} />
              </SettingRow>
              <SettingRow
                label={t('Konto')}
                description={
                  user.createdAt
                    ? t('{files} Dateien, {views} Aufrufe. Angelegt am {date}, zuletzt angemeldet {when}.', {
                        files: formatNumber(user.files),
                        views: formatNumber(user.views),
                        date: formatDate(new Date(user.createdAt)),
                        when: relativeMs(user.lastLoginAt),
                      })
                    : t('{files} Dateien, {views} Aufrufe. Aus der alten Version übernommen, zuletzt angemeldet {when}.', {
                        files: formatNumber(user.files),
                        views: formatNumber(user.views),
                        when: relativeMs(user.lastLoginAt),
                      })
                }
              />
              <SettingRow
                label={t('E-Mail')}
                description={
                  user.email
                    ? user.emailVerified
                      ? t('{email}, bestätigt', { email: user.email })
                      : t('{email}, noch nicht bestätigt', { email: user.email })
                    : t('Keine Adresse hinterlegt')
                }
              />
              {user.domains > 0 && (
                <SettingRow
                  label={t('Eigene Domains')}
                  description={tn(user.domains, '1 bestätigte Domain', '{count} bestätigte Domains')}
                />
              )}
            </SettingsSection>

            <SettingsSection title={t('Rolle und Zugang')}>
              <SettingRow label={t('Rolle')} description={self ? t('Deine eigene Rolle kannst du nicht ändern.') : undefined}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={user.role}
                  onChange={(_event, next) => next && setRole(next)}
                  disabled={self}
                  aria-label={t('Rolle')}
                >
                  <ToggleButton value="mitglied">{t('Mitglied')}</ToggleButton>
                  <ToggleButton value="admin">{t('Admin')}</ToggleButton>
                </ToggleButtonGroup>
              </SettingRow>
              <SettingRow
                icon={<BlockRounded />}
                label={t('Konto sperren')}
                description={t('Meldet sofort ab und blockiert Anmeldung und Uploads.')}
              >
                {user.status === 'suspended' ? (
                  <Button
                    variant="tonal"
                    onClick={() =>
                      run(() => updateUser(user.id, { status: 'active' }), t('{username} ist entsperrt', { username: user.username }))
                    }
                  >
                    {t('Entsperren')}
                  </Button>
                ) : (
                  <Button variant="outlined" color="error" disabled={self} onClick={() => setSuspending(user)}>
                    {t('Sperren')}
                  </Button>
                )}
              </SettingRow>
            </SettingsSection>

            <SettingsSection title={t('Limits')} description={t('Leer bedeutet: es gilt der Standard aus den Einstellungen.')}>
              <SettingRow
                label={t('Speicherlimit')}
                description={t('Standard: {value}', { value: defaults.quotaBytes ? formatBytes(defaults.quotaBytes) : 'unbegrenzt' })}
                stacked
              >
                <BytesField label={t('Speicher')} value={quota} onChange={setQuota} nullLabel={t('Standard')} />
              </SettingRow>
              <SettingRow
                label={t('Größte erlaubte Datei')}
                description={t('Standard: {value}', { value: defaults.maxFileBytes ? formatBytes(defaults.maxFileBytes) : 'unbegrenzt' })}
                stacked
              >
                <BytesField label={t('Dateigröße')} value={maxFile} onChange={setMaxFile} nullLabel={t('Standard')} />
              </SettingRow>
              {limitsDirty && (
                <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button
                    onClick={() => {
                      setQuota(user.quotaBytes);
                      setMaxFile(user.maxFileBytes);
                    }}
                  >
                    {t('Verwerfen')}
                  </Button>
                  <Button variant="contained" onClick={saveLimits} disabled={saving}>
                    {t('Limits speichern')}
                  </Button>
                </Box>
              )}
            </SettingsSection>

            <SettingsSection title={t('Anmeldung')}>
              <SettingRow
                icon={<PasswordRounded />}
                label={t('Passwort')}
                description={
                  user.hasPassword
                    ? user.mustChangePassword
                      ? t('Vorläufig, wird beim nächsten Anmelden geändert.')
                      : 'Gesetzt.'
                    : t('Kein Passwort (meldet sich über einen Dienst oder einen Passkey an).')
                }
              >
                <Button variant="tonal" onClick={() => setResetting(user)}>
                  {t('Zurücksetzen')}
                </Button>
              </SettingRow>
              <SettingRow
                icon={<PhonelinkLockRounded />}
                label={t('Zwei-Faktor-Anmeldung')}
                description={user.totp ? t('Aktiv.') : t('Nicht eingerichtet.')}
              >
                {user.totp && (
                  <Button
                    variant="outlined"
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('2FA zurücksetzen?'),
                        message: t(
                          '{username} meldet sich danach nur mit dem Passwort an und kann die App neu einrichten. Nur machen, wenn du sicher bist, dass die Person ihr Handy verloren hat.',
                          { username: user.username }
                        ),
                        confirmLabel: t('Zurücksetzen'),
                        icon: <PhonelinkLockRounded />,
                      });
                      if (ok) run(() => resetUserMfa(user.id), t('Zwei-Faktor-Anmeldung zurückgesetzt'));
                    }}
                  >
                    {t('Zurücksetzen')}
                  </Button>
                )}
              </SettingRow>
              <SettingRow
                icon={<FingerprintRounded />}
                label={t('Passkeys')}
                description={detail.passkeys.length ? detail.passkeys.map((p) => p.name).join(', ') : t('Keine.')}
              >
                {detail.passkeys.length > 0 && (
                  <Button
                    variant="outlined"
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('Alle Passkeys entfernen?'),
                        message: t('{username} kann sich danach nicht mehr mit Passkeys anmelden.', { username: user.username }),
                        confirmLabel: t('Entfernen'),
                        icon: <FingerprintRounded />,
                      });
                      if (ok) run(() => removeUserPasskeys(user.id), t('Passkeys entfernt'));
                    }}
                  >
                    {t('Alle entfernen')}
                  </Button>
                )}
              </SettingRow>
              {user.identities.map((identity) => (
                <SettingRow
                  key={identity.provider}
                  icon={providerIcon(identity.provider)}
                  label={providerLabel(identity.provider)}
                  description={t('Verknüpft als {name}.', { name: identity.name || t('unbekannt') })}
                >
                  <Button
                    variant="outlined"
                    onClick={() =>
                      run(
                        () => unlinkUserIdentity(user.id, identity.provider),
                        t('{label} getrennt', { label: providerLabel(identity.provider) })
                      )
                    }
                  >
                    {t('Trennen')}
                  </Button>
                </SettingRow>
              ))}
            </SettingsSection>

            <SettingsSection
              title={t('Sitzungen ({count})', { count: detail.sessions.length })}
              action={
                detail.sessions.length > 0 && (
                  <Button
                    size="small"
                    startIcon={<DevicesRounded />}
                    onClick={() =>
                      run(
                        () => revokeUserSessions(user.id),
                        self ? t('Andere Sitzungen beendet') : t('{username} wurde überall abgemeldet', { username: user.username })
                      )
                    }
                  >
                    {t('Überall abmelden')}
                  </Button>
                )
              }
            >
              {detail.sessions.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 2 }}>
                  {t('Gerade nirgends angemeldet.')}
                </Typography>
              ) : (
                detail.sessions.map((session) => <SessionRow key={session.id} session={{ ...session, current: self && session.current }} />)
              )}
            </SettingsSection>

            <SettingsSection
              title={t('API-Tokens')}
              action={
                <Button size="small" startIcon={<AddRounded />} onClick={() => setNaming(true)}>
                  {t('Token erstellen')}
                </Button>
              }
            >
              {detail.tokens.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 2 }}>
                  {t('Keine Tokens.')}
                </Typography>
              ) : (
                detail.tokens.map((entry) => (
                  <SettingRow
                    key={entry.id}
                    icon={<TokenRounded />}
                    label={entry.name}
                    description={t('{hint}, zuletzt benutzt {lastUsedAt}', { hint: entry.hint, lastUsedAt: relativeMs(entry.lastUsedAt) })}
                  >
                    <Tooltip title={t('Widerrufen')}>
                      <IconButton
                        aria-label={t('{name} widerrufen', { name: entry.name })}
                        onClick={() => run(() => revokeUserToken(user.id, entry.id), t('Token widerrufen'))}
                      >
                        <DeleteOutlineRounded />
                      </IconButton>
                    </Tooltip>
                  </SettingRow>
                ))
              )}
            </SettingsSection>

            <SettingsSection title={t('Aktivität')}>
              <Box sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
                <ActivityList events={detail.activity} empty={t('Keine Einträge im Aufbewahrungszeitraum.')} />
              </Box>
            </SettingsSection>

            {!self && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button color="error" variant="outlined" startIcon={<DeleteOutlineRounded />} onClick={remove}>
                  {t('Benutzer löschen')}
                </Button>
              </Box>
            )}
          </Stack>
        )}
      </SideSheet>

      <SuspendDialog
        user={suspending}
        onClose={() => setSuspending(null)}
        onConfirm={(reason) => {
          const target = suspending;
          setSuspending(null);
          if (target)
            run(
              () => updateUser(target.id, { status: 'suspended', suspendedReason: reason }),
              t('{username} ist gesperrt', { username: target.username })
            );
        }}
      />
      <PasswordResetDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={(password) => {
          const target = resetting;
          setResetting(null);
          if (target && password) setCredentials({ username: target.username, password });
          else toast(t('Passwort zurückgesetzt'), { variant: 'success' });
          if (target) load(target.id);
        }}
      />
      <CredentialsDialog data={credentials} onClose={() => setCredentials(null)} baseUrl={baseUrl} title={t('Passwort zurückgesetzt')} />
      <TokenNameDialog
        open={naming}
        onClose={() => setNaming(false)}
        title={user ? t('Token für {username}', { username: user.username }) : t('Token')}
        onCreate={async (name) => {
          if (!user) return;
          try {
            const result = await sudo(() => createUserToken(user.id, name));
            setNaming(false);
            setToken(result.token);
            load(user.id);
          } catch (failure) {
            if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
          }
        }}
      />
      <TokenRevealDialog token={token} onClose={() => setToken(null)} siteTitle={siteTitle} baseUrl={baseUrl} forUser={user?.username} />
    </>
  );
}
