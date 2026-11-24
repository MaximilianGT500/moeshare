import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { ApiError, fetchStorageAnalysis, fetchStorageCheck, moveOrphans, startStorageCheck } from '../../lib/api';
import type { StorageAnalysis, StorageCheckResult, StorageCheckState, StorageKind } from '../../lib/types';
import { formatBytes, formatNumber, relativeMs } from '../../lib/format';
import { locale, t, tn } from '../../lib/i18n';
import { mix } from '../../lib/color';
import { useElementWidth } from '../../lib/hooks';
import { SettingsSection } from '../../components/SettingsKit';
import { fileIcon } from '../../components/FileIcons';
import { useConfirm } from '../../components/ConfirmDialog';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { c, css, fonts, radius } from '../../theme/tokens';

const KIND_LABEL: Record<StorageKind, () => string> = {
  image: () => t('Bilder'),
  video: () => t('Videos'),
  audio: () => t('Audio'),
  other: () => t('Texte und andere Dateien'),
  versions: () => t('Ältere Versionen'),
};

const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' });
const monthLong = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
const monthDate = (key: string) => new Date(`${key}-15T12:00:00`);

function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 1024 ** Math.max(0, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / power;
  const step = [1, 2, 2.5, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 100, 200, 250, 400, 500, 800, 1000, 1024].find((entry) => entry >= scaled);
  return (step || 1024) * power;
}

