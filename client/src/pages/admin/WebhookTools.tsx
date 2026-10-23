import { useEffect, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import SendRounded from '@mui/icons-material/SendRounded';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import TagRounded from '@mui/icons-material/TagRounded';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import TelegramIcon from '@mui/icons-material/Telegram';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import DataObjectRounded from '@mui/icons-material/DataObjectRounded';
import type { WebhookKind, WebhookTarget } from '../../lib/types';
import { ApiError, createWebhook, deleteWebhook, errorMessage, testWebhookTarget, updateWebhook, type WebhookInput } from '../../lib/api';
import { relativeMs } from '../../lib/format';
import { t } from '../../lib/i18n';
import { providerIcon } from '../../lib/providers';
import { ColorField } from '../../components/Fields';
import { GrowTransition } from '../../components/transitions';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { isCancelled, useSudo } from '../../components/Sudo';
import { c, fonts, radius } from '../../theme/tokens';

interface FieldSpec {
  key: string;
  label: () => string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  help?: () => string;
  mono?: boolean;
  color?: boolean;
}

interface KindSpec {
  label: string;
  icon: ReactNode;
  intro: () => string;
  fields: FieldSpec[];
}

const KIND_SPECS: Record<WebhookKind, KindSpec> = {
  discord: {
    label: 'Discord',
    icon: providerIcon('discord'),
    intro: () => t('In Discord unter Kanal bearbeiten › Integrationen › Webhooks eine Adresse erstellen.'),
    fields: [
      { key: 'url', label: () => t('Webhook-Adresse'), secret: true, mono: true, placeholder: 'https://discord.com/api/webhooks/…' },
      { key: 'username', label: () => t('Absendername'), optional: true, placeholder: 'MoeShare' },
      { key: 'successColor', label: () => t('Farbe für Erfolg'), optional: true, color: true },
      { key: 'errorColor', label: () => t('Farbe für Fehler'), optional: true, color: true },
    ],
  },
  slack: {
    label: 'Slack',
    icon: <TagRounded />,
    intro: () => t('In Slack eine App mit „Incoming Webhooks“ anlegen und die Adresse für den Kanal kopieren.'),
    fields: [
      { key: 'url', label: () => t('Webhook-Adresse'), secret: true, mono: true, placeholder: 'https://hooks.slack.com/services/…' },
    ],
  },
  matrix: {
    label: 'Matrix',
    icon: <GridViewRounded />,
    intro: () =>
      t(
        'Ein Matrix-Konto für MoeShare, das im Raum Mitglied ist. Das Zugangstoken findest du in Element unter Einstellungen › Hilfe und Info.'
      ),
    fields: [
      { key: 'homeserver', label: () => t('Matrix-Server'), mono: true, placeholder: 'https://matrix.org' },
      { key: 'room', label: () => t('Raum'), mono: true, placeholder: '#moeshare:matrix.org' },
      { key: 'token', label: () => t('Zugangstoken'), secret: true, mono: true },
    ],
  },
  telegram: {
    label: 'Telegram',
    icon: <TelegramIcon />,
    intro: () => t('Bei @BotFather einen Bot anlegen, ihn in die Gruppe oder den Kanal holen und die Chat-ID eintragen.'),
    fields: [
      { key: 'token', label: () => t('Bot-Token'), secret: true, mono: true, placeholder: '123456789:ABC…' },
      { key: 'chatId', label: () => t('Chat-ID'), mono: true, placeholder: '-1001234567890' },
      {
        key: 'apiBase',
        label: () => t('Bot-API'),
        optional: true,
        mono: true,
        placeholder: 'https://api.telegram.org',
        help: () => t('Nur für einen eigenen Bot-API-Server ändern.'),
      },
    ],
  },
  ntfy: {
    label: 'ntfy',
    icon: <NotificationsActiveOutlined />,
    intro: () => t('Push-Nachrichten aufs Handy über ntfy.sh oder einen eigenen ntfy-Server.'),
    fields: [
      { key: 'server', label: () => t('Server'), optional: true, mono: true, placeholder: 'https://ntfy.sh' },
      { key: 'topic', label: () => t('Thema'), mono: true, placeholder: 'moeshare-alerts' },
      { key: 'token', label: () => t('Zugangstoken'), secret: true, optional: true, mono: true },
      { key: 'priority', label: () => t('Priorität (1 bis 5)'), optional: true, placeholder: '3' },
    ],
  },
  json: {
    label: t('Eigener Webhook'),
    icon: <DataObjectRounded />,
    intro: () =>
      t('MoeShare schickt jedes Ereignis als JSON per POST. Mit Schlüssel steht die HMAC-SHA256-Signatur im Header X-MoeShare-Signature.'),
    fields: [
      { key: 'url', label: () => t('Adresse'), secret: true, mono: true, placeholder: 'https://example.com/hooks/moeshare' },
      { key: 'secret', label: () => t('Signatur-Schlüssel'), secret: true, optional: true, mono: true },
    ],
  },
};

const EVENT_LABELS: Record<string, () => string> = {
  upload: () => t('Uploads'),
  delete: () => t('Löschungen'),
  user: () => t('Benutzer'),
  security: () => t('Sicherheit'),
  processing: () => t('Verarbeitung'),
  report: () => t('Meldungen'),
  system: () => t('Systemfehler'),
  virus: () => t('Virenfunde'),
  album: () => t('Geteilte Alben'),
  import: () => t('Importe'),
};

const eventLabel = (key: string) => (EVENT_LABELS[key] ? EVENT_LABELS[key]() : key);

interface Draft {
  kind: WebhookKind;
  name: string;
  config: Record<string, string>;
  events: string[];
  enabled: boolean;
}

function emptyDraft(kind: WebhookKind, events: string[]): Draft {
  return { kind, name: '', config: {}, events: events.filter((event) => event !== 'processing'), enabled: true };
}

function payload(draft: Draft): WebhookInput {
  const config: Record<string, string> = {};
  for (const field of KIND_SPECS[draft.kind].fields) {
    const value = draft.config[field.key];
    if (value !== undefined) config[field.key] = value;
    else if (!field.secret) config[field.key] = '';
  }
  return { kind: draft.kind, name: draft.name.trim(), config, events: draft.events, enabled: draft.enabled };
}

function TargetDialog({
  open,
  target,
  events,
  kinds,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: WebhookTarget | null;
  events: string[];
  kinds: WebhookKind[];
  onClose: () => void;
  onSaved: (targets: WebhookTarget[]) => void;
}) {
  const sudo = useSudo();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(null);
    setDraft(
      target ? { kind: target.kind, name: target.name, config: { ...target.config }, events: target.events, enabled: target.enabled } : null
    );
  }, [open, target]);

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const setField = (key: string, value: string) => {
    setDraft((current) => (current ? { ...current, config: { ...current.config, [key]: value } } : current));
    if (error?.field === `config.${key}`) setError(null);
  };

  const fail = (failure: unknown) => {
    if (isCancelled(failure)) return;
    if (failure instanceof ApiError && failure.field) setError({ field: failure.field, message: failure.message });
    else setError({ field: '', message: errorMessage(failure) });
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    setError(null);
    try {
      const data = payload(draft);
      const result = await sudo(() => (target ? updateWebhook(target.id, data) : createWebhook(data)));
      onSaved(result.targets);
      toast(target ? t('Ziel gespeichert') : t('Ziel hinzugefügt'), { variant: 'success' });
      onClose();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    if (!draft) return;
    setBusy('test');
    setError(null);
    try {
      await testWebhookTarget(target ? target.id : null, payload(draft));
      toast(t('Testnachricht gesendet. Schau nach, ob sie angekommen ist.'), { variant: 'success' });
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(null);
    }
  };

  const spec = draft ? KIND_SPECS[draft.kind] : null;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="webhook-dialog-title"
    >
      <DialogTitle id="webhook-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {draft && !target && (
          <IconButton aria-label={t('Zurück')} onClick={() => setDraft(null)} sx={{ ml: -1 }}>
            <ArrowBackRounded />
          </IconButton>
        )}
        {target ? t('Ziel bearbeiten') : draft ? t('{kind} verbinden', { kind: spec!.label }) : t('Wohin sollen die Nachrichten?')}
      </DialogTitle>
      <DialogContent>
        {!draft ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, pt: 0.5 }}>
            {kinds.map((kind) => (
              <ButtonBase
                key={kind}
                onClick={() => setDraft(emptyDraft(kind, events))}
                sx={{
                  flexDirection: 'column',
                  gap: 1,
                  py: 2.5,
                  px: 1,
                  borderRadius: `${radius.md}px`,
                  border: `1px solid ${c.outlineVariant}`,
                  '&:hover': { bgcolor: c.surfaceContainerHigh },
                  '& svg': { fontSize: 28 },
                }}
              >
                {KIND_SPECS[kind].icon}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {KIND_SPECS[kind].label}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {spec!.intro()}
            </Typography>
            <TextField
              size="small"
              label={t('Name')}
              placeholder={spec!.label}
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              helperText={t('Nur für dich, damit du die Ziele auseinanderhältst.')}
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            {spec!.fields.map((field) => {
              const fieldError = error && error.field === `config.${field.key}` ? error.message : '';
              if (field.color) {
                return (
                  <ColorField
                    key={field.key}
                    label={field.label()}
                    value={draft.config[field.key] || (field.key === 'errorColor' ? '#fc0303' : '#03fc28')}
                    onChange={(hex) => setField(field.key, hex)}
                    error={!!fieldError}
                    helperText={fieldError || undefined}
                  />
                );
              }
              const stored = field.secret && target?.secrets[field.key];
              return (
                <TextField
                  key={field.key}
                  size="small"
                  type={field.secret && field.key !== 'url' ? 'password' : 'text'}
                  label={`${field.label()}${field.optional ? ` (${t('optional')})` : ''}`}
                  placeholder={
                    stored && draft.config[field.key] === undefined ? t('Gespeichert. Zum Ändern neu eingeben.') : field.placeholder
                  }
                  value={draft.config[field.key] ?? ''}
                  onChange={(event) => setField(field.key, event.target.value)}
                  error={!!fieldError}
                  helperText={fieldError || (field.help ? field.help() : undefined)}
                  slotProps={{
                    htmlInput: {
                      autoComplete: 'off',
                      spellCheck: false,
                      style: field.mono ? { fontFamily: fonts.mono } : undefined,
                    },
                  }}
                />
              );
            })}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('Ereignisse')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {events.map((event) => {
                  const selected = draft.events.includes(event);
                  return (
                    <Chip
                      key={event}
                      label={eventLabel(event)}
                      variant={selected ? 'filled' : 'outlined'}
                      aria-pressed={selected}
                      onClick={() => set({ events: selected ? draft.events.filter((entry) => entry !== event) : [...draft.events, event] })}
                      sx={selected ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer } : undefined}
                    />
                  );
                })}
              </Box>
              {error?.field === 'events' && (
                <Typography variant="caption" sx={{ color: c.error }}>
                  {error.message}
                </Typography>
              )}
            </Box>
            <FormControlLabel
              control={<Switch checked={draft.enabled} onChange={(event) => set({ enabled: event.target.checked })} />}
              label={t('Nachrichten senden')}
            />
            {error && !error.field.startsWith('config.') && error.field !== 'events' && <Alert severity="error">{error.message}</Alert>}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!!busy}>
          {t('Abbrechen')}
        </Button>
        {draft && (
          <>
            <Button
              onClick={test}
              disabled={!!busy}
              startIcon={busy === 'test' ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
            >
              {t('Testen')}
            </Button>
            <Button
              variant="contained"
              onClick={save}
              disabled={!!busy}
              startIcon={busy === 'save' ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {target ? t('Speichern') : t('Hinzufügen')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function status(target: WebhookTarget) {
  if (!target.lastAt) return { text: t('Noch nichts gesendet'), ok: null };
  if (target.lastStatus === 200 || (target.lastStatus !== null && target.lastStatus >= 200 && target.lastStatus < 300)) {
    return { text: t('Zuletzt zugestellt {when}', { when: relativeMs(target.lastAt) }), ok: true };
  }
  return { text: `${t('Fehler {when}', { when: relativeMs(target.lastAt) })}: ${target.lastError || ''}`, ok: false };
}

export function WebhookTargets({ initial, kinds, events }: { initial: WebhookTarget[]; kinds: WebhookKind[]; events: string[] }) {
  const sudo = useSudo();
  const toast = useToast();
  const confirm = useConfirm();
  const [targets, setTargets] = useState<WebhookTarget[]>(initial);
  const [dialog, setDialog] = useState<{ target: WebhookTarget | null } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const toggle = async (target: WebhookTarget, enabled: boolean) => {
    setBusy(target.id);
    try {
      const result = await sudo(() => updateWebhook(target.id, { enabled }));
      setTargets(result.targets);
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const test = async (target: WebhookTarget) => {
    setBusy(target.id);
    try {
      const result = await testWebhookTarget(target.id);
      if (result.targets) setTargets(result.targets);
      toast(t('Testnachricht an „{name}“ gesendet', { name: target.name }), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error', duration: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (target: WebhookTarget) => {
    const ok = await confirm({
      title: t('„{name}“ entfernen?', { name: target.name }),
      message: t('MoeShare schickt dorthin keine Nachrichten mehr.'),
      confirmLabel: t('Entfernen'),
    });
    if (!ok) return;
    setBusy(target.id);
    try {
      const result = await sudo(() => deleteWebhook(target.id));
      setTargets(result.targets);
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box>
      {targets.length === 0 ? (
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Noch kein Ziel. Füge Discord, Slack, Matrix, Telegram, ntfy oder einen eigenen Webhook hinzu.')}
          </Typography>
        </Box>
      ) : (
        targets.map((target) => {
          const spec = KIND_SPECS[target.kind];
          const state = status(target);
          return (
            <Box
              key={target.id}
              sx={{
                display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'center' },
                flexDirection: { xs: 'column', sm: 'row' },
                gap: { xs: 1, sm: 2 },
                px: { xs: 2, sm: 3 },
                py: 2,
                borderTop: `1px solid ${c.outlineVariant}`,
                '&:first-of-type': { borderTop: 'none' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: `${radius.sm}px`,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: target.enabled ? c.secondaryContainer : c.surfaceContainerHighest,
                    color: target.enabled ? c.onSecondaryContainer : c.onSurfaceVariant,
                    '& svg': { fontSize: 22 },
                  }}
                >
                  {spec.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {target.name}
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: 1 }}>
                      {spec.label}
                    </Box>
                  </Typography>
                  <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} noWrap>
                    {target.events.length ? target.events.map(eventLabel).join(', ') : t('Keine Ereignisse gewählt')}
                  </Typography>
                  <Typography
                    variant="caption"
                    component="p"
                    sx={{ color: state.ok === false ? c.error : 'text.secondary', wordBreak: 'break-word' }}
                  >
                    {state.text}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, ml: { xs: 6, sm: 0 } }}>
                <Tooltip title={target.enabled ? t('Ausschalten') : t('Einschalten')}>
                  <Switch
                    checked={target.enabled}
                    disabled={busy === target.id}
                    onChange={(event) => toggle(target, event.target.checked)}
                    slotProps={{ input: { 'aria-label': t('{name} senden', { name: target.name }) } }}
                  />
                </Tooltip>
                <Tooltip title={t('Testnachricht senden')}>
                  <span>
                    <IconButton onClick={() => test(target)} disabled={busy === target.id} aria-label={t('Testnachricht senden')}>
                      {busy === target.id ? <CircularProgress size={18} /> : <SendRounded fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('Bearbeiten')}>
                  <IconButton onClick={() => setDialog({ target })} aria-label={t('Bearbeiten')}>
                    <EditOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('Entfernen')}>
                  <IconButton onClick={() => remove(target)} aria-label={t('Entfernen')} sx={{ color: c.error }}>
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          );
        })
      )}
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, borderTop: `1px solid ${c.outlineVariant}`, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button variant="tonal" startIcon={<AddRounded />} onClick={() => setDialog({ target: null })} disabled={targets.length >= 20}>
          {t('Ziel hinzufügen')}
        </Button>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5 }}>
          <ForumOutlined sx={{ fontSize: 16 }} />
          {t('Bis zu 20 Ziele, jedes mit eigenen Ereignissen.')}
        </Typography>
      </Box>
      <TargetDialog
        open={!!dialog}
        target={dialog?.target ?? null}
        events={events}
        kinds={kinds}
        onClose={() => setDialog(null)}
        onSaved={setTargets}
      />
    </Box>
  );
}
