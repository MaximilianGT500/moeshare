import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PasswordRounded from '@mui/icons-material/PasswordRounded';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CloudDoneRounded from '@mui/icons-material/CloudDoneRounded';
import type { AccountOverview, PasskeyInfo } from '../../lib/types';
import {
  ApiError,
  changePassword,
  deletePasskey,
  disableTotp,
  errorMessage,
  passkeyRegistrationOptions,
  regenerateRecoveryCodes,
  renamePasskey,
  savePasskey,
  unlinkIdentity,
} from '../../lib/api';
import { formatDate, relativeMs } from '../../lib/format';
import { passkeyErrorMessage, passkeySupport, startRegistration } from '../../lib/webauthn';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { PasswordField } from '../../components/PasswordField';
import { GrowTransition } from '../../components/transitions';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { RecoveryCodesDialog, TotpSetupDialog } from './TotpDialogs';
import { authUrl, providerIcon } from '../../lib/providers';
import { c, ease } from '../../theme/tokens';

function StatusChip({ on, label }: { on: boolean; label?: string }) {
  return (
    <Chip
      size="small"
      label={label || (on ? 'Aktiv' : 'Aus')}
      sx={
        on
          ? { bgcolor: c.successContainer, color: c.onSuccessContainer, fontWeight: 700 }
          : { bgcolor: c.surfaceContainerHighest, color: c.onSurfaceVariant }
      }
    />
  );
}

