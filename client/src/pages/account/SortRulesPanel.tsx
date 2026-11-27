import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FilterAltOutlined from '@mui/icons-material/FilterAltOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import StarRounded from '@mui/icons-material/StarRounded';
import type { AccountOverview, Album, ExpiryChoice, SortRule, SortRuleInput, SortSource, SortTestResult, SortType } from '../../lib/types';
import {
  ApiError,
  createSortRule,
  deleteSortRule,
  errorMessage,
  fetchSortRules,
  listAlbums,
  reorderSortRules,
  testSortRules,
  updateSortRule,
} from '../../lib/api';
import { formatBytes, relativeMs } from '../../lib/format';
import { t } from '../../lib/i18n';
import { SettingsSection } from '../../components/SettingsKit';
import { ExpirySelect, expiryLabel } from '../../components/ShareOptions';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, fileTypeColor, fonts, radius } from '../../theme/tokens';

const MB = 1024 * 1024;

const TYPE_LABELS: Record<SortType, () => string> = {
  image: () => t('Bilder'),
  video: () => t('Videos'),
  audio: () => t('Audio'),
  text: () => t('Texte'),
  file: () => t('Andere Dateien'),
};

const TYPE_COLORS: Record<SortType, string> = {
  image: fileTypeColor.image,
  video: fileTypeColor.video,
  audio: fileTypeColor.audio,
  text: fileTypeColor.text,
  file: fileTypeColor.other,
};

const SOURCE_LABELS: Record<SortSource, () => string> = {
  browser: () => t('Im Browser'),
  token: () => t('ShareX und API'),
  telegram: () => t('Telegram'),
  discord: () => t('Discord'),
  phone: () => t('Vom Handy'),
  request: () => t('Datei-Anfragen'),
};

interface Draft {
  name: string;
  enabled: boolean;
  types: SortType[];
  extensions: string;
  names: string;
  sources: SortSource[];
  tokens: number[];
  minSize: string;
  maxSize: string;
  album: number | '';
  tags: string;
  expires: ExpiryChoice | '';
  warn: boolean;
  warning: string;
  star: boolean;
  stopAfter: boolean;
}

const EMPTY: Draft = {
  name: '',
  enabled: true,
  types: [],
  extensions: '',
  names: '',
  sources: [],
  tokens: [],
  minSize: '',
  maxSize: '',
  album: '',
  tags: '',
  expires: '',
  warn: false,
  warning: '',
  star: false,
  stopAfter: false,
};

const megabytes = (bytes: number | null) => (bytes === null ? '' : String(Math.round((bytes / MB) * 100) / 100));
const bytesOf = (value: string) => {
  const number = Number(value.replace(',', '.'));
  return value.trim() === '' || !Number.isFinite(number) ? null : Math.round(number * MB);
};

function draftOf(rule: SortRule | null): Draft {
  if (!rule) return EMPTY;
  const { conditions: when, actions: then } = rule;
  return {
    name: rule.name,
    enabled: rule.enabled,
    types: when.types,
    extensions: when.extensions.join(', '),
    names: when.names.join('\n'),
    sources: when.sources,
    tokens: when.tokens,
    minSize: megabytes(when.minSize),
    maxSize: megabytes(when.maxSize),
    album: then.album ?? '',
    tags: then.tags.join(', '),
    expires: then.expires ?? '',
    warn: then.warning !== null,
    warning: then.warning ?? '',
    star: then.star,
    stopAfter: rule.stopAfter,
  };
}

function inputOf(draft: Draft): SortRuleInput {
  return {
    name: draft.name.trim(),
    enabled: draft.enabled,
    conditions: {
      types: draft.types,
      extensions: draft.extensions
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
      names: draft.names,
      sources: draft.sources,
      tokens: draft.sources.length === 0 || draft.sources.includes('token') ? draft.tokens : [],
      minSize: bytesOf(draft.minSize),
      maxSize: bytesOf(draft.maxSize),
    },
    actions: {
      album: draft.album === '' ? null : draft.album,
      tags: draft.tags
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      expires: draft.expires || null,
      warning: draft.warn ? draft.warning.trim() : null,
      star: draft.star,
    },
    stopAfter: draft.stopAfter,
  };
}

