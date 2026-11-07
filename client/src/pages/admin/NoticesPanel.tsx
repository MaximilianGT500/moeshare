import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import CampaignRounded from '@mui/icons-material/CampaignRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import type { Announcement, AnnouncementAudience, AnnouncementLevel, SettingsPayload } from '../../lib/types';
import {
  createAnnouncement,
  deleteAnnouncement,
  errorMessage,
  saveSettings,
  updateAnnouncement,
  ApiError,
  type AnnouncementInput,
} from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const LEVELS: Array<{ value: AnnouncementLevel; label: string }> = [
  { value: 'info', label: t('Info') },
  { value: 'success', label: t('Gut') },
  { value: 'warning', label: t('Achtung') },
  { value: 'error', label: t('Störung') },
];

const AUDIENCES: Array<{ value: AnnouncementAudience; label: string; hint: string }> = [
  { value: 'everyone', label: t('Alle'), hint: t('Auch Besucher auf der Startseite und bei der Anmeldung') },
  { value: 'users', label: t('Angemeldete'), hint: t('Im Dashboard, im Konto und im Admin-Bereich') },
  { value: 'admins', label: t('Nur Admins'), hint: t('Nur für Admins sichtbar') },
];

const LEVEL_COLORS: Record<AnnouncementLevel, { bg: string; fg: string }> = {
  info: { bg: c.secondaryContainer, fg: c.onSecondaryContainer },
  success: { bg: c.successContainer, fg: c.onSuccessContainer },
  warning: { bg: c.warningContainer, fg: c.onWarningContainer },
  error: { bg: c.errorContainer, fg: c.onErrorContainer },
};

const pad = (value: number) => String(value).padStart(2, '0');

