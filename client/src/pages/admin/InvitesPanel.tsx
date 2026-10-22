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
import { t } from '../../lib/i18n';

const REGISTRATION_TEXT: Record<string, string> = {
  closed: t('Die Registrierung ist geschlossen. Einladungen funktionieren trotzdem.'),
  invite: t('Neue Konten gibt es nur mit Einladung.'),
  open: t('Die Registrierung ist offen. Einladungen legen zusätzlich Rolle und Limits fest.'),
};

const USES = [
  { value: 1, label: t('Einmal') },
  { value: 5, label: '5-mal' },
  { value: 25, label: '25-mal' },
  { value: 0, label: t('Unbegrenzt') },
];
const EXPIRY = [
  { value: 1, label: t('1 Tag') },
  { value: 7, label: t('7 Tage') },
  { value: 30, label: t('30 Tage') },
  { value: 0, label: t('Nie') },
];

interface Created {
  invite: Invite;
  sent: string | null;
  mailError: string | null;
}

function CreateInviteDialog({
  open,
  mailReady,
  onClose,
  onCreated,
}: {
  open: boolean;
  mailReady: boolean;
  onClose: () => void;
  onCreated: (created: Created) => void;
}) {
  const sudo = useSudo();
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [role, setRole] = useState<'mitglied' | 'admin'>('mitglied');
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(7);
  const [limits, setLimits] = useState(false);
  const [quota, setQuota] = useState<number | null>(null);
  const [maxFile, setMaxFile] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
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
    setEmail('');
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
          email: mailReady && email.trim() ? email.trim() : undefined,
        })
      );
      onCreated(result);
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
        <DialogTitle id="invite-title">{t('Einladung erstellen')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('Rolle neuer Konten')}
              </Typography>
              <ToggleButtonGroup exclusive value={role} onChange={(_e, next) => next && setRole(next)} aria-label={t('Rolle')}>
                <ToggleButton value="mitglied">{t('Mitglied')}</ToggleButton>
                <ToggleButton value="admin">{t('Admin')}</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('Wie oft nutzbar')}
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={uses}
                onChange={(_e, next) => next !== null && setUses(next)}
                aria-label={t('Nutzungen')}
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
                {t('Gültig für')}
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={days}
                onChange={(_e, next) => next !== null && setDays(next)}
                aria-label={t('Gültigkeit')}
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
                {limits ? t('Ohne eigene Limits (Standard verwenden)') : t('Eigene Limits für neue Konten festlegen')}
              </Link>
              <Collapse in={limits}>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <BytesField label={t('Speicherlimit')} value={quota} onChange={setQuota} nullLabel={t('Standard')} />
                  <BytesField label={t('Größte Datei')} value={maxFile} onChange={setMaxFile} nullLabel={t('Standard')} />
                </Stack>
              </Collapse>
            </Box>
            {mailReady && (
              <TextField
                label={t('Per E-Mail verschicken (optional)')}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                helperText={t('Die Person bekommt den Link direkt zugeschickt.')}
                autoComplete="off"
                fullWidth
              />
            )}
            <TextField
              label={t('Notiz (optional)')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              helperText={t('Nur für dich, z. B. für wen die Einladung ist.')}
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
            {t('Abbrechen')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {mailReady && email.trim() ? t('Erstellen und senden') : t('Erstellen und Link kopieren')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

const STATE_LABEL = { active: t('Aktiv'), expired: t('Abgelaufen'), used: t('Aufgebraucht') } as const;

function usageText(invite: Invite): string {
  const uses = invite.maxUses
    ? t('{uses} von {maxUses} genutzt', { uses: invite.uses, maxUses: invite.maxUses })
    : invite.uses === 0
      ? t('Noch nicht genutzt')
      : t('{uses}-mal genutzt', { uses: invite.uses });
  if (invite.state === 'used') return uses;
  if (invite.state === 'expired')
    return t('{uses}, abgelaufen am {date}', { uses, date: formatDate(invite.expiresAt ? new Date(invite.expiresAt) : null) });
  return invite.expiresAt
    ? t('{uses}, gültig bis {date}', { uses, date: formatDate(new Date(invite.expiresAt)) })
    : t('{uses}, ohne Ablaufdatum', { uses });
}

const byRelevance = (a: Invite, b: Invite) => Number(b.state === 'active') - Number(a.state === 'active') || b.createdAt - a.createdAt;

export function InvitesPanel({
  initial,
  registration,
  onCount,
  mailReady = false,
}: {
  initial: Invite[];
  registration: string;
  onCount: (active: number) => void;
  mailReady?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [invites, setInvites] = useState(initial);
  const [creating, setCreating] = useState(false);

  useEffect(() => onCount(invites.filter((i) => i.state === 'active').length), [invites, onCount]);

  const remove = async (invite: Invite) => {
    const ok = await confirm({
      title: t('Einladung löschen?'),
      message:
        invite.state === 'active'
          ? t('Der Link funktioniert danach nicht mehr. Schon angelegte Konten bleiben bestehen.')
          : t('Der Eintrag verschwindet aus der Liste.'),
      confirmLabel: t('Löschen'),
    });
    if (!ok) return;
    try {
      await revokeInvite(invite.code);
      setInvites((list) => list.filter((i) => i.code !== invite.code));
      toast(t('Einladung gelöscht'), { variant: 'success' });
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
            {t('Registrierung einstellen')}
          </Link>
        </Typography>
        <Button variant="contained" startIcon={<GroupAddRounded />} onClick={() => setCreating(true)}>
          {t('Einladung erstellen')}
        </Button>
      </Box>

      {invites.length === 0 ? (
        <Box sx={{ py: 7, textAlign: 'center', color: 'text.secondary' }}>
          <GroupAddRounded sx={{ fontSize: 40, opacity: 0.6 }} />
          <Typography sx={{ mt: 1 }}>
            {t('Noch keine Einladungen. Erstelle einen Link und schick ihn an die Person, die ein Konto bekommen soll.')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' }, gap: 1.5 }}>
          <AnimatePresence initial={false}>
            {[...invites].sort(byRelevance).map((invite, index) => {
              const active = invite.state === 'active';
              const limits = [
                invite.quotaBytes && t('{quotaBytes} Speicher', { quotaBytes: formatBytes(invite.quotaBytes) }),
                invite.maxFileBytes && t('Dateien bis {maxFileBytes}', { maxFileBytes: formatBytes(invite.maxFileBytes) }),
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
                          label={t('Admin')}
                          sx={{ bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, fontWeight: 700 }}
                        />
                      )}
                      <Box sx={{ flex: 1 }} />
                      {active && (
                        <CopyIconButton
                          value={invite.url}
                          label={t('Link kopieren')}
                          message={t('Einladungslink kopiert')}
                          icon={<ContentCopyRounded fontSize="inherit" />}
                          size="small"
                        />
                      )}
                      <Tooltip title={t('Löschen')}>
                        <IconButton size="small" aria-label={t('Einladung löschen')} onClick={() => remove(invite)}>
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
                      {invite.note || (invite.role === 'admin' ? t('Einladung als Admin') : t('Einladung'))}
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
                      {t('Erstellt {createdAt}', { createdAt: relativeMs(invite.createdAt) })}
                      {invite.createdBy ? t(' von {createdBy}', { createdBy: invite.createdBy }) : ''}
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
        mailReady={mailReady}
        onClose={() => setCreating(false)}
        onCreated={async ({ invite, sent, mailError }) => {
          setCreating(false);
          setInvites((list) => [invite, ...list]);
          if (sent) {
            toast(t('Einladung an {email} verschickt', { email: sent }), { variant: 'success' });
            return;
          }
          const copied = await copyText(invite.url);
          if (mailError) {
            toast(`${mailError} ${copied ? t('Der Link ist kopiert.') : ''}`.trim(), {
              variant: 'error',
              duration: 9000,
            });
            return;
          }
          toast(copied ? t('Einladung erstellt und Link kopiert') : t('Einladung erstellt'), { variant: 'success' });
        }}
      />
    </Box>
  );
}