function whenParts(rule: SortRule, tokens: AccountOverview['tokens']): string[] {
  const when = rule.conditions;
  const parts: string[] = [];
  if (when.types.length) parts.push(when.types.map((type) => TYPE_LABELS[type]()).join(', '));
  if (when.extensions.length) parts.push(when.extensions.map((ext) => `.${ext}`).join(' '));
  if (when.names.length) parts.push(t('Name wie {patterns}', { patterns: when.names.map((name) => `„${name}“`).join(', ') }));
  if (when.sources.length) parts.push(when.sources.map((source) => SOURCE_LABELS[source]()).join(', '));
  if (when.tokens.length) {
    const names = when.tokens.map((id) => tokens.find((token) => token.id === id)?.name || `#${id}`);
    parts.push(t('Zugang {names}', { names: names.join(', ') }));
  }
  if (when.minSize !== null && when.maxSize !== null)
    parts.push(t('{min} bis {max}', { min: formatBytes(when.minSize), max: formatBytes(when.maxSize) }));
  else if (when.minSize !== null) parts.push(t('ab {size}', { size: formatBytes(when.minSize) }));
  else if (when.maxSize !== null) parts.push(t('bis {size}', { size: formatBytes(when.maxSize) }));
  return parts.length ? parts : [t('jeder Upload')];
}

function thenParts(rule: SortRule): string[] {
  const then = rule.actions;
  const parts: string[] = [];
  if (then.album) parts.push(rule.album ? t('Album „{title}“', { title: rule.album.title }) : t('Album gelöscht'));
  if (then.tags.length) parts.push(then.tags.map((tag) => `#${tag}`).join(' '));
  if (then.expires)
    parts.push(then.expires === 'never' ? t('läuft nie ab') : t('löschen nach {time}', { time: expiryLabel(then.expires) }));
  if (then.warning !== null) parts.push(then.warning ? t('Warnung „{text}“', { text: then.warning }) : t('Inhaltswarnung'));
  if (then.star) parts.push(t('Favorit'));
  return parts;
}

function Clause({ label, parts }: { label: string; parts: string[] }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
      <Typography
        component="span"
        variant="caption"
        sx={{ fontWeight: 700, color: c.onSurfaceVariant, width: 44, flexShrink: 0, textAlign: 'right' }}
      >
        {label}
      </Typography>
      <Typography component="span" variant="body2" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>
        {parts.join(' · ')}
      </Typography>
    </Box>
  );
}

