import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import SendRounded from '@mui/icons-material/SendRounded';
import WebhookRounded from '@mui/icons-material/WebhookRounded';
import { siDiscord, siMastodon, siMatrix, siNtfy, siTelegram, type SimpleIcon } from 'simple-icons';
import type { AccountBoot, AutoShareInput, AutoShareKind, AutoShareRule, FileType, MastodonVisibility, TagCount } from '../../lib/types';
import {
  ApiError,
  createAutoShare,
  deleteAutoShare,
  errorMessage,
  fetchAutoShare,
  fetchTags,
  testAutoShare,
  updateAutoShare,
} from '../../lib/api';
import { readBoot } from '../../lib/boot';
import { relativeMs } from '../../lib/format';
import { language, t } from '../../lib/i18n';
import { SettingsSection } from '../../components/SettingsKit';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { GrowTransition } from '../../components/transitions';
import { c, fileTypeColor, fonts, radius } from '../../theme/tokens';

type FieldKey = 'url' | 'token' | 'chatId' | 'server' | 'topic' | 'homeserver' | 'room' | 'instance' | 'secret';

interface FieldSpec {
  key: FieldKey;
  label: () => string;
  placeholder: string;
  helper: () => string;
  secret?: boolean;
  optional?: boolean;
  inputMode?: 'url' | 'text';
}

interface KindSpec {
  label: string;
  icon?: SimpleIcon;
  fields: FieldSpec[];
}

const KINDS: Record<AutoShareKind, KindSpec> = {
  discord: {
    label: 'Discord',
    icon: siDiscord,
    fields: [
      {
        key: 'url',
        label: () => t('Webhook-Adresse'),
        placeholder: 'https://discord.com/api/webhooks/…',
        helper: () => t('In Discord: Kanal bearbeiten, dann „Integrationen“, „Webhooks“ und „Webhook-URL kopieren“.'),
        secret: true,
        inputMode: 'url',
      },
    ],
  },
  slack: {
    label: 'Slack',
    fields: [
      {
        key: 'url',
        label: () => t('Webhook-Adresse'),
        placeholder: 'https://hooks.slack.com/services/…',
        helper: () => t('In Slack eine App mit „Incoming Webhooks“ anlegen und die Webhook-URL für den Kanal kopieren.'),
        secret: true,
        inputMode: 'url',
      },
    ],
  },
  telegram: {
    label: 'Telegram',
    icon: siTelegram,
    fields: [
      {
        key: 'token',
        label: () => t('Bot-Token'),
        placeholder: '123456789:AA…',
        helper: () => t('Bekommst du von @BotFather. Der Bot muss im Kanal oder in der Gruppe Mitglied sein.'),
        secret: true,
      },
      {
        key: 'chatId',
        label: () => t('Chat-ID'),
        placeholder: '-1001234567890',
        helper: () => t('Bei öffentlichen Kanälen der @Name, sonst die Zahl.'),
      },
    ],
  },
  ntfy: {
    label: 'ntfy',
    icon: siNtfy,
    fields: [
      {
        key: 'server',
        label: () => t('Server'),
        placeholder: 'https://ntfy.sh',
        helper: () => t('Leer lassen für ntfy.sh.'),
        optional: true,
        inputMode: 'url',
      },
      {
        key: 'topic',
        label: () => t('Thema'),
        placeholder: 'meine-uploads-x7q2',
        helper: () => t('Buchstaben, Ziffern, - und _. Wer das Thema kennt, liest mit, nimm also etwas schwer zu Ratendes.'),
      },
      {
        key: 'token',
        label: () => t('Zugangstoken (optional)'),
        placeholder: 'tk_…',
        helper: () => t('Nur für geschützte Themen nötig.'),
        secret: true,
        optional: true,
      },
    ],
  },
  matrix: {
    label: 'Matrix',
    icon: siMatrix,
    fields: [
      {
        key: 'homeserver',
        label: () => t('Homeserver'),
        placeholder: 'https://matrix.org',
        helper: () => t('Die Adresse des Servers, auf dem das Konto liegt.'),
        inputMode: 'url',
      },
      {
        key: 'room',
        label: () => t('Raum'),
        placeholder: '#uploads:matrix.org',
        helper: () => t('Die Raum-ID (!abc:server) oder ein Alias (#name:server).'),
      },
      {
        key: 'token',
        label: () => t('Zugangstoken'),
        placeholder: 'syt_…',
        helper: () => t('Am besten von einem eigenen Bot-Konto, das im Raum ist. In Element unter Einstellungen › Hilfe und Info.'),
        secret: true,
      },
    ],
  },
  mastodon: {
    label: 'Mastodon',
    icon: siMastodon,
    fields: [
      {
        key: 'instance',
        label: () => t('Instanz'),
        placeholder: 'https://mastodon.social',
        helper: () => t('Die Adresse deiner Mastodon-Instanz.'),
        inputMode: 'url',
      },
      {
        key: 'token',
        label: () => t('Zugangstoken'),
        placeholder: '',
        helper: () =>
          t('In Mastodon unter Einstellungen › Entwicklung eine Anwendung mit „write:statuses“ anlegen und das Token kopieren.'),
        secret: true,
      },
    ],
  },
  webhook: {
    label: t('Eigener Webhook'),
    fields: [
      {
        key: 'url',
        label: () => t('Adresse'),
        placeholder: 'https://example.com/hooks/moeshare',
        helper: () => t('Bekommt bei jedem passenden Upload ein JSON per POST, mit Link, Titel, Tags und Dateityp.'),
        inputMode: 'url',
      },
      {
        key: 'secret',
        label: () => t('Signatur-Schlüssel (optional)'),
        placeholder: '',
        helper: () => t('Damit signiert MoeShare jede Nachricht. Der Empfänger prüft den Header X-Webhook-Signature (sha256=…).'),
        secret: true,
        optional: true,
      },
    ],
  },
};

