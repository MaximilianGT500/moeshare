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
          {user?.username} wird sofort abgemeldet und kann weder hochladen noch sich anmelden. Geteilte Links bleiben erreichbar.
        </Typography>
        <TextField
          label="Grund (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          fullWidth
          helperText="Wird beim Anmeldeversuch angezeigt."
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" color="error" onClick={() => onConfirm(reason.trim())}>
          Sperren
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
      <DialogTitle id="reset-pw-title">Passwort zurücksetzen</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {user?.username} wird auf allen Geräten abgemeldet. ShareX-Tokens bleiben gültig.
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Neues Passwort (optional)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            fullWidth
            helperText="Leer lassen, dann erzeugt MoeShare eins."
            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false, style: { fontFamily: fonts.mono } } }}
          />
          <FormControlLabel
            control={<Switch checked={mustChange} onChange={(event) => setMustChange(event.target.checked)} />}
            label="Beim nächsten Anmelden ändern lassen"
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Abbrechen
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          Zurücksetzen
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
      title: role === 'admin' ? `${user.username} zum Admin machen?` : `${user.username} die Admin-Rechte nehmen?`,
      message:
        role === 'admin'
          ? 'Admins sehen alle Dateien und können Benutzer und Einstellungen ändern.'
          : `${user.username} wird zum Mitglied und verliert den Zugriff auf diesen Bereich.`,
      confirmLabel: role === 'admin' ? 'Zum Admin machen' : 'Rechte entziehen',
      destructive: role !== 'admin',
    });
    if (ok)
      run(
        () => updateUser(user.id, { role }),
        role === 'admin' ? `${user.username} ist jetzt Admin` : `${user.username} ist jetzt Mitglied`
      );
  };

  const saveLimits = async () => {
    if (!user) return;
    setSaving(true);
    await run(() => updateUser(user.id, { quotaBytes: quota, maxFileBytes: maxFile }), 'Limits gespeichert');
    setSaving(false);
  };

  const remove = async () => {
    if (!user) return;
    const ok = await confirm({
      title: `${user.username} löschen?`,
      message: `Das Konto und alle ${formatNumber(user.files)} Dateien (${formatBytes(user.storageBytes)}) werden endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.`,
      confirmLabel: 'Endgültig löschen',
    });
    if (!ok) return;
    try {
      await sudo(() => deleteUserById(user.id));
      toast(`${user.username} wurde gelöscht`, { variant: 'success' });
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
              {self && <Typography variant="caption">Das bist du</Typography>}
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
                    onClick={() => run(() => updateUser(user.id, { status: 'active' }), `${user.username} ist entsperrt`)}
                  >
                    Entsperren
                  </Button>
                }
              >
                Gesperrt{user.suspendedReason ? `: ${user.suspendedReason}` : ''}
              </Alert>
            )}

            <SettingsSection title="Überblick">
              <SettingRow label="Speicher" stacked>
                <QuotaMeter usedBytes={user.storageBytes} quotaBytes={user.effectiveQuotaBytes} />
              </SettingRow>
              <SettingRow
                label="Konto"
                description={`${formatNumber(user.files)} Dateien, ${formatNumber(user.views)} Aufrufe. ${user.createdAt ? `Angelegt am ${formatDate(new Date(user.createdAt))}` : 'Aus der alten Version übernommen'}, zuletzt angemeldet ${relativeMs(user.lastLoginAt)}.`}
              />
            </SettingsSection>

            <SettingsSection title="Rolle und Zugang">
              <SettingRow label="Rolle" description={self ? 'Deine eigene Rolle kannst du nicht ändern.' : undefined}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={user.role}
                  onChange={(_event, next) => next && setRole(next)}
                  disabled={self}
                  aria-label="Rolle"
                >
                  <ToggleButton value="mitglied">Mitglied</ToggleButton>
                  <ToggleButton value="admin">Admin</ToggleButton>
                </ToggleButtonGroup>
              </SettingRow>
              <SettingRow icon={<BlockRounded />} label="Konto sperren" description="Meldet sofort ab und blockiert Anmeldung und Uploads.">
                {user.status === 'suspended' ? (
                  <Button
                    variant="tonal"
                    onClick={() => run(() => updateUser(user.id, { status: 'active' }), `${user.username} ist entsperrt`)}
                  >
                    Entsperren
                  </Button>
                ) : (
                  <Button variant="outlined" color="error" disabled={self} onClick={() => setSuspending(user)}>
                    Sperren
                  </Button>
                )}
              </SettingRow>
            </SettingsSection>

            <SettingsSection title="Limits" description="Leer bedeutet: es gilt der Standard aus den Einstellungen.">
              <SettingRow
                label="Speicherlimit"
                description={`Standard: ${defaults.quotaBytes ? formatBytes(defaults.quotaBytes) : 'unbegrenzt'}`}
                stacked
              >
                <BytesField label="Speicher" value={quota} onChange={setQuota} nullLabel="Standard" />
              </SettingRow>
              <SettingRow
                label="Größte erlaubte Datei"
                description={`Standard: ${defaults.maxFileBytes ? formatBytes(defaults.maxFileBytes) : 'unbegrenzt'}`}
                stacked
              >
                <BytesField label="Dateigröße" value={maxFile} onChange={setMaxFile} nullLabel="Standard" />
              </SettingRow>
              {limitsDirty && (
                <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button
                    onClick={() => {
                      setQuota(user.quotaBytes);
                      setMaxFile(user.maxFileBytes);
                    }}
                  >
                    Verwerfen
                  </Button>
                  <Button variant="contained" onClick={saveLimits} disabled={saving}>
                    Limits speichern
                  </Button>
                </Box>
              )}
            </SettingsSection>

            <SettingsSection title="Anmeldung">
              <SettingRow
                icon={<PasswordRounded />}
                label="Passwort"
                description={
                  user.hasPassword
                    ? user.mustChangePassword
                      ? 'Vorläufig, wird beim nächsten Anmelden geändert.'
                      : 'Gesetzt.'
                    : 'Kein Passwort (meldet sich über einen Dienst oder einen Passkey an).'
                }
              >
                <Button variant="tonal" onClick={() => setResetting(user)}>
                  Zurücksetzen
                </Button>
              </SettingRow>
              <SettingRow
                icon={<PhonelinkLockRounded />}
                label="Zwei-Faktor-Anmeldung"
                description={user.totp ? 'Aktiv.' : 'Nicht eingerichtet.'}
              >
                {user.totp && (
                  <Button
                    variant="outlined"
                    onClick={async () => {
                      const ok = await confirm({
                        title: '2FA zurücksetzen?',
                        message: `${user.username} meldet sich danach nur mit dem Passwort an und kann die App neu einrichten. Nur machen, wenn du sicher bist, dass die Person ihr Handy verloren hat.`,
                        confirmLabel: 'Zurücksetzen',
                        icon: <PhonelinkLockRounded />,
                      });
                      if (ok) run(() => resetUserMfa(user.id), 'Zwei-Faktor-Anmeldung zurückgesetzt');
                    }}
                  >
                    Zurücksetzen
                  </Button>
                )}
              </SettingRow>
              <SettingRow
                icon={<FingerprintRounded />}
                label="Passkeys"
                description={detail.passkeys.length ? detail.passkeys.map((p) => p.name).join(', ') : 'Keine.'}
              >
                {detail.passkeys.length > 0 && (
                  <Button
                    variant="outlined"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Alle Passkeys entfernen?',
                        message: `${user.username} kann sich danach nicht mehr mit Passkeys anmelden.`,
                        confirmLabel: 'Entfernen',
                        icon: <FingerprintRounded />,
                      });
                      if (ok) run(() => removeUserPasskeys(user.id), 'Passkeys entfernt');
                    }}
                  >
                    Alle entfernen
                  </Button>
                )}
              </SettingRow>
              {user.identities.map((identity) => (
                <SettingRow
                  key={identity.provider}
                  icon={providerIcon(identity.provider)}
                  label={providerLabel(identity.provider)}
                  description={`Verknüpft als ${identity.name || 'unbekannt'}.`}
                >
                  <Button
                    variant="outlined"
                    onClick={() =>
                      run(() => unlinkUserIdentity(user.id, identity.provider), `${providerLabel(identity.provider)} getrennt`)
                    }
                  >
                    Trennen
                  </Button>
                </SettingRow>
              ))}
            </SettingsSection>

            <SettingsSection
              title={`Sitzungen (${detail.sessions.length})`}
              action={
                detail.sessions.length > 0 && (
                  <Button
                    size="small"
                    startIcon={<DevicesRounded />}
                    onClick={() =>
                      run(
                        () => revokeUserSessions(user.id),
                        self ? 'Andere Sitzungen beendet' : `${user.username} wurde überall abgemeldet`
                      )
                    }
                  >
                    Überall abmelden
                  </Button>
                )
              }
            >
              {detail.sessions.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 2 }}>
                  Gerade nirgends angemeldet.
                </Typography>
              ) : (
                detail.sessions.map((session) => <SessionRow key={session.id} session={{ ...session, current: self && session.current }} />)
              )}
            </SettingsSection>

            <SettingsSection
              title="API-Tokens"
              action={
                <Button size="small" startIcon={<AddRounded />} onClick={() => setNaming(true)}>
                  Token erstellen
                </Button>
              }
            >
              {detail.tokens.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 2 }}>
                  Keine Tokens.
                </Typography>
              ) : (
                detail.tokens.map((t) => (
                  <SettingRow
                    key={t.id}
                    icon={<TokenRounded />}
                    label={t.name}
                    description={`${t.hint}, zuletzt benutzt ${relativeMs(t.lastUsedAt)}`}
                  >
                    <Tooltip title="Widerrufen">
                      <IconButton
                        aria-label={`${t.name} widerrufen`}
                        onClick={() => run(() => revokeUserToken(user.id, t.id), 'Token widerrufen')}
                      >
                        <DeleteOutlineRounded />
                      </IconButton>
                    </Tooltip>
                  </SettingRow>
                ))
              )}
            </SettingsSection>

            <SettingsSection title="Aktivität">
              <Box sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
                <ActivityList events={detail.activity} empty="Keine Einträge im Aufbewahrungszeitraum." />
              </Box>
            </SettingsSection>

            {!self && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button color="error" variant="outlined" startIcon={<DeleteOutlineRounded />} onClick={remove}>
                  Benutzer löschen
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
          if (target) run(() => updateUser(target.id, { status: 'suspended', suspendedReason: reason }), `${target.username} ist gesperrt`);
        }}
      />
      <PasswordResetDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={(password) => {
          const target = resetting;
          setResetting(null);
          if (target && password) setCredentials({ username: target.username, password });
          else toast('Passwort zurückgesetzt', { variant: 'success' });
          if (target) load(target.id);
        }}
      />
      <CredentialsDialog data={credentials} onClose={() => setCredentials(null)} baseUrl={baseUrl} title="Passwort zurückgesetzt" />
      <TokenNameDialog
        open={naming}
        onClose={() => setNaming(false)}
        title={user ? `Token für ${user.username}` : 'Token'}
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
