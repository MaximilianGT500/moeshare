import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import type { StatsCounts, StatsDay } from '../lib/types';
import { errorMessage, fetchAlbumStats, fetchFileStats, fetchLinkStats } from '../lib/api';
import { useElementWidth } from '../lib/hooks';
import { formatNumber } from '../lib/format';
import { mix } from '../lib/color';
import { GrowTransition } from './transitions';
import { c, css, radius } from '../theme/tokens';
import { t } from '../lib/i18n';

export type Metric = keyof StatsCounts;

const METRICS: Array<{ key: Metric; label: () => string; hint: () => string }> = [
  { key: 'views', label: () => t('Aufrufe'), hint: () => t('Ansichtsseite geöffnet') },
  { key: 'downloads', label: () => t('Downloads'), hint: () => t('Über den Knopf heruntergeladen') },
  { key: 'direct', label: () => t('Direkt geladen'), hint: () => t('Datei woanders eingebunden oder direkt geöffnet') },
  { key: 'previews', label: () => t('Vorschauen'), hint: () => t('Von Chat-Diensten wie Discord abgerufen') },
];

const PLATFORMS: Record<string, string> = {
  discord: 'Discord',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  x: 'X',
  slack: 'Slack',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  reddit: 'Reddit',
  skype: 'Skype',
  teams: 'Microsoft Teams',
  matrix: 'Matrix',
  google: 'Google',
  bing: 'Bing',
  apple: 'Apple',
};

export const sourceLabel = (source: string) => (source.startsWith('@') ? PLATFORMS[source.slice(1)] || t('Andere Dienste') : source);

const shortDay = (day: string) => {
  const [, month, date] = day.split('-');
  return `${Number(date)}.${Number(month)}.`;
};

const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });

function niceMax(value: number) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
    .map((factor) => Math.round(factor * power))
    .find((candidate) => candidate >= value && candidate % 2 === 0);
  return nice || power * 10;
}