const KIND_ORDER: AutoShareKind[] = ['discord', 'slack', 'telegram', 'ntfy', 'matrix', 'mastodon', 'webhook'];

const TYPE_LABELS: Record<FileType, () => string> = {
  image: () => t('Bilder'),
  video: () => t('Videos'),
  audio: () => t('Audio'),
  text: () => t('Texte'),
  file: () => t('Andere Dateien'),
};

const TYPE_COLORS: Record<FileType, string> = {
  image: fileTypeColor.image,
  video: fileTypeColor.video,
  audio: fileTypeColor.audio,
  text: fileTypeColor.text,
  file: fileTypeColor.other,
};

const VISIBILITY_LABELS: Record<MastodonVisibility, () => string> = {
  public: () => t('Öffentlich'),
  unlisted: () => t('Nicht gelistet'),
  private: () => t('Nur für Follower'),
};

const PLACEHOLDERS = {
  de: ['link', 'titel', 'beschreibung', 'datei', 'tags', 'konto'],
  en: ['link', 'title', 'description', 'file', 'tags', 'account'],
} as const;

const ALIASES: Record<string, string> = { title: 'titel', description: 'beschreibung', file: 'datei', account: 'konto' };

function KindIcon({ kind, size = 22 }: { kind: AutoShareKind; size?: number }) {
  const icon = KINDS[kind].icon;
  if (kind === 'webhook') return <WebhookRounded sx={{ fontSize: size }} />;
  if (!icon) return <ForumOutlined sx={{ fontSize: size }} />;
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: size, height: size, fill: 'currentColor', flexShrink: 0 }}>
      <path d={icon.path} />
    </Box>
  );
}

