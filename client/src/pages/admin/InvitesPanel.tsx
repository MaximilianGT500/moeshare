import { useEffect, useState, type FormEvent } from 'react';
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
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import GroupAddRounded from '@mui/icons-material/GroupAddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { Invite } from '../../lib/types';
import { createInvite, errorMessage, revokeInvite, ApiError } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { formatBytes, formatDate, relativeMs } from '../../lib/format';
import { BytesField } from '../../components/Fields';
import { CopyIconButton } from '../../components/CopyButton';
import { GrowTransition, SlideUpTransition } from '../../components/transitions';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { c, ease, fonts, radius } from '../../theme/tokens';

const REGISTRATION_TEXT: Record<string, string> = {
  closed: 'Die Registrierung ist geschlossen. Einladungen funktionieren trotzdem.',
  invite: 'Neue Konten gibt es nur mit Einladung.',
  open: 'Die Registrierung ist offen. Einladungen legen zusätzlich Rolle und Limits fest.',
};

const USES = [
  { value: 1, label: 'Einmal' },
  { value: 5, label: '5-mal' },
  { value: 25, label: '25-mal' },
  { value: 0, label: 'Unbegrenzt' },
];
const EXPIRY = [
  { value: 1, label: '1 Tag' },
  { value: 7, label: '7 Tage' },
  { value: 30, label: '30 Tage' },
  { value: 0, label: 'Nie' },
];

function CreateInviteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (invite: Invite) => void }) {
  const sudo = useSudo();
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [role, setRole] = useState<'mitglied' | 'admin'>('mitglied');
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(7);
  const [limits, setLimits] = useState(false);
  const [quota, setQuota] = useState<number | null>(null);
  const [maxFile, setMaxFile] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRole('mitglied');
    setUses(1);
    setDays(7);
    setLimits(false);
    setQuota(null);
    setMaxFile(null);
    setNote('');
    setError('');
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await sudo(() =>
        createInvite({
          role,
          maxUses: uses || null,
          expiresInDays: days || null,
          quotaBytes: limits ? quota : null,
          maxFileBytes: limits ? maxFile : null,
          note: note.trim(),
        })
      );
      onCreated(result.invite);
    } catch (failure) {
      if (!isCancelled(failure)) setError(failure instanceof ApiError ? failure.message : errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullScreen={phone}
      maxWidth="sm"
      fullWidth
      slots={{ transition: phone ? SlideUpTransition : GrowTransition }}
      aria-labelledby="invite-title"
    >
      <Box component="form" onSubmit={submit} sx={{ display: 'contents' }}>
        <DialogTitle id="invite-title">Einladung erstellen</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Rolle neuer Konten
              </Typography>
              <ToggleButtonGroup exclusive value={role} onChange={(_e, next) => next && setRole(next)} aria-label="Rolle">
                <ToggleButton value="mitglied">Mitglied</ToggleButton>
                <ToggleButton value="admin">Admin</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Wie oft nutzbar
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={uses}
                onChange={(_e, next) => next !== null && setUses(next)}
                aria-label="Nutzungen"
                sx={{ flexWrap: 'wrap' }}
              >
                {USES.map((option) => (
                  <ToggleButton key={option.value} value={option.value}>
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Gültig für
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={days}
                onChange={(_e, next) => next !== null && setDays(next)}
                aria-label="Gültigkeit"
                sx={{ flexWrap: 'wrap' }}
              >
                {EXPIRY.map((option) => (
                  <ToggleButton key={option.value} value={option.value}>
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <Box>
              <Link component="button" type="button" variant="body2" onClick={() => setLimits((v) => !v)} underline="hover">
                {limits ? 'Ohne eigene Limits (Standard verwenden)' : 'Eigene Limits für neue Konten festlegen'}
              </Link>
              <Collapse in={limits}>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <BytesField label="Speicherlimit" value={quota} onChange={setQuota} nullLabel="Standard" />
                  <BytesField label="Größte Datei" value={maxFile} onChange={setMaxFile} nullLabel="Standard" />
                </Stack>
              </Collapse>
            </Box>
            <TextField
              label="Notiz (optional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              helperText="Nur für dich, z. B. für wen die Einladung ist."
              slotProps={{ htmlInput: { maxLength: 120 } }}
              fullWidth
            />
            <Collapse in={!!error} unmountOnExit>
              <Alert severity="error">{error}</Alert>
            </Collapse>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Erstellen und Link kopieren
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

const STATE_LABEL = { active: 'Aktiv', expired: 'Abgelaufen', used: 'Aufgebraucht' } as const;

function usageText(invite: Invite): string {
  const uses = invite.maxUses
    ? `${invite.uses} von ${invite.maxUses} genutzt`
    : invite.uses === 0
      ? 'Noch nicht genutzt'
      : `${invite.uses}-mal genutzt`;
  if (invite.state === 'used') return uses;
  if (invite.state === 'expired') return `${uses}, abgelaufen am ${formatDate(invite.expiresAt ? new Date(invite.expiresAt) : null)}`;
  return invite.expiresAt ? `${uses}, gültig bis ${formatDate(new Date(invite.expiresAt))}` : `${uses}, ohne Ablaufdatum`;
}

const byRelevance = (a: Invite, b: Invite) => Number(b.state === 'active') - Number(a.state === 'active') || b.createdAt - a.createdAt;

export function InvitesPanel({
  initial,
  registration,
  onCount,
}: {
  initial: Invite[];
  registration: string;
  onCount: (active: number) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [invites, setInvites] = useState(initial);
  const [creating, setCreating] = useState(false);

  useEffect(() => onCount(invites.filter((i) => i.state === 'active').length), [invites, onCount]);

  const remove = async (invite: Invite) => {
    const ok = await confirm({
      title: 'Einladung löschen?',
      message:
        invite.state === 'active'
          ? 'Der Link funktioniert danach nicht mehr. Schon angelegte Konten bleiben bestehen.'
          : 'Der Eintrag verschwindet aus der Liste.',
      confirmLabel: 'Löschen',
    });
    if (!ok) return;
    try {
      await revokeInvite(invite.code);
      setInvites((list) => list.filter((i) => i.code !== invite.code));
      toast('Einladung gelöscht', { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: '1 1 300px' }}>
          {REGISTRATION_TEXT[registration] || ''}{' '}
          <Link href="#einstellungen" underline="hover">
            Registrierung einstellen
          </Link>
        </Typography>
        <Button variant="contained" startIcon={<GroupAddRounded />} onClick={() => setCreating(true)}>
          Einladung erstellen
        </Button>
      </Box>

      {invites.length === 0 ? (
        <Box sx={{ py: 7, textAlign: 'center', color: 'text.secondary' }}>
          <GroupAddRounded sx={{ fontSize: 40, opacity: 0.6 }} />
          <Typography sx={{ mt: 1 }}>
            Noch keine Einladungen. Erstelle einen Link und schick ihn an die Person, die ein Konto bekommen soll.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' }, gap: 1.5 }}>
          <AnimatePresence initial={false}>
            {[...invites].sort(byRelevance).map((invite, index) => {
              const active = invite.state === 'active';
              const limits = [
                invite.quotaBytes && `${formatBytes(invite.quotaBytes)} Speicher`,
                invite.maxFileBytes && `Dateien bis ${formatBytes(invite.maxFileBytes)}`,
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <m.div
                  key={invite.code}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                  transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.3, ease: ease.emphasizedDecelerate }}
                >
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: `${radius.md}px`,
                      bgcolor: c.surfaceContainerLow,
                      opacity: active ? 1 : 0.7,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.25,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={STATE_LABEL[invite.state]}
                        sx={
                          active
                            ? { bgcolor: c.successContainer, color: c.onSuccessContainer, fontWeight: 700 }
                            : { bgcolor: c.surfaceContainerHighest }
                        }
                      />
                      {invite.role === 'admin' && (
                        <Chip
                          size="small"
                          label="Admin"
                          sx={{ bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, fontWeight: 700 }}
                        />
                      )}
                      <Box sx={{ flex: 1 }} />
                      {active && (
                        <CopyIconButton
                          value={invite.url}
                          label="Link kopieren"
                          message="Einladungslink kopiert"
                          icon={<ContentCopyRounded fontSize="inherit" />}
                          size="small"
                        />
                      )}
                      <Tooltip title="Löschen">
                        <IconButton size="small" aria-label="Einladung löschen" onClick={() => remove(invite)}>
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
                      {invite.note || (invite.role === 'admin' ? 'Einladung als Admin' : 'Einladung')}
                    </Typography>
                    {active && (
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: fonts.mono, fontSize: '0.75rem', color: 'text.secondary', wordBreak: 'break-all' }}
                      >
                        {invite.url}
                      </Typography>
                    )}
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 'auto' }}>
                      {usageText(invite)}
                      {limits ? `. ${limits}` : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Erstellt {relativeMs(invite.createdAt)}
                      {invite.createdBy ? ` von ${invite.createdBy}` : ''}
                    </Typography>
                  </Box>
                </m.div>
              );
            })}
          </AnimatePresence>
        </Box>
      )}

      <CreateInviteDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (invite) => {
          setCreating(false);
          setInvites((list) => [invite, ...list]);
          const copied = await copyText(invite.url);
          toast(copied ? 'Einladung erstellt und Link kopiert' : 'Einladung erstellt', { variant: 'success' });
        }}
      />
    </Box>
  );
}