const compact = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 })}K`
    : formatNumber(value);

function ColumnChart({ days, metric, height }: { days: StatsDay[]; metric: Metric; height: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const left = 36;
  const right = 6;
  const top = 10;
  const axis = 22;
  const plot = Math.max(10, height - top - axis);
  const inner = Math.max(10, width - left - right);
  const slot = inner / Math.max(1, days.length);
  const bar = Math.max(2, Math.min(24, slot - 2));
  const values = days.map((day) => day[metric]);
  const max = niceMax(Math.max(0, ...values));
  const ticks = [0, max / 2, max];
  const y = (value: number) => top + plot - (value / max) * plot;
  const labelIndexes = days.length > 1 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : [0];
  const metricLabel = METRICS.find((entry) => entry.key === metric)?.label() || '';
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left - left) / slot);
    setActive(index >= 0 && index < days.length ? index : null);
  };
  const keys = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((current) => {
      const base = current ?? days.length - 1;
      return Math.max(0, Math.min(days.length - 1, base + (event.key === 'ArrowLeft' ? -1 : 1)));
    });
  };
  const current = active !== null ? days[active] : null;
  const tipX = active !== null ? left + active * slot + slot / 2 : 0;

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%', height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={t('{metric} pro Tag, höchstens {max}', { metric: metricLabel, max: formatNumber(Math.max(0, ...values)) })}
          onPointerMove={pick}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(days.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={keys}
          style={{ display: 'block', outline: 'none', touchAction: 'pan-y' }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={c.outlineVariant}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill={c.onSurfaceVariant}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {compact(tick)}
              </text>
            </g>
          ))}
          {days.map((day, index) => {
            const value = day[metric];
            if (!value) return null;
            const x = left + index * slot + (slot - bar) / 2;
            const top0 = y(value);
            const h = Math.max(1, top + plot - top0);
            const rr = Math.min(4, bar / 2, h);
            const path = `M${x},${top + plot} L${x},${top0 + rr} Q${x},${top0} ${x + rr},${top0} L${x + bar - rr},${top0} Q${x + bar},${top0} ${x + bar},${top0 + rr} L${x + bar},${top + plot} Z`;
            return (
              <path
                key={day.day}
                d={path}
                fill={c.primary}
                opacity={active === null || active === index ? 1 : 0.45}
                style={{ transition: `opacity 160ms ${css.standard}` }}
              />
            );
          })}
          {active !== null && (
            <line
              x1={tipX}
              x2={tipX}
              y1={top}
              y2={top + plot}
              stroke={c.outline}
              strokeWidth={1}
              shapeRendering="crispEdges"
              opacity={0.5}
            />
          )}
          {labelIndexes.map((index) => (
            <text
              key={index}
              x={left + index * slot + slot / 2}
              y={height - 6}
              textAnchor={index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill={c.onSurfaceVariant}
            >
              {shortDay(days[index].day)}
            </text>
          ))}
        </svg>
      )}
      {current && (
        <Box
          role="status"
          sx={{
            position: 'absolute',
            top: 0,
            left: Math.min(Math.max(tipX, 70), Math.max(70, width - 70)),
            transform: 'translate(-50%, -100%)',
            mt: -0.5,
            px: 1.25,
            py: 0.75,
            borderRadius: `${radius.sm}px`,
            bgcolor: c.inverseSurface,
            color: c.inverseOnSurface,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgb(0 0 0 / 0.2)',
            zIndex: 2,
          }}
        >
          <Typography variant="subtitle2" component="p" sx={{ color: 'inherit', lineHeight: 1.3 }}>
            {formatNumber(current[metric])} {metricLabel}
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: 'inherit', opacity: 0.8 }}>
            {longDay(current.day)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function DayTable({ days, metric }: { days: StatsDay[]; metric: Metric }) {
  const rows = [...days].reverse();
  return (
    <Box sx={{ maxHeight: 260, overflowY: 'auto', borderRadius: `${radius.sm}px`, border: `1px solid ${c.outlineVariant}` }}>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <Box component="thead" sx={{ position: 'sticky', top: 0, bgcolor: c.surfaceContainerHigh }}>
          <tr>
            <Box component="th" sx={{ textAlign: 'left', px: 1.25, py: 0.75, fontWeight: 700 }}>
              {t('Tag')}
            </Box>
            {METRICS.map((entry) => (
              <Box
                component="th"
                key={entry.key}
                sx={{ textAlign: 'right', px: 1.25, py: 0.75, fontWeight: entry.key === metric ? 800 : 600 }}
              >
                {entry.label()}
              </Box>
            ))}
          </tr>
        </Box>
        <tbody>
          {rows.map((day) => (
            <Box component="tr" key={day.day} sx={{ '& + tr td': { borderTop: `1px solid ${c.outlineVariant}` } }}>
              <Box component="td" sx={{ px: 1.25, py: 0.6 }}>
                {longDay(day.day)}
              </Box>
              {METRICS.map((entry) => (
                <Box component="td" key={entry.key} sx={{ px: 1.25, py: 0.6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(day[entry.key])}
                </Box>
              ))}
            </Box>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

export function SourceList({ sources }: { sources: Array<{ source: string; hits: number }> }) {
  if (!sources.length) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('Noch keine Herkunft bekannt. Aufrufe ohne Verweis zählen als direkt.')}
      </Typography>
    );
  }
  const max = Math.max(...sources.map((entry) => entry.hits));
  return (
    <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
      {sources.map((entry) => (
        <Box component="li" key={entry.source} sx={{ display: 'grid', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} title={entry.source}>
              {sourceLabel(entry.source)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(entry.hits)}
            </Typography>
          </Box>
          <Box sx={{ height: 6, borderRadius: '3px', bgcolor: mix(c.primary, 14) }}>
            <Box sx={{ height: '100%', width: `${Math.max(3, (entry.hits / max) * 100)}%`, borderRadius: '3px', bgcolor: c.primary }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export interface StatsData {
  enabled: boolean;
  days: StatsDay[];
  sources: Array<{ source: string; hits: number }>;
}

export function StatsPanel<T extends StatsData>({
  load,
  compact: narrow = false,
  aside,
}: {
  load: (days: number) => Promise<T>;
  compact?: boolean;
  aside?: (data: T) => ReactNode;
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<T | null>(null);
  const [metric, setMetric] = useState<Metric>('views');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load(days)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError('');
      })
      .catch((failure) => !cancelled && setError(errorMessage(failure)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days, load]);

  const totals = useMemo(() => {
    const sum: StatsCounts = { views: 0, downloads: 0, direct: 0, previews: 0 };
    for (const day of data?.days || []) for (const key of METRICS) sum[key.key] += day[key.key];
    return sum;
  }, [data]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Skeleton variant="rounded" height={narrow ? 260 : 320} />;

  return (
    <Box sx={{ display: 'grid', gap: 2, opacity: loading ? 0.6 : 1, transition: 'opacity 200ms' }}>
      {!data.enabled && (
        <Alert severity="info">{t('Statistiken sind auf diesem Server abgeschaltet. Neue Aufrufe werden nicht gezählt.')}</Alert>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={days}
          onChange={(_event, next: number | null) => next && setDays(next)}
          aria-label={t('Zeitraum')}
        >
          <ToggleButton value={7}>{t('7 Tage')}</ToggleButton>
          <ToggleButton value={30}>{t('30 Tage')}</ToggleButton>
          <ToggleButton value={90}>{t('90 Tage')}</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={table ? t('Als Diagramm zeigen') : t('Als Tabelle zeigen')}>
          <ToggleButton
            value="table"
            size="small"
            selected={table}
            onChange={() => setTable((value) => !value)}
            aria-label={table ? t('Als Diagramm zeigen') : t('Als Tabelle zeigen')}
          >
            {table ? <BarChartRounded fontSize="small" /> : <TableRowsOutlined fontSize="small" />}
          </ToggleButton>
        </Tooltip>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
        {METRICS.map((entry) => {
          const selected = metric === entry.key;
          return (
            <ButtonBase
              key={entry.key}
              onClick={() => setMetric(entry.key)}
              aria-pressed={selected}
              title={entry.hint()}
              sx={{
                display: 'block',
                textAlign: 'left',
                p: 1.5,
                borderRadius: `${radius.md}px`,
                bgcolor: selected ? c.secondaryContainer : c.surfaceContainerHigh,
                color: selected ? c.onSecondaryContainer : c.onSurface,
                boxShadow: selected ? `inset 0 0 0 1px ${c.primary}` : 'none',
                transition: `background-color 160ms ${css.standard}`,
                '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
              }}
            >
              <Typography variant="caption" component="p" sx={{ color: 'inherit', opacity: 0.85 }}>
                {entry.label()}
              </Typography>
              <Typography component="p" sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.25, color: 'inherit' }}>
                {formatNumber(totals[entry.key])}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
      <Box component="figure" sx={{ m: 0 }}>
        <Typography variant="subtitle2" component="figcaption" sx={{ mb: 1.5 }}>
          {t('{metric} pro Tag', { metric: METRICS.find((entry) => entry.key === metric)?.label() || '' })}
        </Typography>
        {table ? (
          <DayTable days={data.days} metric={metric} />
        ) : (
          <ColumnChart days={data.days} metric={metric} height={narrow ? 150 : 200} />
        )}
      </Box>
      <Box
        sx={{ display: 'grid', gap: 3, gridTemplateColumns: aside && !narrow ? { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' } : '1fr' }}
      >
        {aside?.(data)}
        <Box>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1.25 }}>
            {t('Herkunft')}
          </Typography>
          <SourceList sources={data.sources.slice(0, narrow ? 6 : 10)} />
        </Box>
      </Box>
    </Box>
  );
}

export interface StatsTarget {
  kind: 'file' | 'link' | 'album';
  id: number;
  title: string;
}

const LOADERS = { file: fetchFileStats, link: fetchLinkStats, album: fetchAlbumStats };

function StatsDialogBody({ target }: { target: StatsTarget }) {
  const load = useCallback((days: number) => LOADERS[target.kind](target.id, days), [target.kind, target.id]);
  return <StatsPanel load={load} />;
}

export function StatsDialog({ target, onClose }: { target: StatsTarget | null; onClose: () => void }) {
  const [last, setLast] = useState<StatsTarget | null>(target);
  useEffect(() => {
    if (target) setLast(target);
  }, [target]);
  const shown = target || last;
  return (
    <Dialog open={!!target} onClose={onClose} maxWidth="md" fullWidth slots={{ transition: GrowTransition }} aria-labelledby="stats-title">
      <DialogTitle id="stats-title" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pr: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {t('Statistik')}
          {shown && (
            <Typography variant="body2" component="span" noWrap sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
              {shown.title}
            </Typography>
          )}
        </Box>
        <IconButton aria-label={t('Schließen')} onClick={onClose} sx={{ mt: -0.5 }}>
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {shown && <StatsDialogBody key={`${shown.kind}-${shown.id}`} target={shown} />}
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 2.5 }}>
          {t('Gezählt werden nur Abrufe von anderen. IP-Adressen und Geräte werden nicht gespeichert.')}
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
