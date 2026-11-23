import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { UploadCalendar } from '../../lib/types';
import { fetchCalendar } from '../../lib/api';
import { formatBytes, formatNumber } from '../../lib/format';
import { language, t, tn } from '../../lib/i18n';
import { c, radius } from '../../theme/tokens';

const CELL = 13;
const GAP = 3;
const LEVELS = [0, 28, 48, 72, 100];

const pad = (value: number) => String(value).padStart(2, '0');
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function levelOf(count: number, max: number) {
  if (!count) return 0;
  if (max <= 4) return Math.min(4, count);
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

const fill = (level: number) =>
  level ? `color-mix(in srgb, ${c.primary} ${LEVELS[level]}%, ${c.surfaceContainerHighest})` : c.surfaceContainerHighest;

function weeksOf(year: number) {
  const lead = (new Date(year, 0, 1).getDay() + 6) % 7;
  const cursor = new Date(year, 0, 1 - lead);
  const end = new Date(year, 11, 31);
  const columns: Array<Array<Date | null>> = [];
  while (cursor <= end) {
    const column: Array<Date | null> = [];
    for (let row = 0; row < 7; row++) {
      column.push(cursor.getFullYear() === year ? new Date(cursor) : null);
      cursor.setDate(cursor.getDate() + 1);
    }
    columns.push(column);
  }
  return columns;
}

export function UploadCalendarSection({ onDay }: { onDay?: (day: string) => void }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<UploadCalendar | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    fetchCalendar(year)
      .then((next) => alive && setData(next))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [year]);

  const weeks = useMemo(() => weeksOf(year), [year]);
  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    []
  );
  const monthFormat = useMemo(() => new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { month: 'short' }), []);
  const months = useMemo(() => {
    const labels: Array<{ column: number; label: string }> = [];
    weeks.forEach((column, index) => {
      const first = column.find((date) => date && date.getDate() === 1);
      if (first) labels.push({ column: index, label: monthFormat.format(first) });
    });
    return labels;
  }, [weeks, monthFormat]);

  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = scroller.current;
    if (!box || !data || data.year !== new Date().getFullYear()) return;
    const today = keyOf(new Date());
    const index = weeks.findIndex((column) => column.some((date) => date && keyOf(date) === today));
    if (index < 0) return;
    box.scrollLeft = Math.max(0, 28 + (index + 2) * (CELL + GAP) - box.clientWidth);
  }, [data, weeks]);

  const years = data?.years?.length ? data.years : [year];

  return (
    <Box component="section" aria-labelledby="calendar-title" sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography id="calendar-title" variant="h6" component="h3">
            {t('Upload-Kalender')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {data
              ? data.total
                ? tn(data.total, '1 Upload in {year}', '{count} Uploads an {days} Tagen in {year}, zusammen {size}', {
                    count: formatNumber(data.total),
                    days: formatNumber(data.activeDays),
                    year: String(data.year),
                    size: formatBytes(data.bytes),
                  })
                : t('{year} hast du nichts hochgeladen.', { year: String(year) })
              : ' '}
          </Typography>
        </Box>
        {years.length > 1 && (
          <TextField
            select
            size="small"
            label={t('Jahr')}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            sx={{ width: 110 }}
          >
            {years.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {failed ? (
        <Typography variant="body2" sx={{ color: c.error }}>
          {t('Der Kalender konnte nicht geladen werden.')}
        </Typography>
      ) : !data ? (
        <Skeleton variant="rounded" height={7 * (CELL + GAP) + 24} />
      ) : (
        <Box sx={{ borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow, p: { xs: 1.5, sm: 2 } }}>
          <Box ref={scroller} sx={{ overflowX: 'auto', pb: 1 }}>
            <Box
              sx={{
                display: 'inline-grid',
                gridTemplateColumns: `28px repeat(${weeks.length}, ${CELL}px)`,
                columnGap: `${GAP}px`,
                rowGap: `${GAP}px`,
              }}
            >
              <Box />
              {weeks.map((_, index) => {
                const month = months.find((entry) => entry.column === index);
                return (
                  <Box key={`m${index}`} sx={{ position: 'relative', height: 16 }}>
                    {month && (
                      <Typography
                        variant="caption"
                        sx={{ position: 'absolute', left: 0, top: 0, color: 'text.secondary', whiteSpace: 'nowrap', lineHeight: '16px' }}
                      >
                        {month.label}
                      </Typography>
                    )}
                  </Box>
                );
              })}
              {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                <Box key={`r${row}`} sx={{ display: 'contents' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: `${CELL}px`, fontSize: '0.6875rem' }}>
                    {row === 0 ? t('Mo') : row === 2 ? t('Mi') : row === 4 ? t('Fr') : ''}
                  </Typography>
                  {weeks.map((column, index) => {
                    const date = column[row];
                    if (!date) return <Box key={`e${index}-${row}`} />;
                    const key = keyOf(date);
                    const count = data.days[key] || 0;
                    const level = levelOf(count, data.max);
                    const label = count
                      ? tn(count, '1 Upload am {date}', '{count} Uploads am {date}', {
                          date: dayFormat.format(date),
                          count: formatNumber(count),
                        })
                      : t('Keine Uploads am {date}', { date: dayFormat.format(date) });
                    return (
                      <Tooltip key={key} title={label} disableInteractive>
                        {count && onDay ? (
                          <ButtonBase
                            aria-label={label}
                            onClick={() => onDay(key)}
                            sx={{
                              width: CELL,
                              height: CELL,
                              borderRadius: '3px',
                              bgcolor: fill(level),
                              '&:hover, &.Mui-focusVisible': { outline: `2px solid ${c.onSurface}`, outlineOffset: 1 },
                            }}
                          />
                        ) : (
                          <Box aria-hidden sx={{ width: CELL, height: CELL, borderRadius: '3px', bgcolor: fill(level) }} />
                        )}
                      </Tooltip>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', mt: 1 }} aria-hidden>
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
              {t('Weniger')}
            </Typography>
            {[0, 1, 2, 3, 4].map((level) => (
              <Box key={level} sx={{ width: CELL, height: CELL, borderRadius: '3px', bgcolor: fill(level) }} />
            ))}
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
              {t('Mehr')}
            </Typography>
          </Box>
        </Box>
      )}
      {onDay && data && data.total > 0 && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
          {t('Klick auf einen Tag zeigt die Dateien von diesem Tag.')}
        </Typography>
      )}
    </Box>
  );
}
