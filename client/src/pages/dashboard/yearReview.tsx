import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { FileItem, FileType, YearReview } from '../../lib/types';
import { errorMessage, fetchYearReview } from '../../lib/api';
import { useElementWidth } from '../../lib/hooks';
import { formatBytes, formatNumber } from '../../lib/format';
import { locale, t, tn } from '../../lib/i18n';
import { readBoot } from '../../lib/boot';
import { FileThumb } from '../../components/FileThumb';
import { displayName } from './MediaTile';
import { c, css, fileTypeColor, radius } from '../../theme/tokens';

const TYPES: Array<{ key: FileType; label: () => string; color: string }> = [
  { key: 'image', label: () => t('Bilder'), color: fileTypeColor.image },
  { key: 'video', label: () => t('Videos'), color: fileTypeColor.video },
  { key: 'audio', label: () => t('Audio'), color: fileTypeColor.audio },
  { key: 'text', label: () => t('Texte'), color: fileTypeColor.text },
  { key: 'file', label: () => t('Andere'), color: fileTypeColor.other },
];

const monthName = (index: number, style: 'short' | 'long') =>
  new Date(Date.UTC(2021, index, 1)).toLocaleDateString(locale, { month: style, timeZone: 'UTC' });
const weekdayName = (index: number, style: 'short' | 'long') =>
  new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(locale, { weekday: style, timeZone: 'UTC' });
const dayText = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
const hourText = (hour: number) => t('{from} bis {to} Uhr', { from: hour, to: (hour + 1) % 24 });

function niceMax(value: number) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
    .map((factor) => Math.round(factor * power))
    .find((candidate) => candidate >= value && candidate % 2 === 0);
  return nice || power * 10;
}

