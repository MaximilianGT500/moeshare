import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { formatDate } from '../../lib/format';
import { t } from '../../lib/i18n';
import { c, radius } from '../../theme/tokens';

export type ColorFamily = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'brown' | 'neutral';

export const COLOR_FAMILIES: Array<{ key: ColorFamily; label: () => string; swatch: string }> = [
  { key: 'red', label: () => t('Rot'), swatch: '#e5484d' },
  { key: 'orange', label: () => t('Orange'), swatch: '#f76b15' },
  { key: 'yellow', label: () => t('Gelb'), swatch: '#f5c400' },
  { key: 'green', label: () => t('Grün'), swatch: '#30a46c' },
  { key: 'teal', label: () => t('Türkis'), swatch: '#12a594' },
  { key: 'blue', label: () => t('Blau'), swatch: '#0090ff' },
  { key: 'purple', label: () => t('Lila'), swatch: '#8e4ec6' },
  { key: 'pink', label: () => t('Pink'), swatch: '#d6409f' },
  { key: 'brown', label: () => t('Braun'), swatch: '#a07553' },
  { key: 'neutral', label: () => t('Grautöne'), swatch: 'linear-gradient(135deg, #f2f2f2 0%, #8b8d98 50%, #1c1c1f 100%)' },
];

export const colorFamily = (key: string) => COLOR_FAMILIES.find((entry) => entry.key === key) || null;

export interface DateRange {
  from: number;
  to: number;
}

const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function dayRange(day: string): DateRange {
  const [year, month, date] = day.split('-').map(Number);
  const from = new Date(year, month - 1, date).getTime();
  return { from, to: new Date(year, month - 1, date + 1).getTime() };
}

const toInput = (ms: number) => {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function rangeLabel(range: DateRange) {
  const last = new Date(range.to - 1);
  const first = new Date(range.from);
  if (startOfDay(first) === startOfDay(last)) return formatDate(first);
  return t('{from} bis {to}', { from: formatDate(first), to: formatDate(last) });
}

function presets(): Array<{ label: string; range: DateRange }> {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = today + DAY;
  return [
    { label: t('Heute'), range: { from: today, to: tomorrow } },
    { label: t('Letzte 7 Tage'), range: { from: today - 6 * DAY, to: tomorrow } },
    { label: t('Letzte 30 Tage'), range: { from: today - 29 * DAY, to: tomorrow } },
    { label: t('Dieses Jahr'), range: { from: new Date(now.getFullYear(), 0, 1).getTime(), to: tomorrow } },
    {
      label: t('Letztes Jahr'),
      range: { from: new Date(now.getFullYear() - 1, 0, 1).getTime(), to: new Date(now.getFullYear(), 0, 1).getTime() },
    },
  ];
}

function Swatch({ entry, selected, onClick }: { entry: (typeof COLOR_FAMILIES)[number]; selected: boolean; onClick: () => void }) {
  return (
    <Tooltip title={entry.label()}>
      <ButtonBase
        onClick={onClick}
        aria-label={entry.label()}
        aria-pressed={selected}
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: entry.swatch,
          boxShadow: selected ? `0 0 0 2px ${c.surfaceContainerHigh}, 0 0 0 4px ${c.primary}` : `inset 0 0 0 1px rgb(0 0 0 / 0.12)`,
          color: '#fff',
          transition: 'box-shadow 160ms',
          '&.Mui-focusVisible': { boxShadow: `0 0 0 2px ${c.surfaceContainerHigh}, 0 0 0 4px ${c.primary}` },
        }}
      >
        {selected && <CheckRounded sx={{ fontSize: 20, filter: 'drop-shadow(0 0 2px rgb(0 0 0 / 0.6))' }} />}
      </ButtonBase>
    </Tooltip>
  );
}

export function FilterMenu({
  color,
  onColor,
  range,
  onRange,
}: {
  color: string;
  onColor: (value: string) => void;
  range: DateRange | null;
  onRange: (value: DateRange | null) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (!anchor) return;
    setFrom(range ? toInput(range.from) : '');
    setTo(range ? toInput(range.to - 1) : '');
  }, [anchor, range]);

  const applyCustom = () => {
    if (!from && !to) {
      onRange(null);
      return;
    }
    const start = from ? dayRange(from).from : 0;
    const end = to ? dayRange(to).to : startOfDay(new Date()) + DAY;
    onRange({ from: Math.min(start, end - 1), to: Math.max(end, start + 1) });
    setAnchor(null);
  };

  const active = Boolean(color) || Boolean(range);
  return (
    <>
      <Tooltip title={t('Nach Farbe und Zeitraum filtern')}>
        <IconButton
          aria-label={t('Nach Farbe und Zeitraum filtern')}
          aria-haspopup="dialog"
          aria-pressed={active}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <Badge variant="dot" color="primary" invisible={!active}>
            <FilterListRounded />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 24px)', p: 2, borderRadius: `${radius.lg}px` } } }}
      >
        <Typography variant="subtitle2" component="h2">
          {t('Farbe')}
        </Typography>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1.25 }}>
          {t('Nach der Hauptfarbe von Bildern und Videos.')}
        </Typography>
        <Box role="group" aria-label={t('Farbe')} sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 36px)', gap: 1.5, mb: 2 }}>
          {COLOR_FAMILIES.map((entry) => (
            <Swatch
              key={entry.key}
              entry={entry}
              selected={color === entry.key}
              onClick={() => onColor(color === entry.key ? '' : entry.key)}
            />
          ))}
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
          {t('Hochgeladen')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
          {presets().map((preset) => {
            const selected = !!range && range.from === preset.range.from && range.to === preset.range.to;
            return (
              <Chip
                key={preset.label}
                label={preset.label}
                size="small"
                variant={selected ? 'filled' : 'outlined'}
                onClick={() => {
                  onRange(selected ? null : preset.range);
                  setAnchor(null);
                }}
                sx={selected ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer } : undefined}
              />
            );
          })}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField
            type="date"
            size="small"
            label={t('Von')}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            size="small"
            label={t('Bis')}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1.5 }}>
          {active && (
            <Button
              onClick={() => {
                onColor('');
                onRange(null);
                setAnchor(null);
              }}
            >
              {t('Zurücksetzen')}
            </Button>
          )}
          <Button variant="tonal" onClick={applyCustom} disabled={!from && !to}>
            {t('Zeitraum anwenden')}
          </Button>
        </Box>
      </Popover>
    </>
  );
}

export function ActiveFilterChips({
  color,
  onColor,
  range,
  onRange,
}: {
  color: string;
  onColor: (value: string) => void;
  range: DateRange | null;
  onRange: (value: DateRange | null) => void;
}) {
  const family = colorFamily(color);
  return (
    <>
      {family && (
        <Chip
          label={family.label()}
          onDelete={() => onColor('')}
          deleteIcon={<CloseRounded />}
          icon={
            <Box
              component="span"
              aria-hidden
              sx={{ width: 14, height: 14, borderRadius: '50%', background: family.swatch, ml: '8px !important' }}
            />
          }
          sx={{ bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, fontWeight: 600, flexShrink: 0 }}
        />
      )}
      {range && (
        <Chip
          label={rangeLabel(range)}
          onDelete={() => onRange(null)}
          deleteIcon={<CloseRounded />}
          sx={{ bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, fontWeight: 600, flexShrink: 0 }}
        />
      )}
    </>
  );
}