function Facts({ items }: { items: Array<{ label: string; value: string; note: string }> }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
        borderRadius: `${radius.lg}px`,
        bgcolor: c.surfaceContainerLow,
        overflow: 'hidden',
      }}
    >
      {items.map((item, index) => (
        <Box
          key={item.label}
          sx={{
            px: { xs: 2, md: 2.5 },
            py: 2,
            minWidth: 0,
            borderLeft: { xs: index % 2 ? `1px solid ${c.outlineVariant}` : 'none', md: index ? `1px solid ${c.outlineVariant}` : 'none' },
            borderTop: { xs: index > 1 ? `1px solid ${c.outlineVariant}` : 'none', md: 'none' },
          }}
        >
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {item.label}
          </Typography>
          <Typography component="p" sx={{ fontSize: { xs: '1.4rem', md: '1.6rem' }, fontWeight: 800, lineHeight: 1.2, mt: 0.25 }}>
            {item.value}
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {item.note}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function ShareBars({
  rows,
  label,
}: {
  rows: Array<{ key: string; title: string; detail: string; bytes: number; muted?: boolean }>;
  label: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.bytes));
  return (
    <Box component="ol" aria-label={label} sx={{ listStyle: 'none', m: 0, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5 }}>
      {rows.map((row) => (
        <Box component="li" key={row.key} sx={{ display: 'grid', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, minWidth: 0 }}>
            <Typography
              variant="body2"
              noWrap
              sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: row.muted ? 'text.secondary' : 'text.primary' }}
            >
              {row.title}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
              {row.detail}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 72, textAlign: 'right' }}>
              {formatBytes(row.bytes)}
            </Typography>
          </Box>
          <Box sx={{ height: 8, borderRadius: '4px', bgcolor: mix(c.primary, 12) }}>
            <Box
              sx={{
                height: '100%',
                width: row.bytes ? `${Math.max(1.5, (row.bytes / max) * 100)}%` : 0,
                borderRadius: '4px',
                bgcolor: row.muted ? mix(c.primary, 55) : c.primary,
                transition: `width 400ms ${css.standard}`,
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function MonthColumns({ months }: { months: StorageAnalysis['months'] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const height = 200;
  const left = 56;
  const right = 6;
  const top = 12;
  const axis = 24;
  const plot = height - top - axis;
  const inner = Math.max(10, width - left - right);
  const slot = inner / Math.max(1, months.length);
  const bar = Math.max(4, Math.min(36, slot - 2));
  const max = niceMax(Math.max(0, ...months.map((month) => month.bytes)));
  const y = (value: number) => top + plot - (value / max) * plot;
  const every = slot >= 40 ? 1 : slot >= 22 ? 2 : 3;
  const total = months.reduce((sum, month) => sum + month.bytes, 0);
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left - left) / slot);
    setActive(index >= 0 && index < months.length ? index : null);
  };
  const keys = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((current) => Math.max(0, Math.min(months.length - 1, (current ?? months.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
  };
  const current = active !== null ? months[active] : null;
  const tipX = active !== null ? left + active * slot + slot / 2 : 0;

  return (
    <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {t('{size} in den letzten zwölf Monaten hochgeladen', { size: formatBytes(total) })}
        </Typography>
        <Tooltip title={table ? t('Als Diagramm') : t('Als Tabelle')}>
          <IconButton size="small" aria-label={table ? t('Als Diagramm') : t('Als Tabelle')} onClick={() => setTable((value) => !value)}>
            {table ? <BarChartRounded fontSize="small" /> : <TableRowsOutlined fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      {table ? (
        <Box sx={{ borderRadius: `${radius.sm}px`, border: `1px solid ${c.outlineVariant}`, overflow: 'hidden' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <Box component="thead" sx={{ bgcolor: c.surfaceContainerHigh }}>
              <tr>
                <Box component="th" sx={{ textAlign: 'left', px: 1.25, py: 0.75 }}>
                  {t('Monat')}
                </Box>
                <Box component="th" sx={{ textAlign: 'right', px: 1.25, py: 0.75 }}>
                  {t('Dateien')}
                </Box>
                <Box component="th" sx={{ textAlign: 'right', px: 1.25, py: 0.75 }}>
                  {t('Größe')}
                </Box>
              </tr>
            </Box>
            <tbody>
              {[...months].reverse().map((month) => (
                <Box component="tr" key={month.month} sx={{ '& + tr td': { borderTop: `1px solid ${c.outlineVariant}` } }}>
                  <Box component="td" sx={{ px: 1.25, py: 0.6 }}>
                    {monthLong.format(monthDate(month.month))}
                  </Box>
                  <Box component="td" sx={{ px: 1.25, py: 0.6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(month.files)}
                  </Box>
                  <Box component="td" sx={{ px: 1.25, py: 0.6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatBytes(month.bytes)}
                  </Box>
                </Box>
              ))}
            </tbody>
          </Box>
        </Box>
      ) : (
        <Box ref={ref} sx={{ position: 'relative', width: '100%', height }}>
          {width > 0 && (
            <svg
              width={width}
              height={height}
              role="img"
              tabIndex={0}
              aria-label={t('Hochgeladene Datenmenge pro Monat, insgesamt {size}', { size: formatBytes(total) })}
              onPointerMove={pick}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(months.length - 1)}
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
                  <text x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={c.onSurfaceVariant}>
                    {tick ? formatBytes(tick, 0) : '0'}
                  </text>
                </g>
              ))}
              {months.map((month, index) => {
                if (!month.bytes) return null;
                const x = left + index * slot + (slot - bar) / 2;
                const top0 = Math.min(y(month.bytes), top + plot - 1);
                const h = top + plot - top0;
                const rr = Math.min(4, bar / 2, h);
                const path = `M${x},${top + plot} L${x},${top0 + rr} Q${x},${top0} ${x + rr},${top0} L${x + bar - rr},${top0} Q${x + bar},${top0} ${x + bar},${top0 + rr} L${x + bar},${top + plot} Z`;
                return (
                  <path
                    key={month.month}
                    d={path}
                    fill={c.primary}
                    opacity={active === null || active === index ? 1 : 0.45}
                    style={{ transition: `opacity 160ms ${css.standard}` }}
                  />
                );
              })}
              {months.map((month, index) =>
                index % every === (months.length - 1) % every ? (
                  <text
                    key={month.month}
                    x={left + index * slot + slot / 2}
                    y={height - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fill={active === index ? c.onSurface : c.onSurfaceVariant}
                  >
                    {monthShort.format(monthDate(month.month))}
                  </text>
                ) : null
              )}
            </svg>
          )}
          {current && (
            <Box
              role="status"
              sx={{
                position: 'absolute',
                top: 0,
                left: Math.min(Math.max(tipX, 80), Math.max(80, width - 80)),
                transform: 'translate(-50%, -100%)',
                px: 1.25,
                py: 0.75,
                borderRadius: `${radius.sm}px`,
                bgcolor: c.inverseSurface,
                color: c.inverseOnSurface,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 2,
              }}
            >
              <Typography variant="subtitle2" component="p" sx={{ color: 'inherit', lineHeight: 1.3 }}>
                {formatBytes(current.bytes)}
              </Typography>
              <Typography variant="caption" component="p" sx={{ color: 'inherit', opacity: 0.8 }}>
                {monthLong.format(monthDate(current.month))}, {tn(current.files, '1 Datei', '{count} Dateien')}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function Largest({ items }: { items: StorageAnalysis['largest'] }) {
  if (!items.length) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', p: 2.5 }}>
        {t('Noch keine Dateien.')}
      </Typography>
    );
  }
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: { xs: 2, sm: 2.5 },
            py: 1.25,
            '& + li': { borderTop: `1px solid ${c.outlineVariant}` },
          }}
        >
          <Box sx={{ color: c.onSurfaceVariant, display: 'flex', '& svg': { fontSize: 20 } }}>{fileIcon(item.name, item.type)}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Link href={item.view} target="_blank" rel="noopener" underline="hover" noWrap sx={{ display: 'block', fontWeight: 600 }}>
              {item.name}
            </Link>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} noWrap>
              {item.createdAt ? t('{user}, {when}', { user: item.username, when: relativeMs(item.createdAt) }) : item.username}
              {item.storage === 's3' ? `, ${t('in S3')}` : ''}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatBytes(item.sizeBytes)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function CheckSummary({ result }: { result: StorageCheckResult }) {
  const share = result.checked.files ? result.missing.count / result.checked.files : 0;
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('Zuletzt geprüft {when}: {files} Dateien und {versions} ältere Versionen, {scanned} Dateien im Ordner uploads.', {
          when: relativeMs(result.finishedAt),
          files: formatNumber(result.checked.files),
          versions: formatNumber(result.checked.versions),
          scanned: formatNumber(result.checked.scanned),
        })}
      </Typography>
      {result.missing.count > 0 && share > 0.5 && result.checked.files > 3 && (
        <Alert severity="error">
          {t('Fast alle Dateien fehlen. Vermutlich ist der Ordner uploads gerade nicht eingebunden. Lösch nichts, bevor das geklärt ist.')}
        </Alert>
      )}
      {result.missing.count === 0 && result.orphans.count === 0 && (
        <Alert severity="success">{t('Alles in Ordnung: Zu jeder Datei gibt es einen Eintrag und umgekehrt.')}</Alert>
      )}
    </Box>
  );
}

function MissingList({ result }: { result: StorageCheckResult }) {
  const shown = result.missing.items.slice(0, 50);
  return (
    <Box>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        {tn(result.missing.count, '1 Datei fehlt', '{count} Dateien fehlen')}
        <Typography component="span" variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>
          {formatBytes(result.missing.bytes)}
        </Typography>
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t(
          'Diese Einträge zeigen auf Dateien, die nicht mehr da sind. Ihre Links liefern einen Fehler. Löschen kannst du sie unter Dateien.'
        )}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderRadius: `${radius.md}px`, border: `1px solid ${c.outlineVariant}` }}>
        {shown.map((item) => (
          <Box
            component="li"
            key={`${item.kind}-${item.id}-${item.filename}`}
            sx={{ px: 1.5, py: 1, '& + li': { borderTop: `1px solid ${c.outlineVariant}` } }}
          >
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {item.name}
            </Typography>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} noWrap>
              <Box component="span" sx={{ fontFamily: fonts.mono }}>
                {item.username}/{item.filename}
              </Box>
              {item.kind === 'version' ? `, ${t('ältere Version')}` : ''}
              {item.deleted ? `, ${t('im Papierkorb')}` : ''}
              {item.storage === 's3' ? `, ${t('in S3')}` : ''}
            </Typography>
          </Box>
        ))}
      </Box>
      {result.missing.count > shown.length && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
          {t('und {count} weitere', { count: formatNumber(result.missing.count - shown.length) })}
        </Typography>
      )}
    </Box>
  );
}

function OrphanList({ result, onMove, moving }: { result: StorageCheckResult; onMove: () => void; moving: boolean }) {
  const shown = result.orphans.items.slice(0, 50);
  return (
    <Box>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        {tn(result.orphans.count, '1 verwaiste Datei', '{count} verwaiste Dateien')}
        <Typography component="span" variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>
          {formatBytes(result.orphans.bytes)}
        </Typography>
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t(
          'Diese Dateien liegen im Ordner uploads, gehören aber zu keinem Upload, etwa Reste abgebrochener Verarbeitung. Beiseitelegen verschiebt sie in den Ordner uploads/.verwaist, gelöscht wird nichts.'
        )}
      </Typography>
      {shown.length > 0 && (
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            borderRadius: `${radius.md}px`,
            border: `1px solid ${c.outlineVariant}`,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {shown.map((item) => (
            <Box
              component="li"
              key={item.path}
              sx={{
                display: 'flex',
                gap: 1.5,
                alignItems: 'baseline',
                px: 1.5,
                py: 0.75,
                '& + li': { borderTop: `1px solid ${c.outlineVariant}` },
              }}
            >
              <Typography
                variant="body2"
                noWrap
                sx={{ flex: 1, minWidth: 0, fontFamily: fonts.mono, fontSize: '0.8125rem' }}
                title={item.path}
              >
                {item.path}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {formatBytes(item.sizeBytes)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {result.orphans.count > shown.length && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
          {shown.length
            ? t('und {count} weitere', { count: formatNumber(result.orphans.count - shown.length) })
            : t('Prüf erneut, um die übrigen zu sehen.')}
        </Typography>
      )}
      {shown.length > 0 && (
        <Button
          variant="tonal"
          sx={{ mt: 1.5 }}
          onClick={onMove}
          disabled={moving}
          startIcon={moving ? <CircularProgress size={16} color="inherit" /> : <DriveFileMoveOutlined />}
        >
          {t('Beiseitelegen')}
        </Button>
      )}
    </Box>
  );
}

function CheckPanel({ onFinished }: { onFinished: () => void }) {
  const toast = useToast();
  const sudo = useSudo();
  const confirm = useConfirm();
  const [state, setState] = useState<StorageCheckState | null>(null);
  const [starting, setStarting] = useState(false);
  const [moving, setMoving] = useState(false);
  const timer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const next = await fetchStorageCheck();
      setState(next);
      if (next.running) timer.current = window.setTimeout(poll, 1000);
      else onFinished();
    } catch {
      timer.current = window.setTimeout(poll, 3000);
    }
  }, [onFinished]);

  useEffect(() => {
    fetchStorageCheck()
      .then((next) => {
        setState(next);
        if (next.running) timer.current = window.setTimeout(poll, 1000);
      })
      .catch(() => setState({ running: false, progress: null, result: null }));
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [poll]);

  const start = async () => {
    setStarting(true);
    try {
      setState(await startStorageCheck());
      timer.current = window.setTimeout(poll, 600);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : t('Die Prüfung ließ sich nicht starten.'), { variant: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const move = async () => {
    const result = state?.result;
    if (!result) return;
    const ok = await confirm({
      title: t('Verwaiste Dateien beiseitelegen?'),
      message: tn(
        Math.min(result.orphans.items.length, result.orphans.count),
        'Die Datei wandert nach uploads/.verwaist. Dort kannst du sie prüfen und später selbst löschen.',
        'Die {count} Dateien wandern nach uploads/.verwaist. Dort kannst du sie prüfen und später selbst löschen.'
      ),
      confirmLabel: t('Beiseitelegen'),
    });
    if (!ok) return;
    setMoving(true);
    try {
      const next = await sudo(() => moveOrphans());
      setState(next);
      const moved = next.result?.moved;
      if (moved)
        toast(tn(moved.count, '1 Datei nach {folder} verschoben', '{count} Dateien nach {folder} verschoben', { folder: moved.folder }), {
          variant: 'success',
        });
      onFinished();
    } catch (error) {
      if (!isCancelled(error)) toast(error instanceof ApiError ? error.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    } finally {
      setMoving(false);
    }
  };

  const running = !!state?.running;
  const progress = state?.progress;
  const result = state?.result;

  return (
    <Box sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 2.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="body2" sx={{ flex: '1 1 320px', color: 'text.secondary' }}>
          {t(
            'Vergleicht die Datenbank mit den gespeicherten Dateien: Fehlt eine Datei, obwohl es einen Upload dazu gibt? Liegt etwas im Ordner, das keinem Upload gehört? Die Prüfung ändert nichts.'
          )}
        </Typography>
        <Button
          variant="contained"
          onClick={start}
          disabled={running || starting}
          startIcon={running || starting ? <CircularProgress size={16} color="inherit" /> : <FactCheckOutlined />}
        >
          {running ? t('Wird geprüft …') : t('Jetzt prüfen')}
        </Button>
      </Box>
      {running && (
        <Box role="status">
          <LinearProgress
            variant={progress && progress.total && progress.phase === 'missing' ? 'determinate' : 'indeterminate'}
            value={progress && progress.total ? Math.min(100, (progress.checked / progress.total) * 100) : 0}
          />
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.75 }}>
            {progress?.phase === 'orphans'
              ? t('Ordner uploads wird durchsucht, {count} Dateien bisher …', { count: formatNumber(progress.scanned) })
              : t('Einträge werden abgeglichen …')}
          </Typography>
        </Box>
      )}
      {!running && result && (
        <>
          <CheckSummary result={result} />
          {result.moved && (
            <Alert severity="info">
              {tn(result.moved.count, '1 Datei liegt jetzt in {folder}.', '{count} Dateien liegen jetzt in {folder}.', {
                folder: result.moved.folder,
              })}{' '}
              {t('Lösch den Ordner, wenn nichts davon fehlt.')}
            </Alert>
          )}
          {result.missing.count > 0 && <MissingList result={result} />}
          {result.orphans.count > 0 && <OrphanList result={result} onMove={move} moving={moving} />}
        </>
      )}
      {!running && state && !result && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('Noch nicht geprüft.')}
        </Typography>
      )}
    </Box>
  );
}

export function StoragePanel() {
  const [data, setData] = useState<StorageAnalysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchStorageAnalysis());
      setError('');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t('Die Auswertung konnte nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const facts = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: t('Belegt'),
        value: formatBytes(data.total.bytes),
        note: tn(data.total.files, '1 Datei', '{count} Dateien'),
      },
      {
        label: t('Durch Duplikate gespart'),
        value: formatBytes(data.savings.bytes),
        note: data.savings.files ? tn(data.savings.files, '1 doppelte Datei', '{count} doppelte Dateien') : t('keine doppelten Dateien'),
      },
      {
        label: t('Im Papierkorb'),
        value: formatBytes(data.trash.bytes),
        note: data.trash.files ? tn(data.trash.files, '1 Datei', '{count} Dateien') : t('leer'),
      },
      data.driver === 's3'
        ? { label: t('Speicherort'), value: 'S3', note: t('Dateien liegen im Bucket') }
        : {
            label: t('Frei auf dem Server'),
            value: data.disk ? formatBytes(data.disk.free) : '–',
            note: data.disk ? t('von {total}', { total: formatBytes(data.disk.total) }) : t('nicht ermittelbar'),
          },
    ];
  }, [data]);

  if (error && !data) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={load}>
            {t('Erneut versuchen')}
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  return (
    <Stack spacing={4}>
      {data ? <Facts items={facts} /> : <Skeleton variant="rounded" height={104} />}

      <SettingsSection
        title={t('Uploads pro Monat')}
        action={
          <Tooltip title={t('Neu laden')}>
            <span>
              <IconButton aria-label={t('Auswertung neu laden')} onClick={load} disabled={loading}>
                {loading ? <CircularProgress size={20} /> : <RefreshRounded />}
              </IconButton>
            </span>
          </Tooltip>
        }
      >
        {data ? <MonthColumns months={data.months} /> : <Skeleton variant="rectangular" height={240} />}
      </SettingsSection>

      <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start' }}>
        <SettingsSection title={t('Nach Art')}>
          {data ? (
            <ShareBars
              label={t('Speicher nach Art')}
              rows={data.types.map((entry) => ({
                key: entry.type,
                title: KIND_LABEL[entry.type](),
                detail: tn(entry.files, '1 Datei', '{count} Dateien'),
                bytes: entry.bytes,
                muted: entry.type === 'versions',
              }))}
            />
          ) : (
            <Skeleton variant="rectangular" height={220} />
          )}
        </SettingsSection>
        <SettingsSection title={t('Nach Konto')}>
          {data ? (
            data.users.top.length ? (
              <ShareBars
                label={t('Speicher nach Konto')}
                rows={[
                  ...data.users.top.map((entry) => ({
                    key: entry.username,
                    title: entry.username,
                    detail: entry.quota
                      ? t('{files}, Limit {quota}', {
                          files: tn(entry.files, '1 Datei', '{count} Dateien'),
                          quota: formatBytes(entry.quota),
                        })
                      : tn(entry.files, '1 Datei', '{count} Dateien'),
                    bytes: entry.bytes,
                  })),
                  ...(data.users.rest
                    ? [
                        {
                          key: 'rest',
                          title: tn(data.users.rest.users, '1 weiteres Konto', '{count} weitere Konten'),
                          detail: tn(data.users.rest.files, '1 Datei', '{count} Dateien'),
                          bytes: data.users.rest.bytes,
                          muted: true,
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', p: 2.5 }}>
                {t('Noch keine Dateien.')}
              </Typography>
            )
          ) : (
            <Skeleton variant="rectangular" height={220} />
          )}
        </SettingsSection>
      </Box>

      <SettingsSection title={t('Größte Dateien')}>
        {data ? <Largest items={data.largest} /> : <Skeleton variant="rectangular" height={200} />}
      </SettingsSection>

      <SettingsSection title={t('Speicher prüfen')}>
        <CheckPanel onFinished={load} />
      </SettingsSection>
    </Stack>
  );
}