function Columns({
  values,
  labels,
  tip,
  height,
  title,
  labelEvery = 1,
}: {
  values: number[];
  labels: string[];
  tip: (index: number) => string;
  height: number;
  title: string;
  labelEvery?: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const left = 34;
  const right = 4;
  const top = 8;
  const axis = 20;
  const plot = Math.max(10, height - top - axis);
  const inner = Math.max(10, width - left - right);
  const slot = inner / Math.max(1, values.length);
  const bar = Math.max(3, Math.min(32, slot - 3));
  const peak = Math.max(0, ...values);
  const max = niceMax(peak);
  const y = (value: number) => top + plot - (value / max) * plot;
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left - left) / slot);
    setActive(index >= 0 && index < values.length ? index : null);
  };
  const keys = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((current) => Math.max(0, Math.min(values.length - 1, (current ?? 0) + (event.key === 'ArrowLeft' ? -1 : 1))));
  };
  const tipX = active !== null ? left + active * slot + slot / 2 : 0;

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%', height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={t('{title}, höchstens {max}', { title, max: formatNumber(peak) })}
          onPointerMove={pick}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(values.indexOf(peak))}
          onBlur={() => setActive(null)}
          onKeyDown={keys}
          style={{ display: 'block', outline: 'none', touchAction: 'pan-y' }}
        >
          {[0, max / 2, max].map((tick) => (
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
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {values.map((value, index) => {
            if (!value) return null;
            const x = left + index * slot + (slot - bar) / 2;
            const top0 = y(value);
            const h = Math.max(1, top + plot - top0);
            const rr = Math.min(4, bar / 2, h);
            const path = `M${x},${top + plot} L${x},${top0 + rr} Q${x},${top0} ${x + rr},${top0} L${x + bar - rr},${top0} Q${x + bar},${top0} ${x + bar},${top0 + rr} L${x + bar},${top + plot} Z`;
            return (
              <path
                key={index}
                d={path}
                fill={c.primary}
                opacity={active === null || active === index ? 1 : 0.45}
                style={{ transition: `opacity 160ms ${css.standard}` }}
              />
            );
          })}
          {labels.map((label, index) =>
            index % labelEvery === 0 ? (
              <text
                key={index}
                x={left + index * slot + slot / 2}
                y={height - 5}
                textAnchor="middle"
                fontSize={11}
                fill={c.onSurfaceVariant}
              >
                {label}
              </text>
            ) : null
          )}
        </svg>
      )}
      {active !== null && (
        <Box
          role="status"
          sx={{
            position: 'absolute',
            top: 0,
            left: Math.min(Math.max(tipX, 80), Math.max(80, width - 80)),
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
            {tn(values[active], '1 Upload', '{count} Uploads')}
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: 'inherit', opacity: 0.8 }}>
            {tip(active)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function Panel({ title, children, span = 1 }: { title: string; children: ReactNode; span?: 1 | 2 }) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: `${radius.lg}px`,
        bgcolor: c.surfaceContainerLow,
        gridColumn: { md: span === 2 ? 'span 2' : 'auto' },
        minWidth: 0,
      }}
    >
      <Typography variant="subtitle2" component="h4" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Fact({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}
      >
        {value}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      {note && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', opacity: 0.85 }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}

function TypeBar({ review }: { review: YearReview }) {
  const parts = TYPES.map((type) => ({ ...type, count: review.types[type.key] || 0 })).filter((part) => part.count > 0);
  if (!parts.length) return null;
  return (
    <Box>
      <Box
        role="img"
        aria-label={parts.map((part) => `${part.label()}: ${formatNumber(part.count)}`).join(', ')}
        sx={{ display: 'flex', gap: '2px', height: 14, borderRadius: 7, overflow: 'hidden', bgcolor: c.surfaceContainerLow }}
      >
        {parts.map((part) => (
          <Box key={part.key} sx={{ flex: `${part.count} 1 0`, minWidth: 4, bgcolor: part.color }} />
        ))}
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.25, display: 'flex', flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.75 }}>
        {parts.map((part) => (
          <Box component="li" key={part.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: part.color }} />
            <Typography variant="body2">
              {part.label()}{' '}
              <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(part.count)} ({Math.round((part.count / Math.max(1, review.uploads)) * 100)} %)
              </Box>
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function FileList({
  entries,
  empty,
  onOpen,
}: {
  entries: Array<{ file: FileItem; value: string }>;
  empty: string;
  onOpen: (file: FileItem) => void;
}) {
  if (!entries.length) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {empty}
      </Typography>
    );
  }
  return (
    <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.5 }}>
      {entries.map((entry) => (
        <li key={entry.file.id}>
          <ButtonBase
            onClick={() => onOpen(entry.file)}
            sx={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 0.75,
              pr: 1.5,
              textAlign: 'left',
              borderRadius: `${radius.md}px`,
              transition: `background-color 160ms ${css.standard}`,
              '&:hover': { bgcolor: c.surfaceContainerHigh },
              '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
            }}
          >
            <FileThumb file={entry.file} size={40} />
            <Typography variant="body2" noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
              {displayName(entry.file)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {entry.value}
            </Typography>
          </ButtonBase>
        </li>
      ))}
    </Box>
  );
}

export function YearReviewSection({ onOpen }: { onOpen: (file: FileItem) => void }) {
  const [review, setReview] = useState<YearReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reactions = Boolean(readBoot().site.reactions);

  const load = useCallback((year?: number, fallback = false) => {
    setLoading(true);
    fetchYearReview(year)
      .then((result) => {
        if (fallback && !result.uploads && result.years.length > 1) {
          load(result.years[1]);
          return;
        }
        setReview(result);
        setError('');
        setLoading(false);
      })
      .catch((failure) => {
        setError(errorMessage(failure));
        setLoading(false);
      });
  }, []);

  useEffect(() => load(undefined, true), [load]);

  const facts = useMemo(() => {
    if (!review) return [];
    const list: Array<{ value: string; label: string; note?: string }> = [
      { value: formatNumber(review.views), label: tn(review.views, 'Aufruf', 'Aufrufe') },
    ];
    if (reactions) list.push({ value: formatNumber(review.reactions), label: tn(review.reactions, 'Reaktion', 'Reaktionen') });
    list.push({ value: formatNumber(review.activeDays), label: tn(review.activeDays, 'aktiver Tag', 'aktive Tage') });
    if (review.streak && review.streak.days > 1) {
      list.push({
        value: tn(review.streak.days, '1 Tag', '{count} Tage'),
        label: t('längste Serie'),
        note: t('{from} bis {to}', { from: dayText(review.streak.from), to: dayText(review.streak.to) }),
      });
    }
    if (review.busiestDay && review.busiestDay.uploads > 1) {
      list.push({
        value: dayText(review.busiestDay.day),
        label: t('fleißigster Tag'),
        note: tn(review.busiestDay.uploads, '1 Upload', '{count} Uploads'),
      });
    }
    if (review.starred) list.push({ value: formatNumber(review.starred), label: tn(review.starred, 'Favorit', 'Favoriten') });
    if (review.albums) list.push({ value: formatNumber(review.albums), label: tn(review.albums, 'neues Album', 'neue Alben') });
    if (review.links) list.push({ value: formatNumber(review.links), label: tn(review.links, 'neuer Kurzlink', 'neue Kurzlinks') });
    return list;
  }, [review, reactions]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => monthName(index, 'short')), []);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => weekdayName(index, 'short')), []);

  return (
    <Box component="section" aria-labelledby="year-review-title" sx={{ mt: 5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Typography id="year-review-title" variant="h6" component="h3" sx={{ flex: 1, minWidth: 200 }}>
          {t('Jahresrückblick')}
        </Typography>
        {review && review.years.length > 1 && (
          <TextField
            select
            size="small"
            label={t('Jahr')}
            value={review.year}
            onChange={(event) => load(Number(event.target.value))}
            sx={{ width: 120 }}
          >
            {review.years.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {!review && !error && <Skeleton variant="rounded" height={320} />}
      {review && (
        <Box sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity 200ms' }}>
          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontSize: { xs: '2.75rem', sm: '3.5rem' },
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-0.03em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatNumber(review.uploads)}
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, maxWidth: 620 }}>
              {review.uploads
                ? review.complete
                  ? tn(
                      review.uploads,
                      '{year} hast du 1 Datei hochgeladen, zusammen {size}.',
                      '{year} hast du {count} Dateien hochgeladen, zusammen {size}.',
                      {
                        year: review.year,
                        size: formatBytes(review.bytes),
                      }
                    )
                  : tn(
                      review.uploads,
                      'Bisher hast du {year} 1 Datei hochgeladen, zusammen {size}.',
                      'Bisher hast du {year} {count} Dateien hochgeladen, zusammen {size}.',
                      {
                        year: review.year,
                        size: formatBytes(review.bytes),
                      }
                    )
                : review.complete
                  ? t('{year} hast du nichts hochgeladen.', { year: review.year })
                  : t('Dieses Jahr hast du noch nichts hochgeladen.')}
            </Typography>
          </Box>

          {review.uploads > 0 && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 2.5, mb: 3 }}>
                {facts.map((fact) => (
                  <Fact key={fact.label} {...fact} />
                ))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <Panel title={t('Uploads pro Monat')} span={2}>
                  <Columns
                    values={review.months}
                    labels={months}
                    title={t('Uploads pro Monat')}
                    tip={(index) => `${monthName(index, 'long')} ${review.year}`}
                    height={200}
                  />
                </Panel>
                <Panel title={t('Nach Wochentag')}>
                  <Columns
                    values={review.weekdays}
                    labels={weekdays}
                    title={t('Uploads nach Wochentag')}
                    tip={(index) => weekdayName(index, 'long')}
                    height={150}
                  />
                </Panel>
                <Panel title={t('Nach Uhrzeit')}>
                  <Columns
                    values={review.hours}
                    labels={Array.from({ length: 24 }, (_, hour) => String(hour))}
                    title={t('Uploads nach Uhrzeit')}
                    tip={hourText}
                    height={150}
                    labelEvery={6}
                  />
                </Panel>
                <Panel title={t('Was du hochgeladen hast')} span={2}>
                  <TypeBar review={review} />
                </Panel>
                <Panel title={t('Am häufigsten angesehen')}>
                  <FileList
                    entries={review.topViewed.map((file) => ({ file, value: formatNumber(file.views) }))}
                    empty={t('Noch keine Aufrufe in diesem Jahr.')}
                    onOpen={onOpen}
                  />
                </Panel>
                {reactions ? (
                  <Panel title={t('Die meisten Reaktionen')}>
                    <FileList
                      entries={review.topReacted.map((entry) => ({ file: entry.file, value: formatNumber(entry.reactions) }))}
                      empty={t('Noch keine Reaktionen in diesem Jahr.')}
                      onOpen={onOpen}
                    />
                  </Panel>
                ) : (
                  review.first && (
                    <Panel title={t('Dein erster Upload in {year}', { year: review.year })}>
                      <FileList entries={[{ file: review.first, value: '' }]} empty="" onOpen={onOpen} />
                    </Panel>
                  )
                )}
              </Box>
              {reactions && review.first && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
                  {t('Dein erster Upload in {year}:', { year: review.year })}{' '}
                  <ButtonBase
                    onClick={() => review.first && onOpen(review.first)}
                    sx={{
                      font: 'inherit',
                      color: c.primary,
                      fontWeight: 600,
                      verticalAlign: 'baseline',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {displayName(review.first)}
                  </ButtonBase>
                </Typography>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