export function autoShareError(value: string) {
  const status = /^HTTP (\d{3})$/.exec(value);
  if (status) {
    const code = Number(status[1]);
    if (code === 401 || code === 403) return t('Zugang verweigert (HTTP {status}). Prüf das Token.', { status: code });
    if (code === 404 || code === 410)
      return t('Ziel nicht gefunden (HTTP {status}). Gibt es den Kanal oder Webhook noch?', { status: code });
    if (code === 429) return t('Zu viele Nachrichten (HTTP {status}). Es geht gleich weiter.', { status: code });
    return t('Der Dienst antwortete mit HTTP {status}.', { status: code });
  }
  if (value === 'ENOTFOUND' || value === 'EAI_AGAIN') return t('Server nicht gefunden.');
  if (value === 'ECONNREFUSED') return t('Verbindung abgelehnt.');
  if (value === 'ETIMEDOUT' || value === 'ECONNABORTED') return t('Keine Antwort, Zeit überschritten.');
  if (value === 'ECONNRESET') return t('Verbindung abgebrochen.');
  if (value === 'EPRIVATE') return t('Adressen im internen Netz sind gesperrt.');
  if (value === 'Den Matrix-Raum gibt es nicht.') return t('Den Matrix-Raum gibt es nicht.');
  if (value === 'Das Ziel ließ sich nicht entschlüsseln.')
    return t('Das Ziel ließ sich nicht entschlüsseln. Trag die Zugangsdaten neu ein.');
  return value;
}

function filterText(rule: AutoShareRule) {
  const parts: string[] = [];
  if (rule.tag) parts.push(t('nur #{tag}', { tag: rule.tag }));
  if (rule.types.length) parts.push(rule.types.map((type) => TYPE_LABELS[type]()).join(', '));
  return parts.length ? parts.join(' · ') : t('jeder neue Upload');
}