function ToggleChips<T extends string>({
  label,
  values,
  selected,
  labels,
  colors,
  onChange,
}: {
  label: string;
  values: T[];
  selected: T[];
  labels: Record<T, () => string>;
  colors?: Record<T, string>;
  onChange: (next: T[]) => void;
}) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {values.map((value) => {
        const on = selected.includes(value);
        return (
          <Chip
            key={value}
            label={labels[value]()}
            clickable
            aria-pressed={on}
            variant={on ? 'filled' : 'outlined'}
            onClick={() => onChange(on ? selected.filter((entry) => entry !== value) : [...selected, value])}
            icon={
              colors ? (
                <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `${colors[value]} !important` }} />
              ) : undefined
            }
            sx={on ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, fontWeight: 600 } : undefined}
          />
        );
      })}
    </Box>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <Box role="group" aria-labelledby={id} sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box>
        <Typography id={id} variant="subtitle2" component="h3">
          {title}
        </Typography>
        {hint && (
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
            {hint}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}

function RuleDialog({
  open,
  rule,
  account,
  sources,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: SortRule | null;
  account: AccountOverview;
  sources: SortSource[];
  onClose: () => void;
  onSaved: (rule: SortRule, created: boolean) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(draftOf(rule));
    setFieldError(null);
    listAlbums()
      .then((result) => setAlbums(result.albums.filter((album) => !album.rule)))
      .catch(() => setAlbums([]));
  }, [open, rule]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldError(null);
  };
  const errorFor = (...fields: string[]) => (fieldError && fields.includes(fieldError.field) ? fieldError.message : '');
  const tokensShown = account.tokens.length > 0 && (draft.sources.length === 0 || draft.sources.includes('token'));
  const nothingToDo = draft.album === '' && !draft.tags.trim() && !draft.expires && !draft.warn && !draft.star;

  const save = async () => {
    setBusy(true);
    try {
      const input = inputOf(draft);
      const saved = rule ? (await updateSortRule(rule.id, input)).rule : (await createSortRule(input)).rule;
      onSaved(saved, !rule);
      onClose();
    } catch (failure) {
      if (failure instanceof ApiError && failure.field) setFieldError({ field: failure.field, message: failure.message });
      else toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="sort-rule-title">
      <DialogTitle id="sort-rule-title">{rule ? t('Regel bearbeiten') : t('Neue Sortierregel')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 3, pt: 1 }}>
          <TextField
            id="sort-rule-name"
            label={t('Name')}
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            error={Boolean(errorFor('name'))}
            helperText={errorFor('name') || t('Zum Beispiel „Screenshots ins Album“.')}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            autoFocus
            fullWidth
          />

          <Group title={t('Wenn')} hint={t('Alles, was du ausfüllst, muss zutreffen. Leere Felder gelten immer.')}>
            <ToggleChips
              label={t('Dateitypen')}
              values={Object.keys(TYPE_LABELS) as SortType[]}
              selected={draft.types}
              labels={TYPE_LABELS}
              colors={TYPE_COLORS}
              onChange={(next) => set('types', next)}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                id="sort-rule-extensions"
                label={t('Dateiendungen')}
                placeholder="png, jpg"
                value={draft.extensions}
                onChange={(event) => set('extensions', event.target.value)}
                error={Boolean(errorFor('extensions'))}
                helperText={errorFor('extensions') || t('Mit Komma getrennt')}
                size="small"
                slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off' } }}
              />
              <TextField
                id="sort-rule-names"
                label={t('Dateiname passt zu')}
                placeholder="Screenshot*"
                value={draft.names}
                onChange={(event) => set('names', event.target.value)}
                error={Boolean(errorFor('names'))}
                helperText={errorFor('names') || t('* steht für beliebig viele Zeichen, ? für eins. Eins pro Zeile.')}
                size="small"
                multiline
                maxRows={4}
                slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off', style: { fontFamily: fonts.mono } } }}
              />
            </Box>
            <Box>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 0.75 }}>
                {t('Hochgeladen über')}
              </Typography>
              <ToggleChips
                label={t('Hochgeladen über')}
                values={sources}
                selected={draft.sources}
                labels={SOURCE_LABELS}
                onChange={(next) => set('sources', next)}
              />
            </Box>
            {tokensShown && (
              <TextField
                id="sort-rule-tokens"
                select
                size="small"
                label={t('Nur diese Zugänge')}
                value={draft.tokens.map(String)}
                onChange={(event) => {
                  const value = event.target.value as unknown as string[] | string;
                  set('tokens', (Array.isArray(value) ? value : value.split(',')).map(Number).filter(Boolean));
                }}
                error={Boolean(errorFor('tokens'))}
                helperText={errorFor('tokens') || t('Leer lassen, um jeden Zugang einzuschließen.')}
                slotProps={{
                  select: {
                    multiple: true,
                    renderValue: (selected) =>
                      (selected as string[])
                        .map((id) => account.tokens.find((token) => String(token.id) === id)?.name || `#${id}`)
                        .join(', '),
                  },
                }}
              >
                {account.tokens.map((token) => (
                  <MenuItem key={token.id} value={String(token.id)}>
                    {token.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField
                id="sort-rule-min"
                label={t('Mindestens')}
                value={draft.minSize}
                onChange={(event) => set('minSize', event.target.value)}
                error={Boolean(errorFor('minSize'))}
                helperText={errorFor('minSize')}
                size="small"
                slotProps={{
                  htmlInput: { inputMode: 'decimal' },
                  input: { endAdornment: <InputAdornment position="end">MB</InputAdornment> },
                }}
              />
              <TextField
                id="sort-rule-max"
                label={t('Höchstens')}
                value={draft.maxSize}
                onChange={(event) => set('maxSize', event.target.value)}
                error={Boolean(errorFor('maxSize'))}
                helperText={errorFor('maxSize')}
                size="small"
                slotProps={{
                  htmlInput: { inputMode: 'decimal' },
                  input: { endAdornment: <InputAdornment position="end">MB</InputAdornment> },
                }}
              />
            </Box>
          </Group>

          <Group title={t('Dann')} hint={t('Was du beim Hochladen selbst angibst, hat immer Vorrang.')}>
            <TextField
              id="sort-rule-album"
              select
              size="small"
              label={t('In dieses Album')}
              value={albums === null ? '' : draft.album}
              onChange={(event) => set('album', event.target.value === '' ? '' : Number(event.target.value))}
              error={Boolean(errorFor('album'))}
              helperText={errorFor('album') || (albums && albums.length === 0 ? t('Du hast noch kein Album, in das Uploads passen.') : '')}
              disabled={albums === null}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">{t('Kein Album')}</MenuItem>
              {(albums || []).map((album) => (
                <MenuItem key={album.id} value={album.id}>
                  {album.title}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              id="sort-rule-tags"
              size="small"
              label={t('Tags hinzufügen')}
              placeholder={t('arbeit, screenshot')}
              value={draft.tags}
              onChange={(event) => set('tags', event.target.value)}
              error={Boolean(errorFor('tags'))}
              helperText={errorFor('tags') || t('Mit Komma getrennt')}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SellOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <ExpirySelect
              label={t('Ablaufzeit')}
              value={draft.expires}
              max={account.choices.maxExpiry}
              includeDefault={t('Nicht ändern')}
              onChange={(value) => set('expires', value)}
            />
            <Box>
              <FormControlLabel
                control={<Switch checked={draft.warn} onChange={(event) => set('warn', event.target.checked)} />}
                label={t('Mit Inhaltswarnung')}
              />
              {draft.warn && (
                <TextField
                  id="sort-rule-warning"
                  size="small"
                  fullWidth
                  label={t('Hinweis (freiwillig)')}
                  value={draft.warning}
                  onChange={(event) => set('warning', event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  sx={{ mt: 1 }}
                />
              )}
            </Box>
            <FormControlLabel
              control={<Switch checked={draft.star} onChange={(event) => set('star', event.target.checked)} />}
              label={t('Als Favorit markieren')}
            />
            {nothingToDo && (
              <Typography variant="caption" sx={{ color: errorFor('actions') ? c.error : 'text.secondary', mt: -0.5 }}>
                {errorFor('actions') || t('Wähle mindestens eine Aktion.')}
              </Typography>
            )}
          </Group>

          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <FormControlLabel
              control={<Switch checked={draft.stopAfter} onChange={(event) => set('stopAfter', event.target.checked)} />}
              label={t('Danach keine weiteren Regeln prüfen')}
            />
            <FormControlLabel
              control={<Switch checked={draft.enabled} onChange={(event) => set('enabled', event.target.checked)} />}
              label={t('Regel ist aktiv')}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={busy || !draft.name.trim() || nothingToDo}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {rule ? t('Speichern') : t('Regel anlegen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function outcomeParts(result: SortTestResult): string[] {
  const parts: string[] = [];
  if (result.album) parts.push(t('ins Album'));
  if (result.tags.length) parts.push(result.tags.map((tag) => `#${tag}`).join(' '));
  if (result.expires)
    parts.push(result.expires === 'never' ? t('läuft nie ab') : t('löschen nach {time}', { time: expiryLabel(result.expires) }));
  if (result.warning !== null) parts.push(t('Inhaltswarnung'));
  if (result.star) parts.push(t('Favorit'));
  return parts;
}

function TestBox({ sources, rules }: { sources: SortSource[]; rules: SortRule[] }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState<SortSource | ''>('');
  const [size, setSize] = useState('');
  const [result, setResult] = useState<SortTestResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!name.trim()) {
      setResult(null);
      setError('');
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      testSortRules({ name: name.trim(), size: bytesOf(size) ?? 0, source: source || null })
        .then((next) => {
          if (cancelled) return;
          setResult(next);
          setError('');
        })
        .catch((failure) => {
          if (!cancelled) setError(errorMessage(failure));
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [name, source, size, rules]);

  const albumTitle = result && result.album ? rules.find((rule) => rule.actions.album === result.album)?.album?.title : null;

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: c.onSurfaceVariant }}>
        <ScienceOutlined fontSize="small" />
        <Typography variant="subtitle2" component="h3" sx={{ color: c.onSurface }}>
          {t('Ausprobieren')}
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1.2fr 1fr' }, gap: 1.5 }}>
        <TextField
          id="sort-test-name"
          size="small"
          label={t('Dateiname')}
          placeholder="Screenshot 2026-11-27.png"
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off' } }}
        />
        <TextField
          id="sort-test-source"
          select
          size="small"
          label={t('Hochgeladen über')}
          value={source}
          onChange={(event) => setSource(event.target.value as SortSource | '')}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">{t('Egal')}</MenuItem>
          {sources.map((entry) => (
            <MenuItem key={entry} value={entry}>
              {SOURCE_LABELS[entry]()}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          id="sort-test-size"
          size="small"
          label={t('Größe')}
          value={size}
          onChange={(event) => setSize(event.target.value)}
          slotProps={{
            htmlInput: { inputMode: 'decimal' },
            input: { endAdornment: <InputAdornment position="end">MB</InputAdornment> },
          }}
        />
      </Box>
      <Box aria-live="polite" sx={{ minHeight: 24 }}>
        {error && (
          <Typography variant="body2" sx={{ color: c.error }}>
            {error}
          </Typography>
        )}
        {!error && result && result.matched.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Keine Regel passt. Die Datei landet wie gewohnt in deinen Uploads.')}
          </Typography>
        )}
        {!error && result && result.matched.length > 0 && (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Typography variant="body2">
              {t('Passt zu {rules}', { rules: result.matched.map((rule) => `„${rule.name}“`).join(', ') })}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {[
                albumTitle ? t('ins Album „{title}“', { title: albumTitle }) : '',
                ...outcomeParts(result).filter((part) => !albumTitle || part !== t('ins Album')),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function RuleRow({
  rule,
  index,
  count,
  tokens,
  busy,
  onMove,
  onToggle,
  onEdit,
  onRemove,
}: {
  rule: SortRule;
  index: number;
  count: number;
  tokens: AccountOverview['tokens'];
  busy: boolean;
  onMove: (delta: number) => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const then = thenParts(rule);
  return (
    <Box
      sx={{ px: { xs: 1.5, sm: 2 }, py: 2, display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'flex-start' }}
      data-sort-rule={rule.id}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
        <Tooltip title={t('Nach oben')}>
          <span>
            <IconButton
              size="small"
              onClick={() => onMove(-1)}
              disabled={busy || index === 0}
              aria-label={t('{name} nach oben', { name: rule.name })}
            >
              <ArrowUpwardRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" sx={{ fontFamily: fonts.mono, color: c.onSurfaceVariant, lineHeight: 1 }} aria-hidden>
          {index + 1}
        </Typography>
        <Tooltip title={t('Nach unten')}>
          <span>
            <IconButton
              size="small"
              onClick={() => onMove(1)}
              disabled={busy || index === count - 1}
              aria-label={t('{name} nach unten', { name: rule.name })}
            >
              <ArrowDownwardRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, opacity: rule.enabled ? 1 : 0.62 }}>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, fontSize: '0.9375rem', overflowWrap: 'anywhere', display: 'flex', gap: 0.75, alignItems: 'center' }}
        >
          {rule.name}
          {rule.actions.star && <StarRounded fontSize="small" sx={{ color: c.tertiary }} aria-hidden />}
        </Typography>
        <Box sx={{ display: 'grid', gap: 0.25, mt: 0.5, ml: -0.5 }}>
          <Clause label={t('Wenn')} parts={whenParts(rule, tokens)} />
          <Clause label={t('Dann')} parts={then} />
        </Box>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.75 }}>
          {[
            rule.matches
              ? rule.lastMatchedAt
                ? t('{count} Treffer, zuletzt {when}', { count: rule.matches, when: relativeMs(rule.lastMatchedAt) })
                : t('{count} Treffer', { count: rule.matches })
              : t('Noch kein Treffer'),
            rule.stopAfter ? t('danach ist Schluss') : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, ml: -1 }}>
          <Button size="small" startIcon={<EditOutlined />} onClick={onEdit} disabled={busy}>
            {t('Bearbeiten')}
          </Button>
          <Button size="small" color="error" startIcon={<DeleteOutlineRounded />} onClick={onRemove} disabled={busy}>
            {t('Entfernen')}
          </Button>
        </Box>
      </Box>
      <Tooltip title={rule.enabled ? t('Regel ausschalten') : t('Regel einschalten')}>
        <Switch
          checked={rule.enabled}
          onChange={(event) => onToggle(event.target.checked)}
          disabled={busy}
          slotProps={{ input: { 'aria-label': t('{name} aktiv', { name: rule.name }) } }}
        />
      </Tooltip>
    </Box>
  );
}

export function SortRulesPanel({ account }: { account: AccountOverview }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rules, setRules] = useState<SortRule[] | null>(null);
  const [max, setMax] = useState(25);
  const [sources, setSources] = useState<SortSource[]>(['browser', 'token', 'telegram', 'discord', 'phone', 'request']);
  const [dialog, setDialog] = useState<{ rule: SortRule | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchSortRules()
      .then((result) => {
        setRules(result.rules);
        setMax(result.max);
        setSources(result.sources);
      })
      .catch((failure) => {
        setRules([]);
        toast(errorMessage(failure), { variant: 'error' });
      });
  }, [toast]);

  const full = (rules || []).length >= max;
  const list = useMemo(() => rules || [], [rules]);

  const replace = (next: SortRule) => setRules((current) => (current || []).map((entry) => (entry.id === next.id ? next : entry)));

  const toggle = async (rule: SortRule, enabled: boolean) => {
    replace({ ...rule, enabled });
    setBusy(true);
    try {
      replace((await updateSortRule(rule.id, { enabled })).rule);
    } catch (failure) {
      replace(rule);
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const previous = list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setRules(next);
    setBusy(true);
    try {
      setRules((await reorderSortRules(next.map((rule) => rule.id))).rules);
    } catch (failure) {
      setRules(previous);
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rule: SortRule) => {
    const ok = await confirm({
      title: t('Regel entfernen?'),
      message: t('Schon sortierte Dateien bleiben, wo sie sind. Neue Uploads werden nicht mehr nach „{name}“ sortiert.', {
        name: rule.name,
      }),
      confirmLabel: t('Entfernen'),
      icon: <DeleteOutlineRounded />,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSortRule(rule.id);
      setRules((current) => (current || []).filter((entry) => entry.id !== rule.id));
      toast(t('Regel entfernt'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const add = (
    <Tooltip title={full ? t('Höchstens {count} Regeln', { count: max }) : ''}>
      <span>
        <Button variant="tonal" startIcon={<AddRounded />} onClick={() => setDialog({ rule: null })} disabled={full || rules === null}>
          {t('Regel hinzufügen')}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Stack spacing={4}>
      <SettingsSection
        id="sortierregeln"
        title={t('Sortierregeln')}
        description={t(
          'Neue Uploads sortieren sich von selbst: in ein Album, mit Tags, mit Ablaufzeit, mit Inhaltswarnung oder als Favorit. Die Regeln laufen von oben nach unten, alle passenden greifen.'
        )}
        action={list.length > 0 ? add : undefined}
      >
        {rules === null ? (
          <Box sx={{ px: 3, py: 2.5 }}>
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="70%" />
          </Box>
        ) : list.length === 0 ? (
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 3, display: 'grid', gap: 2, justifyItems: 'start' }}>
            <Box
              aria-hidden
              sx={{
                width: 48,
                height: 48,
                borderRadius: `${radius.md}px`,
                display: 'grid',
                placeItems: 'center',
                bgcolor: c.secondaryContainer,
                color: c.onSecondaryContainer,
              }}
            >
              <FilterAltOutlined />
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 560 }}>
              {t(
                'Zum Beispiel: Alles, was über ShareX kommt und „Screenshot“ im Namen hat, landet im Album „Screenshots“ und wird nach 30 Tagen gelöscht.'
              )}
            </Typography>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog({ rule: null })}>
              {t('Erste Regel anlegen')}
            </Button>
          </Box>
        ) : (
          list.map((rule, index) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              index={index}
              count={list.length}
              tokens={account.tokens}
              busy={busy}
              onMove={(delta) => move(index, delta)}
              onToggle={(enabled) => toggle(rule, enabled)}
              onEdit={() => setDialog({ rule })}
              onRemove={() => remove(rule)}
            />
          ))
        )}
        {list.length > 0 && <TestBox sources={sources} rules={list} />}
      </SettingsSection>
      {list.some((rule) => rule.actions.album && !rule.album) && (
        <Alert severity="warning">{t('Eine Regel zeigt auf ein Album, das es nicht mehr gibt. Wähl dort ein anderes aus.')}</Alert>
      )}
      <RuleDialog
        open={Boolean(dialog)}
        rule={dialog?.rule ?? null}
        account={account}
        sources={sources}
        onClose={() => setDialog(null)}
        onSaved={(saved, created) => {
          setRules((current) =>
            created ? [...(current || []), saved] : (current || []).map((entry) => (entry.id === saved.id ? saved : entry))
          );
          toast(created ? t('Regel angelegt. Unten kannst du sie ausprobieren.') : t('Gespeichert'), { variant: 'success' });
        }}
      />
    </Stack>
  );
}
