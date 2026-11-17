import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import TitleRounded from '@mui/icons-material/TitleRounded';
import type { ProfileIcon, ProfileLink } from '../../lib/types';
import { LinkIcon, iconTitle } from '../../lib/linkIcons';
import { formatDateTime, formatNumber } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { LinkIconPicker } from '../../components/LinkIconPicker';
import { c, fonts, radius } from '../../theme/tokens';

type LinkEntry = Extract<ProfileLink, { type: 'link' }>;

let temporary = 0;
const draftId = () => {
  temporary -= 1;
  return temporary;
};

export const newLink = (): LinkEntry => ({
  id: draftId(),
  type: 'link',
  label: '',
  url: '',
  icon: 'auto',
  style: 'button',
  highlight: false,
  hidden: false,
  from: null,
  until: null,
});

const newHeading = (): ProfileLink => ({ id: draftId(), type: 'heading', label: '', hidden: false });

const pad = (value: number) => String(value).padStart(2, '0');

function toLocal(value: number | null) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocal(value: string) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function scheduleState(link: LinkEntry, now: number) {
  if (link.until && now >= link.until) return 'ended';
  if (link.from && now < link.from) return 'planned';
  return null;
}

export function ProfileLinksEditor({
  links,
  onChange,
  max,
  errors,
  icons,
  customEnabled,
  maxCustom,
  maxIconBytes,
  onIconsChange,
  clicks,
}: {
  links: ProfileLink[];
  onChange: (links: ProfileLink[]) => void;
  max: number;
  errors: Record<string, string>;
  icons: ProfileIcon[];
  customEnabled: boolean;
  maxCustom: number;
  maxIconBytes: number;
  onIconsChange: (icons: ProfileIcon[]) => void;
  clicks: Record<string, number> | null;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [picking, setPicking] = useState<number | null>(null);
  const now = Date.now();
  const iconFor = (key: string) => icons.find((icon) => `c:${icon.key}` === key)?.url || null;

  const update = (index: number, patch: Partial<LinkEntry> | Partial<ProfileLink>) =>
    onChange(links.map((link, position) => (position === index ? ({ ...link, ...patch } as ProfileLink) : link)));

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => onChange(links.filter((_link, position) => position !== index));

  const fieldError = (index: number, field: string) => errors[`links.${index}.${field}`] || '';

  const controls = (index: number, label: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <Tooltip title={t('Nach oben')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('{value} nach oben', { value: label })}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUpwardRounded fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('Nach unten')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('{value} nach unten', { value: label })}
            disabled={index === links.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDownwardRounded fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('Entfernen')}>
        <IconButton size="small" aria-label={t('{value} entfernen', { value: label })} onClick={() => remove(index)}>
          <DeleteOutlineRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );

  const picked = picking === null ? null : links[picking];

  return (
    <Stack spacing={1.25}>
      {links.map((link, index) => {
        const key = link.id ?? index;
        const name = link.label || (link.type === 'heading' ? t('Überschrift') : t('Link'));
        if (link.type === 'heading') {
          return (
            <Box
              key={key}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pl: 1.5,
                pr: 0.5,
                py: 1,
                borderRadius: `${radius.md}px`,
                border: `1px dashed ${c.outlineVariant}`,
                opacity: link.hidden ? 0.6 : 1,
              }}
            >
              <TitleRounded sx={{ color: c.onSurfaceVariant }} />
              <TextField
                size="small"
                label={t('Überschrift')}
                value={link.label}
                onChange={(event) => update(index, { label: event.target.value })}
                error={Boolean(fieldError(index, 'label'))}
                helperText={fieldError(index, 'label') || undefined}
                slotProps={{ htmlInput: { maxLength: 60 } }}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <Tooltip title={link.hidden ? t('Wieder zeigen') : t('Ausblenden')}>
                <Switch
                  checked={!link.hidden}
                  onChange={(event) => update(index, { hidden: !event.target.checked })}
                  slotProps={{ input: { 'aria-label': t('{value} zeigen', { value: name }) } }}
                />
              </Tooltip>
              {controls(index, name)}
            </Box>
          );
        }

        const expanded = Boolean(open[key]);
        const state = scheduleState(link, now);
        const count = clicks && link.id && link.id > 0 ? clicks[String(link.id)] || 0 : null;
        const chips = [
          link.hidden && t('Ausgeblendet'),
          state === 'planned' && link.from && t('Ab {date}', { date: formatDateTime(new Date(link.from)) }),
          state === 'ended' && t('Abgelaufen'),
          link.style === 'icon' && t('Als Symbol'),
          link.highlight && link.style === 'button' && t('Hervorgehoben'),
          count !== null && count > 0 && tn(count, '1 Klick', '{count} Klicks', { count: formatNumber(count) }),
        ].filter(Boolean) as string[];

        return (
          <Box
            key={key}
            sx={{
              borderRadius: `${radius.md}px`,
              bgcolor: c.surfaceContainer,
              border: `1px solid ${link.highlight && link.style === 'button' ? c.primary : 'transparent'}`,
              opacity: link.hidden || state === 'ended' ? 0.72 : 1,
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'auto minmax(0, 1fr)', md: 'auto minmax(0, 0.8fr) minmax(0, 1.2fr) auto' },
                gap: 1,
                alignItems: 'start',
                p: 1,
              }}
            >
              <Tooltip title={t('Symbol: {name}', { name: iconTitle(link.icon, link.url) })}>
                <IconButton
                  onClick={() => setPicking(index)}
                  aria-label={t('Symbol für {value} wählen', { value: name })}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: `${radius.sm}px`,
                    bgcolor: c.surfaceContainerHighest,
                    color: c.onSurface,
                    '&:hover': { bgcolor: c.secondaryContainer },
                  }}
                >
                  {link.icon === null ? (
                    <AddRounded fontSize="small" sx={{ opacity: 0.7 }} />
                  ) : (
                    <LinkIcon icon={link.icon} url={link.url} iconUrl={link.icon.startsWith('c:') ? iconFor(link.icon) : null} size={22} />
                  )}
                </IconButton>
              </Tooltip>
              <TextField
                size="small"
                label={t('Beschriftung')}
                value={link.label}
                onChange={(event) => update(index, { label: event.target.value })}
                error={Boolean(fieldError(index, 'label'))}
                helperText={fieldError(index, 'label') || undefined}
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
              <TextField
                size="small"
                label={t('Adresse')}
                value={link.url}
                onChange={(event) => update(index, { url: event.target.value })}
                placeholder={t('https://, E-Mail oder Telefon')}
                error={Boolean(fieldError(index, 'url') || fieldError(index, 'icon'))}
                helperText={fieldError(index, 'url') || fieldError(index, 'icon') || undefined}
                sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
                slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off', style: { fontFamily: fonts.mono } } }}
              />
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gridColumn: { xs: '1 / -1', md: 'auto' },
                  flexWrap: 'wrap',
                  gap: 0.5,
                }}
              >
                <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 0.5, flexWrap: 'wrap', mr: 'auto' }}>
                  {chips.map((chip) => (
                    <Chip key={chip} size="small" label={chip} />
                  ))}
                </Box>
                <Tooltip title={expanded ? t('Weniger Optionen') : t('Mehr Optionen')}>
                  <IconButton
                    size="small"
                    aria-expanded={expanded}
                    aria-label={t('Optionen für {value}', { value: name })}
                    onClick={() => setOpen((current) => ({ ...current, [key]: !expanded }))}
                  >
                    {expanded ? <ExpandLessRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
                  </IconButton>
                </Tooltip>
                {controls(index, name)}
              </Box>
            </Box>
            {chips.length > 0 && (
              <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexWrap: 'wrap', px: 1.5, pb: 1, mt: -0.25 }}>
                {chips.map((chip) => (
                  <Chip key={chip} size="small" label={chip} />
                ))}
              </Box>
            )}
            <Collapse in={expanded} unmountOnExit>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 2,
                  px: 1.5,
                  pt: 1,
                  pb: 2,
                  borderTop: `1px solid ${c.outlineVariant}`,
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                    {t('Darstellung')}
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={link.style}
                    onChange={(_event, style: 'button' | 'icon' | null) => style && update(index, { style })}
                    aria-label={t('Darstellung von {value}', { value: name })}
                  >
                    <ToggleButton value="button">{t('Als Knopf')}</ToggleButton>
                    <ToggleButton value="icon">{t('Nur Symbol')}</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.75 }}>
                    {link.style === 'icon'
                      ? t('Erscheint als runder Knopf in der Symbolleiste unter deiner Beschreibung.')
                      : t('Erscheint als Knopf mit Beschriftung.')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'grid', alignContent: 'start' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={link.highlight}
                        disabled={link.style === 'icon'}
                        onChange={(event) => update(index, { highlight: event.target.checked })}
                      />
                    }
                    label={t('Hervorheben')}
                  />
                  <FormControlLabel
                    control={<Switch checked={link.hidden} onChange={(event) => update(index, { hidden: event.target.checked })} />}
                    label={t('Ausblenden')}
                  />
                </Box>
                <TextField
                  size="small"
                  type="datetime-local"
                  label={t('Sichtbar ab')}
                  value={toLocal(link.from)}
                  onChange={(event) => update(index, { from: fromLocal(event.target.value) })}
                  error={Boolean(fieldError(index, 'from'))}
                  helperText={fieldError(index, 'from') || t('Leer lassen für sofort')}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  type="datetime-local"
                  label={t('Sichtbar bis')}
                  value={toLocal(link.until)}
                  onChange={(event) => update(index, { until: fromLocal(event.target.value) })}
                  error={Boolean(fieldError(index, 'until'))}
                  helperText={fieldError(index, 'until') || t('Leer lassen für immer')}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {errors.links && (
        <Typography variant="body2" sx={{ color: 'error.main' }}>
          {errors.links}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button startIcon={<AddRounded />} variant="tonal" disabled={links.length >= max} onClick={() => onChange([...links, newLink()])}>
          {t('Link hinzufügen')}
        </Button>
        <Button startIcon={<TitleRounded />} disabled={links.length >= max} onClick={() => onChange([...links, newHeading()])}>
          {t('Überschrift hinzufügen')}
        </Button>
        <Typography variant="body2" sx={{ color: 'text.secondary', ml: 'auto' }}>
          {t('{count} von {max}', { count: links.length, max })}
        </Typography>
      </Box>

      <LinkIconPicker
        open={picked !== null && picked.type === 'link'}
        value={picked && picked.type === 'link' ? picked.icon : 'auto'}
        url={picked && picked.type === 'link' ? picked.url : ''}
        icons={icons}
        customEnabled={customEnabled}
        maxCustom={maxCustom}
        maxBytes={maxIconBytes}
        onIconsChange={onIconsChange}
        onPick={(icon) => picking !== null && update(picking, { icon })}
        onClose={() => setPicking(null)}
      />
    </Stack>
  );
}