function renderPreview(template: string, values: Record<string, string>) {
  return template
    .replace(/\{([a-zäöüß]+)\}/gi, (match, name: string) => {
      const key = ALIASES[name.toLowerCase()] || name.toLowerCase();
      return key in values ? values[key] : match;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Draft {
  kind: AutoShareKind;
  name: string;
  tag: string;
  types: FileType[];
  custom: boolean;
  template: string;
  visibility: MastodonVisibility;
  fields: Record<FieldKey, string>;
}

const emptyFields = (): Record<FieldKey, string> => ({
  url: '',
  token: '',
  chatId: '',
  server: '',
  topic: '',
  homeserver: '',
  room: '',
  instance: '',
  secret: '',
});

function draftOf(rule: AutoShareRule | null, kind: AutoShareKind): Draft {
  const fields = emptyFields();
  if (rule?.kind === 'telegram' && rule.hint) fields.chatId = rule.hint;
  if (rule?.kind === 'matrix' && rule.hint) fields.room = rule.hint;
  if (rule?.kind === 'ntfy' && rule.hint) {
    const [topic] = rule.hint.split(' @ ');
    fields.topic = topic;
  }
  return {
    kind: rule?.kind || kind,
    name: rule?.name || '',
    tag: rule?.tag || '',
    types: rule?.types || [],
    custom: Boolean(rule?.template),
    template: rule?.template || '',
    visibility: rule?.visibility || 'public',
    fields,
  };
}

function RuleDialog({
  open,
  rule,
  tags,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: AutoShareRule | null;
  tags: TagCount[];
  onClose: () => void;
  onSaved: (rule: AutoShareRule, created: boolean) => void;
}) {
  const boot = useMemo(() => readBoot<AccountBoot>(), []);
  const [draft, setDraft] = useState<Draft>(() => draftOf(rule, 'discord'));
  const [initial, setInitial] = useState<Record<FieldKey, string>>(emptyFields);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [error, setError] = useState('');
  const templateRef = useRef<HTMLTextAreaElement | null>(null);
  const caret = useRef<{ start: number; end: number } | null>(null);
  const pending = useRef<number | null>(null);
  const editing = Boolean(rule);
  const spec = KINDS[draft.kind];
  const names = PLACEHOLDERS[language];

  useEffect(() => {
    if (!open) return;
    const next = draftOf(rule, 'discord');
    caret.current = null;
    setDraft(next);
    setInitial(next.fields);
    setFieldError(null);
    setError('');
  }, [open, rule]);

  const sample = useMemo(
    () => ({
      link: `${boot.site.baseUrl || window.location.origin}/view/aB3dE6`,
      titel: t('Sonnenuntergang am See'),
      beschreibung: t('Gestern Abend vom Steg aus.'),
      datei: 'IMG_2041.jpg',
      tags: language === 'en' ? '#vacation #lake' : '#urlaub #see',
      konto: boot.user?.username || 'du',
    }),
    [boot]
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setField = (key: FieldKey, value: string) => {
    setDraft((current) => ({ ...current, fields: { ...current.fields, [key]: value } }));
    if (fieldError?.field === key) setFieldError(null);
  };

  const remember = (element: HTMLTextAreaElement) => {
    caret.current = { start: element.selectionStart, end: element.selectionEnd };
  };

  const insert = (name: string) => {
    const token = `{${name}}`;
    const value = draft.template;
    const start = Math.min(caret.current?.start ?? value.length, value.length);
    const end = Math.min(Math.max(caret.current?.end ?? value.length, start), value.length);
    const next = value.slice(0, start) + token + value.slice(end);
    const position = start + token.length;
    caret.current = { start: position, end: position };
    pending.current = position;
    set('template', next);
  };

  useLayoutEffect(() => {
    const element = templateRef.current;
    const position = pending.current;
    if (!element || position === null) return;
    pending.current = null;
    element.focus();
    element.setSelectionRange(position, position);
  }, [draft.template]);

  const missing = !editing && spec.fields.some((field) => !field.optional && !draft.fields[field.key].trim());
  const templateMissingLink = draft.custom && draft.template.trim() !== '' && !/\{link\}/i.test(draft.template);

  const save = async () => {
    const input: AutoShareInput = {
      name: draft.name.trim() || null,
      tag: draft.tag.trim().replace(/^#/, '') || null,
      types: draft.types,
      template: draft.custom && draft.template.trim() ? draft.template : null,
    };
    for (const field of spec.fields) {
      const value = draft.fields[field.key].trim();
      if (!editing || (value && value !== initial[field.key].trim())) input[field.key] = value;
    }
    if (draft.kind === 'mastodon' && (!editing || draft.visibility !== (rule?.visibility || 'public'))) input.visibility = draft.visibility;
    if (!editing) input.kind = draft.kind;
    setBusy(true);
    setFieldError(null);
    setError('');
    try {
      const result = rule ? await updateAutoShare(rule.id, input) : await createAutoShare(input);
      onSaved(result.rule, !rule);
      onClose();
    } catch (failure) {
      if (failure instanceof ApiError && failure.field) setFieldError({ field: failure.field, message: failure.message });
      else setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : '');

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="autoshare-dialog-title"
    >
      <DialogTitle id="autoshare-dialog-title">{editing ? t('Regel bearbeiten') : t('Neue Regel')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2.25, pt: 0.5 }}>
          {!editing && (
            <Box
              role="radiogroup"
              aria-label={t('Ziel')}
              sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1 }}
            >
              {KIND_ORDER.map((kind) => {
                const selected = draft.kind === kind;
                return (
                  <ButtonBase
                    key={kind}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      set('kind', kind);
                      setFieldError(null);
                    }}
                    sx={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      gap: 1.25,
                      px: 1.5,
                      py: 1.25,
                      borderRadius: `${radius.md}px`,
                      border: `1px solid ${selected ? c.primary : c.outlineVariant}`,
                      bgcolor: selected ? c.primaryContainer : 'transparent',
                      color: selected ? c.onPrimaryContainer : 'text.primary',
                      fontWeight: 600,
                      fontSize: '0.9375rem',
                      transition: 'background-color 150ms, border-color 150ms',
                      '&:hover': { bgcolor: selected ? c.primaryContainer : c.surfaceContainerHigh },
                      '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
                    }}
                  >
                    <KindIcon kind={kind} size={20} />
                    {KINDS[kind].label}
                  </ButtonBase>
                );
              })}
            </Box>
          )}
          {editing && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'text.secondary' }}>
              <KindIcon kind={draft.kind} />
              <Typography variant="body2">
                {rule?.hint ? t('{service}, Ziel {hint}', { service: spec.label, hint: rule.hint }) : spec.label}
              </Typography>
            </Box>
          )}

          {spec.fields.map((field) => (
            <TextField
              key={`${draft.kind}-${field.key}`}
              id={`autoshare-${field.key}`}
              label={field.label()}
              placeholder={field.placeholder}
              value={draft.fields[field.key]}
              onChange={(event) => setField(field.key, event.target.value)}
              error={Boolean(errorFor(field.key))}
              helperText={
                errorFor(field.key) ||
                (editing && (field.secret || !initial[field.key])
                  ? t('Leer lassen, um den gespeicherten Wert zu behalten.')
                  : field.helper())
              }
              type={field.secret && (field.key === 'token' || field.key === 'secret') ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              slotProps={{ htmlInput: { inputMode: field.inputMode || 'text', style: { fontFamily: fonts.mono, fontSize: '0.875rem' } } }}
              fullWidth
            />
          ))}

          {draft.kind === 'mastodon' && (
            <TextField
              select
              id="autoshare-visibility"
              label={t('Sichtbarkeit der Beiträge')}
              value={draft.visibility}
              onChange={(event) => set('visibility', event.target.value as MastodonVisibility)}
              error={Boolean(errorFor('visibility'))}
              helperText={errorFor('visibility') || undefined}
              sx={{ maxWidth: { sm: 320 } }}
            >
              {(Object.keys(VISIBILITY_LABELS) as MastodonVisibility[]).map((key) => (
                <MenuItem key={key} value={key}>
                  {VISIBILITY_LABELS[key]()}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            id="autoshare-name"
            label={t('Name (optional)')}
            placeholder={t('z. B. Fotos für die Gruppe')}
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            fullWidth
          />

          <Box>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
              {t('Was geteilt wird')}
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <TextField
                id="autoshare-tag"
                label={t('Nur Uploads mit diesem Tag')}
                value={draft.tag}
                onChange={(event) => {
                  set('tag', event.target.value);
                  if (fieldError?.field === 'tag') setFieldError(null);
                }}
                error={Boolean(errorFor('tag'))}
                helperText={errorFor('tag') || t('Leer lassen, um jeden Upload zu teilen.')}
                autoComplete="off"
                slotProps={{
                  htmlInput: { list: 'autoshare-tags' },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SellOutlined fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ maxWidth: { sm: 360 } }}
              />
              <datalist id="autoshare-tags">
                {tags.map((entry) => (
                  <option key={entry.tag} value={entry.tag} />
                ))}
              </datalist>
              <Box role="group" aria-label={t('Dateitypen')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {(Object.keys(TYPE_LABELS) as FileType[]).map((type) => {
                  const on = draft.types.includes(type);
                  return (
                    <Chip
                      key={type}
                      label={TYPE_LABELS[type]()}
                      clickable
                      aria-pressed={on}
                      variant={on ? 'filled' : 'outlined'}
                      onClick={() => set('types', on ? draft.types.filter((entry) => entry !== type) : [...draft.types, type])}
                      icon={
                        <Box
                          component="span"
                          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `${TYPE_COLORS[type]} !important` }}
                        />
                      }
                      sx={on ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, fontWeight: 600 } : undefined}
                    />
                  );
                })}
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: -0.75 }}>
                {draft.types.length ? t('Nur die gewählten Dateitypen.') : t('Kein Typ gewählt: alle Dateitypen.')}
              </Typography>
            </Box>
          </Box>

          <Box>
            <FormControlLabel
              control={<Switch checked={draft.custom} onChange={(event) => set('custom', event.target.checked)} />}
              label={t('Eigene Nachricht')}
            />
            <Collapse in={draft.custom} unmountOnExit>
              <Box sx={{ display: 'grid', gap: 1.25, pt: 1 }}>
                <TextField
                  id="autoshare-template"
                  label={t('Vorlage')}
                  value={draft.template}
                  onChange={(event) => {
                    set('template', event.target.value);
                    remember(event.target as HTMLTextAreaElement);
                    if (fieldError?.field === 'template') setFieldError(null);
                  }}
                  onSelect={(event) => remember(event.target as HTMLTextAreaElement)}
                  onKeyUp={(event) => remember(event.target as HTMLTextAreaElement)}
                  inputRef={templateRef}
                  multiline
                  minRows={3}
                  maxRows={10}
                  placeholder={language === 'en' ? 'New from {account}: {title}\n{link}' : 'Neu von {konto}: {titel}\n{link}'}
                  error={Boolean(errorFor('template')) || templateMissingLink}
                  helperText={
                    errorFor('template') ||
                    (templateMissingLink
                      ? t('Die Vorlage braucht den Platzhalter {link}.')
                      : t('{count} von 1000 Zeichen', { count: draft.template.length }))
                  }
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                  fullWidth
                />
                <Box role="group" aria-label={t('Platzhalter einfügen')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {names.map((name) => (
                    <Chip key={name} size="small" label={`{${name}}`} onClick={() => insert(name)} sx={{ fontFamily: fonts.mono }} />
                  ))}
                </Box>
                {draft.template.trim() && (
                  <Box
                    aria-label={t('Vorschau')}
                    sx={{
                      p: 1.5,
                      borderRadius: `${radius.md}px`,
                      bgcolor: c.surfaceContainerHighest,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '0.875rem',
                    }}
                  >
                    <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 0.5 }}>
                      {t('Vorschau mit Beispielwerten')}
                    </Typography>
                    {renderPreview(draft.template, sample)}
                  </Box>
                )}
              </Box>
            </Collapse>
            {!draft.custom && (
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
                {t('Ohne eigene Nachricht gehen der Titel (falls vorhanden) und der Link raus.')}
              </Typography>
            )}
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={busy || missing || templateMissingLink}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {editing ? t('Speichern') : t('Regel anlegen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RuleRow({
  rule,
  busy,
  onToggle,
  onTest,
  onEdit,
  onRemove,
}: {
  rule: AutoShareRule;
  busy: string | null;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const spec = KINDS[rule.kind];
  const working = busy !== null && busy.endsWith(`:${rule.id}`);
  let status: ReactNode;
  if (rule.lastError) {
    status = (
      <Alert severity={rule.enabled ? 'warning' : 'error'} sx={{ mt: 1.25, py: 0 }}>
        {rule.enabled
          ? t('Letzter Fehler: {error}', { error: autoShareError(rule.lastError) })
          : t('Nach Fehlern pausiert: {error} Prüf die Angaben und schalte die Regel wieder ein.', {
              error: autoShareError(rule.lastError),
            })}
      </Alert>
    );
  } else {
    status = (
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
        {rule.lastSuccessAt
          ? t('Zuletzt geteilt {when}', { when: relativeMs(rule.lastSuccessAt) })
          : t('Bisher wurde noch nichts geteilt.')}
      </Typography>
    );
  }
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }} data-rule={rule.id}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box
          sx={{ color: rule.enabled ? c.onSurface : c.onSurfaceVariant, mt: 0.25, display: 'flex', opacity: rule.enabled ? 1 : 0.6 }}
          aria-hidden
        >
          <KindIcon kind={rule.kind} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.9375rem', overflowWrap: 'anywhere' }}>
            {rule.name || spec.label}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {[rule.name ? spec.label : '', rule.hint || '', filterText(rule)].filter(Boolean).join(' · ')}
            {rule.template ? ` · ${t('eigene Nachricht')}` : ''}
          </Typography>
          {status}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, ml: -1 }}>
            <Button
              size="small"
              startIcon={working && busy?.startsWith('test') ? <CircularProgress size={14} /> : <SendRounded />}
              onClick={onTest}
              disabled={Boolean(busy)}
            >
              {t('Testen')}
            </Button>
            <Button size="small" startIcon={<EditOutlined />} onClick={onEdit} disabled={Boolean(busy)}>
              {t('Bearbeiten')}
            </Button>
            <Button size="small" color="error" startIcon={<DeleteOutlineRounded />} onClick={onRemove} disabled={Boolean(busy)}>
              {t('Entfernen')}
            </Button>
          </Box>
        </Box>
        <Tooltip title={rule.enabled ? t('Regel ausschalten') : t('Regel einschalten')}>
          <Switch
            checked={rule.enabled}
            onChange={(event) => onToggle(event.target.checked)}
            disabled={Boolean(busy)}
            slotProps={{ input: { 'aria-label': t('{name} aktiv', { name: rule.name || spec.label }) } }}
          />
        </Tooltip>
      </Box>
    </Box>
  );
}

