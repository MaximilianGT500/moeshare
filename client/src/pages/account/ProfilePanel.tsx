import { useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import StorageRounded from '@mui/icons-material/StorageRounded';
import InsertDriveFileRounded from '@mui/icons-material/InsertDriveFileRounded';
import DeleteForeverRounded from '@mui/icons-material/DeleteForeverRounded';
import type { AccountOverview, AuditEvent } from '../../lib/types';
import { deleteAccount, errorMessage, fetchActivity } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import { SettingRow, SettingsSection } from '../../components/SettingsKit';
import { QuotaMeter } from '../../components/QuotaMeter';
import { ActivityList } from '../../components/ActivityList';
import { GrowTransition } from '../../components/transitions';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { c } from '../../theme/tokens';

function DeleteAccountDialog({ open, onClose, username }: { open: boolean; onClose: () => void; username: string }) {
  const sudo = useSudo();
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await sudo(() => deleteAccount(confirmText));
      window.location.assign(result.redirect || '/login');
    } catch (failure) {
      if (!isCancelled(failure)) setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      slotProps={{ transition: { onExited: () => setConfirmText('') } }}
      aria-labelledby="delete-account-title"
    >
      <Box component="form" onSubmit={submit} noValidate>
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.error, '& svg': { fontSize: 28 } }}>
          <DeleteForeverRounded />
        </Box>
        <DialogTitle id="delete-account-title" sx={{ textAlign: 'center' }}>
          Konto endgültig löschen?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5, textAlign: 'center' }}>
            Alle deine Dateien werden gelöscht, geteilte Links funktionieren danach nicht mehr. Das lässt sich nicht rückgängig machen.
          </Typography>
          <TextField
            label={`Tippe „${username}“ zur Bestätigung`}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            fullWidth
            autoFocus
            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false, autoCapitalize: 'off' } }}
          />
          <Collapse in={!!error} unmountOnExit>
            <Alert severity="error" role="alert" sx={{ mt: 2 }}>
              {error}
            </Alert>
          </Collapse>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="error"
            disabled={busy || confirmText !== username}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Konto löschen
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function ProfilePanel({ account }: { account: AccountOverview }) {
  const toast = useToast();
  const [events, setEvents] = useState<AuditEvent[]>(account.activity);
  const [more, setMore] = useState(account.activity.length >= 25);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { limits } = account;

  const loadMore = async () => {
    setLoading(true);
    try {
      const last = events[events.length - 1];
      const result = await fetchActivity(last ? last.id : undefined);
      setEvents((list) => [...list, ...result.events]);
      setMore(result.events.length >= 25);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={4}>
      <SettingsSection id="speicher" title="Speicher und Limits">
        {limits.quotaBytes ? (
          <SettingRow icon={<StorageRounded />} label="Speicher" stacked>
            <Box sx={{ maxWidth: 480 }}>
              <QuotaMeter usedBytes={limits.usedBytes} quotaBytes={limits.quotaBytes} />
            </Box>
          </SettingRow>
        ) : (
          <SettingRow
            icon={<StorageRounded />}
            label="Speicher"
            description={`${formatBytes(limits.usedBytes)} belegt. Für dein Konto gibt es kein Speicherlimit.`}
          />
        )}
        <SettingRow
          icon={<InsertDriveFileRounded />}
          label="Größte erlaubte Datei"
          description={
            limits.maxFileBytes
              ? `Einzelne Dateien dürfen bis zu ${formatBytes(limits.maxFileBytes)} groß sein.`
              : 'Für einzelne Dateien gibt es keine Größenbeschränkung.'
          }
        />
      </SettingsSection>

      <SettingsSection
        id="aktivitaet"
        title="Letzte Aktivität"
        description="Anmeldungen und Änderungen an deinem Konto der letzten Wochen."
      >
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
          <ActivityList events={events} />
          {more && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
              <Button onClick={loadMore} disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
                Ältere anzeigen
              </Button>
            </Box>
          )}
        </Box>
      </SettingsSection>

      <SettingsSection id="loeschen" title="Konto löschen">
        <SettingRow
          icon={<DeleteForeverRounded />}
          label="Konto und alle Dateien löschen"
          description={
            account.user.isAdmin
              ? 'Deine Uploads und Links verschwinden sofort. Bist du der letzte Admin, ernenne vorher einen anderen.'
              : 'Deine Uploads und Links verschwinden sofort und endgültig.'
          }
        >
          <Button variant="outlined" color="error" onClick={() => setDeleting(true)}>
            Konto löschen
          </Button>
        </SettingRow>
      </SettingsSection>

      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} username={account.user.username} />
    </Stack>
  );
}