function PasswordDialog({
  open,
  onClose,
  account,
  minLength,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  account: AccountOverview;
  minLength: number;
  onChanged: (endedSessions: number) => void;
}) {
  const sudo = useSudo();
  const needsCurrent = account.user.hasPassword && !account.user.mustChangePassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [field, setField] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setError('');
      setField('');
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await sudo(() => changePassword(current, next));
      onChanged(result.endedSessions);
      onClose();
    } catch (failure) {
      if (!isCancelled(failure)) {
        setError(errorMessage(failure));
        setField((failure as { field?: string }).field || '');
      }
    } finally {
      setBusy(false);
    }
  };

  const forced = account.user.mustChangePassword;
  return (
    <Dialog
      open={open}
      onClose={() => !busy && !forced && onClose()}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="pw-title"
    >
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle id="pw-title">{account.user.hasPassword ? 'Neues Passwort festlegen' : 'Passwort festlegen'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
            {forced
              ? 'Ein Admin hat dir ein vorläufiges Passwort gegeben. Wähle jetzt dein eigenes.'
              : 'Andere angemeldete Geräte werden danach abgemeldet.'}
          </Typography>
          <Stack spacing={2}>
            {needsCurrent && (
              <PasswordField
                label="Aktuelles Passwort"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                autoFocus
                error={field === 'current'}
              />
            )}
            <PasswordField
              label="Neues Passwort"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              autoFocus={!needsCurrent}
              error={field === 'next'}
              strength={{ minLength, username: account.user.username }}
            />
            <Collapse in={!!error} unmountOnExit>
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            </Collapse>
          </Stack>
        </DialogContent>
        <DialogActions>
          {!forced && (
            <Button onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={busy || next.length < minLength || (needsCurrent && !current)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Passwort speichern
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function RenameDialog({
  passkey,
  onClose,
  onSaved,
}: {
  passkey: PasskeyInfo | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (passkey) {
      setName(passkey.name);
      setError('');
    }
  }, [passkey]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!passkey) return;
    setBusy(true);
    try {
      await renamePasskey(passkey.id, name.trim());
      onSaved(name.trim());
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={!!passkey}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="rename-title"
    >
      <Box component="form" onSubmit={submit}>
        <DialogTitle id="rename-title">Passkey umbenennen</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            fullWidth
            error={!!error}
            helperText={error || 'Zum Beispiel „Handy“ oder „Laptop Arbeit“.'}
            slotProps={{ htmlInput: { maxLength: 60 } }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="contained" disabled={busy || !name.trim()}>
            Speichern
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function SecurityPanel({
  account,
  siteTitle,
  minPasswordLength,
  reload,
  autoOpen,
}: {
  account: AccountOverview;
  siteTitle: string;
  minPasswordLength: number;
  reload: () => Promise<void>;
  autoOpen: 'password' | 'mfa' | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const { security, user } = account;
  const [passwordOpen, setPasswordOpen] = useState(autoOpen === 'password');
  const [totpOpen, setTotpOpen] = useState(autoOpen === 'mfa');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [renaming, setRenaming] = useState<PasskeyInfo | null>(null);
  const [adding, setAdding] = useState(false);
  const totpEnabledNow = useRef(false);
  const support = passkeySupport(security.passkeyOrigin);

  const guarded = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await sudo(action);
      if (success) toast(success, { variant: 'success' });
      await reload();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const turnOffTotp = async () => {
    const ok = await confirm({
      title: 'Zwei-Faktor-Anmeldung abschalten?',
      message: 'Dann reicht wieder dein Passwort allein. Deine Wiederherstellungscodes werden ungültig.',
      confirmLabel: 'Abschalten',
      icon: <PhonelinkLockRounded />,
    });
    if (ok) guarded(() => disableTotp(), 'Zwei-Faktor-Anmeldung abgeschaltet');
  };

  const newCodes = async () => {
    const ok = await confirm({
      title: 'Neue Wiederherstellungscodes?',
      message: 'Deine bisherigen Codes gelten danach nicht mehr.',
      confirmLabel: 'Neue Codes erstellen',
      destructive: false,
      icon: <KeyRounded />,
    });
    if (!ok) return;
    try {
      const result = await sudo(() => regenerateRecoveryCodes());
      setCodes(result.recoveryCodes);
      reload();
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const addPasskey = async () => {
    setAdding(true);
    try {
      const { flowId, options } = await sudo(() => passkeyRegistrationOptions());
      const response = await startRegistration({ optionsJSON: options });
      const result = await sudo(() => savePasskey(flowId, response));
      toast(`Passkey „${result.passkey.name}“ hinzugefügt`, { variant: 'success' });
      await reload();
      setRenaming(result.passkey);
    } catch (failure) {
      if (isCancelled(failure)) return;
      const message = failure instanceof ApiError ? failure.message : passkeyErrorMessage(failure);
      if (message) toast(message, { variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const removePasskey = async (passkey: PasskeyInfo) => {
    const ok = await confirm({
      title: `„${passkey.name}“ entfernen?`,
      message: 'Mit diesem Passkey kannst du dich danach nicht mehr anmelden. Lösche ihn am besten auch im Passwortmanager deines Geräts.',
      confirmLabel: 'Entfernen',
      icon: <FingerprintRounded />,
    });
    if (ok) guarded(() => deletePasskey(passkey.id), 'Passkey entfernt');
  };

  const unlink = async (provider: string, label: string) => {
    const ok = await confirm({
      title: `${label} trennen?`,
      message: `Du meldest dich danach nicht mehr mit ${label} an. Du kannst es jederzeit wieder verknüpfen.`,
      confirmLabel: 'Trennen',
      icon: providerIcon(provider),
    });
    if (ok) guarded(() => unlinkIdentity(provider), `${label} getrennt`);
  };

  const linkable = security.providers.filter((provider) => !security.identities.some((identity) => identity.provider === provider.key));

  return (
    <Stack spacing={4}>
      <SettingsSection
        id="anmeldung"
        title="Passwort und Zwei-Faktor"
        description="Mit der Zwei-Faktor-Anmeldung fragt MoeShare nach dem Passwort zusätzlich nach einem Code aus deiner Authenticator-App. Ein gestohlenes Passwort allein reicht dann nicht mehr."
      >
        <SettingRow
          icon={<PasswordRounded />}
          label="Passwort"
          description={
            user.hasPassword
              ? user.passwordChangedAt
                ? `Zuletzt geändert ${relativeMs(user.passwordChangedAt)}.`
                : 'Wurde vor dem Umstieg auf die neue Anmeldung festgelegt.'
              : 'Du hast noch kein Passwort und meldest dich über einen verknüpften Dienst oder einen Passkey an.'
          }
        >
          <Button variant="tonal" onClick={() => setPasswordOpen(true)}>
            {user.hasPassword ? 'Ändern' : 'Festlegen'}
          </Button>
        </SettingRow>
        <SettingRow
          icon={<PhonelinkLockRounded />}
          label={
            <>
              Authenticator-App <StatusChip on={security.totp} />
            </>
          }
          description={
            security.totp
              ? `Eingerichtet ${relativeMs(security.totpEnabledAt)}.${security.mfaRequired ? ' Auf diesem Server Pflicht.' : ''}`
              : security.mfaRequired
                ? 'Auf diesem Server Pflicht. Richte sie ein, um weiterzumachen.'
                : 'Codes aus Apps wie Aegis, 2FAS oder Google Authenticator.'
          }
        >
          {security.totp ? (
            !security.mfaRequired && (
              <Button variant="outlined" onClick={turnOffTotp}>
                Abschalten
              </Button>
            )
          ) : (
            <Button variant="contained" onClick={() => setTotpOpen(true)}>
              Einrichten
            </Button>
          )}
        </SettingRow>
        {security.totp && (
          <SettingRow
            icon={<KeyRounded />}
            label="Wiederherstellungscodes"
            description={
              security.recoveryCodesLeft <= 3
                ? `Nur noch ${security.recoveryCodesLeft} Codes übrig. Erstelle neue, bevor sie ausgehen.`
                : `${security.recoveryCodesLeft} von 10 Codes übrig. Damit kommst du ohne Handy in dein Konto.`
            }
          >
            <Button variant={security.recoveryCodesLeft <= 3 ? 'contained' : 'tonal'} onClick={newCodes}>
              Neue Codes
            </Button>
          </SettingRow>
        )}
      </SettingsSection>

      {security.passkeysEnabled && (
        <SettingsSection
          id="passkeys"
          title="Passkeys"
          description="Melde dich mit Fingerabdruck, Gesicht oder der PIN deines Geräts an, ganz ohne Passwort. Passkeys lassen sich nicht abfangen oder auf fremden Seiten verwenden."
          action={
            <Tooltip title={support.ok ? '' : support.reason}>
              <span>
                <Button
                  variant="tonal"
                  startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
                  onClick={addPasskey}
                  disabled={!support.ok || adding}
                >
                  Hinzufügen
                </Button>
              </span>
            </Tooltip>
          }
        >
          {!support.ok && (
            <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
              <Alert severity="info">{support.reason}</Alert>
            </Box>
          )}
          <AnimatePresence initial={false}>
            {security.passkeys.map((passkey) => (
              <m.div
                key={passkey.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: ease.emphasizedDecelerate }}
              >
                <SettingRow
                  icon={<FingerprintRounded />}
                  label={
                    <>
                      {passkey.name}
                      {passkey.backedUp && (
                        <Tooltip title="Wird über deine Geräte synchronisiert">
                          <CloudDoneRounded sx={{ fontSize: 18, color: c.onSurfaceVariant }} aria-label="synchronisiert" />
                        </Tooltip>
                      )}
                    </>
                  }
                  description={`Hinzugefügt am ${formatDate(new Date(passkey.createdAt))}, zuletzt benutzt ${relativeMs(passkey.lastUsedAt)}.`}
                >
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Umbenennen">
                      <IconButton aria-label={`${passkey.name} umbenennen`} onClick={() => setRenaming(passkey)}>
                        <EditRounded />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Entfernen">
                      <IconButton
                        aria-label={`${passkey.name} entfernen`}
                        onClick={() => removePasskey(passkey)}
                        sx={{ '&:hover': { color: c.error } }}
                      >
                        <DeleteOutlineRounded />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </SettingRow>
              </m.div>
            ))}
          </AnimatePresence>
          {security.passkeys.length === 0 && support.ok && (
            <Box sx={{ px: { xs: 2, sm: 3 }, py: 3, display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
              <FingerprintRounded />
              <Typography variant="body2">Noch kein Passkey. Füge einen hinzu, dann ist die Anmeldung eine Sache von Sekunden.</Typography>
            </Box>
          )}
        </SettingsSection>
      )}

      {(security.identities.length > 0 || security.providers.length > 0) && (
        <SettingsSection
          id="verbindungen"
          title="Verbundene Konten"
          description="Melde dich mit einem Klick über einen anderen Dienst an. Ein Dienst lässt sich nur mit einem MoeShare-Konto verknüpfen."
        >
          {security.identities.map((identity) => (
            <SettingRow
              key={identity.provider}
              icon={providerIcon(identity.provider)}
              label={
                <>
                  {identity.label} <StatusChip on={identity.enabled} label={identity.enabled ? 'Verknüpft' : 'Abgeschaltet'} />
                </>
              }
              description={
                identity.enabled
                  ? `Verknüpft als ${identity.name || 'unbekannt'}${identity.lastUsedAt ? `, zuletzt benutzt ${relativeMs(identity.lastUsedAt)}` : ''}.`
                  : `Verknüpft als ${identity.name || 'unbekannt'}. Die Anmeldung mit ${identity.label} ist auf diesem Server gerade abgeschaltet.`
              }
            >
              <Button variant="outlined" onClick={() => unlink(identity.provider, identity.label)}>
                Trennen
              </Button>
            </SettingRow>
          ))}
          {linkable.map((provider) => (
            <SettingRow
              key={provider.key}
              icon={providerIcon(provider.key)}
              label={provider.label}
              description={`Verknüpfe dein ${provider.label}-Konto, um dich damit anzumelden.`}
            >
              <Button variant="tonal" href={authUrl(provider.key, { intent: 'link' })}>
                Verknüpfen
              </Button>
            </SettingRow>
          ))}
        </SettingsSection>
      )}

      <PasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        account={account}
        minLength={minPasswordLength}
        onChanged={(ended) => {
          toast(
            ended > 0
              ? `Passwort gespeichert. ${ended === 1 ? 'Ein anderes Gerät wurde' : `${ended} andere Geräte wurden`} abgemeldet.`
              : 'Passwort gespeichert',
            { variant: 'success' }
          );
          if (user.mustChangePassword) window.location.assign('/dashboard');
          else reload();
        }}
      />
      <TotpSetupDialog
        open={totpOpen}
        onClose={() => {
          setTotpOpen(false);
          if (autoOpen === 'mfa' && totpEnabledNow.current) window.location.assign('/dashboard');
        }}
        onEnabled={() => {
          totpEnabledNow.current = true;
          reload();
        }}
        siteTitle={siteTitle}
        username={user.username}
      />
      <RecoveryCodesDialog codes={codes} onClose={() => setCodes(null)} siteTitle={siteTitle} username={user.username} />
      <RenameDialog passkey={renaming} onClose={() => setRenaming(null)} onSaved={() => reload()} />
    </Stack>
  );
}