function toLocalInput(ms: number | null) {
  if (!ms) return '';
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const fromLocalInput = (value: string) => (value ? new Date(value).getTime() : null);

function timeframe(item: Announcement) {
  const start = item.startsAt ? formatDateTime(new Date(item.startsAt)) : '';
  const end = item.endsAt ? formatDateTime(new Date(item.endsAt)) : '';
  if (start && end) return t('Von {start} bis {end}', { start, end });
  if (start) return t('Ab {start}, ohne Ende', { start });
  if (end) return t('Ab sofort bis {end}', { end });
  return t('Ab sofort, ohne Ende');
}

function stateOf(item: Announcement, now = Date.now()) {
  if (item.endsAt && item.endsAt <= now) return { label: t('Beendet'), active: false };
  if (item.startsAt && item.startsAt > now) return { label: t('Geplant'), active: false };
  return { label: t('Sichtbar'), active: true };
}

function AnnouncementDialog({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: Announcement | null;
  onClose: () => void;
  onSaved: (list: Announcement[]) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(item?.title || '');
  const [text, setText] = useState(item?.text || '');
  const [level, setLevel] = useState<AnnouncementLevel>(item?.level || 'info');
  const [audience, setAudience] = useState<AnnouncementAudience>(item?.audience || 'users');
  const [startsAt, setStartsAt] = useState(toLocalInput(item?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(item?.endsAt ?? null));
  const [dismissible, setDismissible] = useState(item ? item.dismissible : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    setField('');
    const data: AnnouncementInput = {
      title,
      text,
      level,
      audience,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      dismissible,
    };
    try {
      const result = item ? await updateAnnouncement(item.id, data) : await createAnnouncement(data);
      toast(item ? t('Ankündigung gespeichert') : t('Ankündigung veröffentlicht'));
      onSaved(result.announcements);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setField(failure instanceof ApiError ? failure.field : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{item ? t('Ankündigung bearbeiten') : t('Neue Ankündigung')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && !field && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('Überschrift')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            required
            error={field === 'title'}
            helperText={field === 'title' ? error : ' '}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label={t('Text')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            multiline
            minRows={3}
            error={field === 'text'}
            helperText={field === 'text' ? error : t('Optional. Zeilenumbrüche bleiben erhalten.')}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              {t('Art')}
            </Typography>
            <ToggleButtonGroup exclusive size="small" value={level} onChange={(_event, next) => next && setLevel(next)}>
              {LEVELS.map((entry) => (
                <ToggleButton key={entry.value} value={entry.value}>
                  {entry.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
          <TextField
            select
            label={t('Wer sieht sie?')}
            value={audience}
            onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}
            helperText={AUDIENCES.find((entry) => entry.value === audience)?.hint}
          >
            {AUDIENCES.map((entry) => (
              <MenuItem key={entry.value} value={entry.value}>
                {entry.label}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              type="datetime-local"
              label={t('Ab')}
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              helperText={t('Leer: sofort')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="datetime-local"
              label={t('Bis')}
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              error={field === 'endsAt'}
              helperText={field === 'endsAt' ? error : t('Leer: bis du sie löschst')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <FormControlLabel
            control={<Switch checked={dismissible} onChange={(event) => setDismissible(event.target.checked)} />}
            label={t('Lässt sich wegklicken')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy || !title.trim()}>
          {item ? t('Speichern') : t('Veröffentlichen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function NoticesPanel({
  initial,
  settings,
  onSettings,
}: {
  initial: Announcement[];
  settings: SettingsPayload;
  onSettings: (next: SettingsPayload) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Announcement[]>(initial);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const values = settings.values;
  const [maintenance, setMaintenance] = useState(Boolean(values['maintenance.enabled']));
  const [message, setMessage] = useState(String(values['maintenance.message'] || ''));
  const [allowViews, setAllowViews] = useState(values['maintenance.allowViews'] !== false);
  const [busy, setBusy] = useState(false);
  const dirty =
    maintenance !== Boolean(values['maintenance.enabled']) ||
    message !== String(values['maintenance.message'] || '') ||
    allowViews !== (values['maintenance.allowViews'] !== false);

  const openDialog = (item: Announcement | null) => {
    setEditing(item);
    setDialogKey((key) => key + 1);
    setDialogOpen(true);
  };

  const remove = async (item: Announcement) => {
    const ok = await confirm({
      title: t('Ankündigung löschen?'),
      message: t('„{title}“ verschwindet sofort für alle.', { title: item.title }),
      confirmLabel: t('Löschen'),
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await deleteAnnouncement(item.id);
      setItems(result.announcements);
      toast(t('Ankündigung gelöscht'));
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const saveMaintenance = async () => {
    setBusy(true);
    try {
      const result = await saveSettings({
        'maintenance.enabled': maintenance,
        'maintenance.message': message,
        'maintenance.allowViews': allowViews,
      });
      onSettings(result);
      toast(maintenance ? t('Wartungsmodus ist an') : t('Wartungsmodus gespeichert'));
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={4}>
      <SettingsSection
        title={t('Wartungsmodus')}
        description={t(
          'Während du am Server arbeitest, sehen alle außer Admins eine Wartungsseite. Uploads über ShareX und die API bekommen eine verständliche Fehlermeldung.'
        )}
      >
        <SwitchRow
          id="maintenance-enabled"
          label={
            <>
              {t('Wartungsmodus')}
              {Boolean(values['maintenance.enabled']) && (
                <Chip size="small" label={t('Aktiv')} sx={{ bgcolor: c.warningContainer, color: c.onWarningContainer, fontWeight: 700 }} />
              )}
            </>
          }
          description={t('Admins melden sich weiter an und nutzen alles wie gewohnt.')}
          checked={maintenance}
          onChange={setMaintenance}
        />
        <SwitchRow
          id="maintenance-views"
          label={t('Geteilte Dateien bleiben erreichbar')}
          description={t(
            'Links zu Dateien, Alben und Profilen funktionieren weiter. Abgeschaltet zeigt auch jeder Link die Wartungsseite.'
          )}
          checked={allowViews}
          onChange={setAllowViews}
        />
        <SettingRow label={t('Nachricht')} description={t('Steht auf der Wartungsseite und in den Fehlermeldungen.')} stacked>
          <TextField
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            multiline
            minRows={2}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </SettingRow>
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" onClick={saveMaintenance} disabled={!dirty || busy}>
            {t('Speichern')}
          </Button>
        </Box>
      </SettingsSection>

      <SettingsSection
        title={t('Ankündigungen')}
        description={t('Kurze Hinweise oben im Dashboard, im Konto und auf Wunsch auch auf der Startseite und bei der Anmeldung.')}
        action={
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => openDialog(null)}>
            {t('Neue Ankündigung')}
          </Button>
        }
      >
        {items.length === 0 ? (
          <Box sx={{ px: 3, py: 4, display: 'flex', gap: 2, alignItems: 'center', color: 'text.secondary' }}>
            <CampaignRounded />
            <Typography variant="body2">{t('Noch keine Ankündigungen. Wartung geplant oder etwas Neues? Sag es allen hier.')}</Typography>
          </Box>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const state = stateOf(item);
              const colors = LEVEL_COLORS[item.level];
              return (
                <m.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Box
                    sx={{ px: { xs: 2, sm: 3 }, py: 2, display: 'flex', gap: 2, alignItems: 'flex-start', opacity: state.active ? 1 : 0.7 }}
                  >
                    <Box
                      sx={{ width: 6, alignSelf: 'stretch', borderRadius: `${radius.xs}px`, bgcolor: colors.bg, flexShrink: 0 }}
                      aria-hidden
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                        <Chip
                          size="small"
                          label={LEVELS.find((entry) => entry.value === item.level)?.label}
                          sx={{ bgcolor: colors.bg, color: colors.fg, fontWeight: 700 }}
                        />
                        <Chip size="small" variant="outlined" label={AUDIENCES.find((entry) => entry.value === item.audience)?.label} />
                        <Chip size="small" variant="outlined" label={state.label} />
                      </Box>
                      {item.text && (
                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, whiteSpace: 'pre-line' }}>
                          {item.text}
                        </Typography>
                      )}
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
                        {timeframe(item)}
                      </Typography>
                    </Box>
                    <Tooltip title={t('Bearbeiten')}>
                      <IconButton onClick={() => openDialog(item)} aria-label={t('Bearbeiten')}>
                        <EditRounded />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('Löschen')}>
                      <IconButton onClick={() => remove(item)} aria-label={t('Löschen')}>
                        <DeleteOutlineRounded />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </m.div>
              );
            })}
          </AnimatePresence>
        )}
      </SettingsSection>

      <AnnouncementDialog key={dialogKey} open={dialogOpen} item={editing} onClose={() => setDialogOpen(false)} onSaved={setItems} />
    </Stack>
  );
}