export function AutoShareSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [available, setAvailable] = useState(false);
  const [rules, setRules] = useState<AutoShareRule[]>([]);
  const [max, setMax] = useState(10);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [dialog, setDialog] = useState<{ rule: AutoShareRule | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchAutoShare()
      .then((result) => {
        setAvailable(result.enabled);
        setRules(result.rules);
        setMax(result.max);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!dialog) return;
    fetchTags()
      .then((result) => setTags(result.tags))
      .catch(() => {});
  }, [dialog]);

  if (!available) return null;

  const replace = (next: AutoShareRule) => setRules((list) => list.map((entry) => (entry.id === next.id ? next : entry)));
  const reload = () =>
    fetchAutoShare()
      .then((result) => setRules(result.rules))
      .catch(() => {});

  const toggle = async (rule: AutoShareRule, enabled: boolean) => {
    replace({ ...rule, enabled });
    setBusy(`toggle:${rule.id}`);
    try {
      replace((await updateAutoShare(rule.id, { enabled })).rule);
    } catch (failure) {
      replace(rule);
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const test = async (rule: AutoShareRule) => {
    setBusy(`test:${rule.id}`);
    try {
      replace((await testAutoShare(rule.id)).rule);
      toast(t('Testnachricht gesendet. Schau nach, ob sie angekommen ist.'), { variant: 'success' });
    } catch (failure) {
      await reload();
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (rule: AutoShareRule) => {
    const ok = await confirm({
      title: t('Regel entfernen?'),
      message: t('Neue Uploads werden dann nicht mehr an {service} geschickt. Webhooks und Tokens beim Dienst selbst bleiben bestehen.', {
        service: KINDS[rule.kind].label,
      }),
      confirmLabel: t('Entfernen'),
      icon: <DeleteOutlineRounded />,
    });
    if (!ok) return;
    setBusy(`remove:${rule.id}`);
    try {
      await deleteAutoShare(rule.id);
      setRules((list) => list.filter((entry) => entry.id !== rule.id));
      toast(t('Regel entfernt'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const full = rules.length >= max;

  return (
    <SettingsSection
      id="automatisch-teilen"
      title={t('Automatisch teilen')}
      description={t(
        'Neue Uploads landen von selbst als Link bei Discord, Slack, Telegram, ntfy, Matrix oder Mastodon. Dateien mit Passwort, Aufruflimit oder Ende-zu-Ende-Verschlüsselung werden nie geteilt, geplante erst, wenn sie erscheinen.'
      )}
      action={
        rules.length > 0 ? (
          <Tooltip title={full ? t('Höchstens {count} Regeln', { count: max }) : ''}>
            <span>
              <Button variant="tonal" startIcon={<AddRounded />} onClick={() => setDialog({ rule: null })} disabled={full}>
                {t('Regel hinzufügen')}
              </Button>
            </span>
          </Tooltip>
        ) : undefined
      }
    >
      {rules.length === 0 ? (
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 3, display: 'grid', gap: 2, justifyItems: 'start' }}>
          <Box sx={{ display: 'flex', gap: 1.5, color: c.onSurfaceVariant }} aria-hidden>
            {KIND_ORDER.map((kind) => (
              <KindIcon key={kind} kind={kind} />
            ))}
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 560 }}>
            {t('Leg eine Regel an, und jeder passende Upload wird geteilt. Mit Tag und Dateityp bestimmst du, was wohin geht.')}
          </Typography>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog({ rule: null })}>
            {t('Erste Regel anlegen')}
          </Button>
        </Box>
      ) : (
        rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            busy={busy}
            onToggle={(enabled) => toggle(rule, enabled)}
            onTest={() => test(rule)}
            onEdit={() => setDialog({ rule })}
            onRemove={() => remove(rule)}
          />
        ))
      )}
      <RuleDialog
        open={Boolean(dialog)}
        rule={dialog?.rule ?? null}
        tags={tags}
        onClose={() => setDialog(null)}
        onSaved={(saved, created) => {
          setRules((list) => (created ? [...list, saved] : list.map((entry) => (entry.id === saved.id ? saved : entry))));
          toast(created ? t('Regel angelegt. Mit „Testen“ prüfst du, ob alles ankommt.') : t('Gespeichert'), { variant: 'success' });
        }}
      />
    </SettingsSection>
  );
}
