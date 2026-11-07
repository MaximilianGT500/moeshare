import { useEffect, useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import MovieFilterRounded from '@mui/icons-material/MovieFilterRounded';
import MemoryRounded from '@mui/icons-material/MemoryRounded';
import DeveloperBoardRounded from '@mui/icons-material/DeveloperBoardRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import type { DatabaseInfo, Job, SystemInfo, UpdateInfo } from '../../lib/types';
import { ApiError, checkForUpdate, errorMessage, fetchSystem, fetchVideoInfo, repairVideos, waitForJob } from '../../lib/api';
import { useToast } from '../../components/Toaster';
import { formatBytes, formatDuration, formatNumber, relativeMs } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { c, ease, fonts, radius } from '../../theme/tokens';

export function Card({ icon, title, children, wide = false }: { icon: ReactNode; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Box
      component="section"
      sx={{
        gridColumn: wide ? { md: 'span 2' } : undefined,
        p: { xs: 2.5, md: 3 },
        borderRadius: `${radius.lg}px`,
        bgcolor: c.surfaceContainerLow,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: `${radius.tile}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: c.secondaryContainer,
            color: c.onSecondaryContainer,
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" component="h3">
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  const level = value >= 90 ? 'critical' : value >= 75 ? 'warning' : 'ok';
  const fill = level === 'critical' ? c.error : level === 'warning' ? c.warning : c.primary;
  const track = level === 'critical' ? c.errorContainer : level === 'warning' ? c.warningContainer : c.secondaryContainer;
  return (
    <Box>
      <Box
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        sx={{ height: 10, borderRadius: `${radius.full}px`, bgcolor: track, overflow: 'hidden' }}
      >
        <m.div
          initial={false}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ duration: 0.8, ease: ease.emphasizedDecelerate }}
          style={{ height: '100%', background: fill, borderRadius: 999 }}
        />
      </Box>
      {level !== 'ok' && (
        <Typography
          variant="caption"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, color: level === 'critical' ? c.error : c.onSurfaceVariant }}
        >
          <WarningAmberRounded sx={{ fontSize: 16 }} />
          {level === 'critical' ? t('Kritisch: kaum noch Arbeitsspeicher frei') : t('Hohe Auslastung')}
        </Typography>
      )}
    </Box>
  );
}

export function Row({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 2,
        py: 1.1,
        borderTop: `1px solid ${c.outlineVariant}`,
        '&:first-of-type': { borderTop: 'none' },
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          textAlign: 'right',
          fontWeight: 500,
          minWidth: 0,
          wordBreak: 'break-word',
          fontFamily: mono ? fonts.mono : undefined,
          fontSize: mono ? '0.8125rem' : undefined,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

const SOURCES: Record<DatabaseInfo['source'], string> = {
  env: t('Umgebungsvariable DATABASE_URL'),
  file: t('Einrichtung (db/database.json)'),
  default: t('Standard'),
  cli: t('Kommandozeile'),
};

const TABLES: Array<[string, string]> = [
  ['users', t('Benutzer')],
  ['file_data', t('Dateien')],
  ['links', t('Kurzlinks')],
  ['albums', t('Alben')],
  ['sessions', t('Sitzungen')],
  ['audit_log', t('Aktivität')],
];

interface VideoReport {
  total: number;
  sizes: number;
  posters: number;
  web: number;
  skipped: number;
  failed: number;
}

function VideoCard({ initial }: { initial: { running: string | null; ffmpeg: boolean } }) {
  const toast = useToast();
  const [count, setCount] = useState<number | null>(null);
  const [job, setJob] = useState<Job<VideoReport> | null>(null);
  const [report, setReport] = useState<VideoReport | null>(null);
  const [error, setError] = useState('');

  const follow = async (id: string) => {
    try {
      const finished = await waitForJob<VideoReport>(id, setJob, { admin: true, interval: 1200 });
      if (finished.state === 'done' && finished.result) {
        setReport(finished.result);
        toast(t('Videos aufbereitet'), { variant: 'success' });
      } else if (finished.error) {
        setError(finished.error.message);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setJob(null);
    }
  };

  useEffect(() => {
    fetchVideoInfo()
      .then((info) => setCount(info.videos))
      .catch(() => {});
    if (initial.running) follow(initial.running);
  }, []);

  const start = async () => {
    setError('');
    setReport(null);
    try {
      const { job: started } = await repairVideos();
      setJob(started as Job<VideoReport>);
      follow(started.id);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'running') toast(t('Die Videos werden gerade schon aufbereitet.'));
      else setError(errorMessage(failure));
    }
  };

  const detail = (job?.detail || null) as VideoReport | null;

  return (
    <Card icon={<MovieFilterRounded />} title={t('Videos')}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {t(
          'Misst Größe und Drehung neu, ersetzt dunkle Vorschaubilder und erstellt eine abspielbare Fassung für Videos, die Browser nicht können, etwa HEVC oder 10 Bit.'
        )}
      </Typography>
      {!initial.ffmpeg ? (
        <Alert severity="warning">{t('Dafür braucht der Server FFmpeg.')}</Alert>
      ) : job ? (
        <Box>
          <LinearProgress
            variant="determinate"
            value={Math.round(job.progress * 100)}
            sx={{ height: 8, borderRadius: `${radius.full}px` }}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {detail
              ? t('{done} von {total} Videos geprüft', {
                  done: formatNumber(Math.round(job.progress * detail.total)),
                  total: formatNumber(detail.total),
                })
              : t('Startet …')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={start} disabled={count === 0}>
            {t('Alle Videos prüfen')}
          </Button>
          {count !== null && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {tn(count, '1 Video gespeichert', '{count} Videos gespeichert')}
            </Typography>
          )}
        </Box>
      )}
      {report && (
        <Typography variant="body2" sx={{ mt: 2 }}>
          {t('{sizes} Größen korrigiert, {posters} Vorschaubilder erneuert, {web} abspielbare Fassungen erstellt, {failed} Fehler.', {
            sizes: formatNumber(report.sizes),
            posters: formatNumber(report.posters),
            web: formatNumber(report.web),
            failed: formatNumber(report.failed),
          })}
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Card>
  );
}

function VersionValue({ current, initial }: { current: string; initial: UpdateInfo }) {
  const toast = useToast();
  const [info, setInfo] = useState(initial);
  const [busy, setBusy] = useState(false);
  const recheck = async () => {
    setBusy(true);
    try {
      const next = await checkForUpdate();
      setInfo(next);
      toast(next.available ? t('Version {version} ist verfügbar', { version: next.available }) : t('Du nutzt die neueste Version.'));
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
      <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
        v{current}
      </Box>
      {info.enabled && (
        <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 400, color: info.available ? c.primary : 'text.secondary' }}>
          {info.available ? (
            <Link href={info.changelog} target="_blank" rel="noopener noreferrer">
              {t('v{version} ist erschienen', { version: info.available })}
            </Link>
          ) : info.checkedAt ? (
            t('aktuell, geprüft {when}', { when: relativeMs(info.checkedAt) })
          ) : (
            t('noch nicht geprüft')
          )}{' '}
          <Link component="button" type="button" onClick={recheck} disabled={busy} sx={{ fontSize: 'inherit', verticalAlign: 'baseline' }}>
            {t('prüfen')}
          </Link>
        </Box>
      )}
    </Box>
  );
}

export function SystemPanel({
  initial,
  database,
  ffmpeg,
  update,
  videos,
}: {
  initial: SystemInfo;
  database: DatabaseInfo;
  ffmpeg: string | null;
  update: UpdateInfo;
  videos: { running: string | null; ffmpeg: boolean };
}) {
  const [info, setInfo] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer = 0;
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        try {
          setInfo(await fetchSystem());
          setUpdatedAt(Date.now());
        } catch {}
      }
      timer = window.setTimeout(tick, 5000);
    };
    timer = window.setTimeout(tick, 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(clock);
    };
  }, []);

  const memPercent = info.memory.usedPercent;
  const ago = Math.max(0, Math.round((now - updatedAt) / 1000));
  const uptime = info.uptime.seconds + (now - updatedAt) / 1000;
  const loads = info.loadavg.length ? info.loadavg : [0, 0, 0];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{ position: 'relative', width: 10, height: 10 }}>
          <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: c.success }} />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              bgcolor: c.success,
              animation: 'moeshare-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
              '@keyframes moeshare-ping': { '75%, 100%': { transform: 'scale(2.4)', opacity: 0 } },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }} aria-live="off">
          {t('Live, aktualisiert')} {ago < 2 ? t('gerade eben') : t('vor {ago} s', { ago })}
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' } }}>
        <Card icon={<MemoryRounded />} title={t('Arbeitsspeicher')}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1 }}>{memPercent} %</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('belegt')}
            </Typography>
          </Box>
          <Meter value={memPercent} label={t('Arbeitsspeicher belegt')} />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            {t('{used} von {total}, frei {free}', {
              used: formatBytes(info.memory.used),
              total: formatBytes(info.memory.total),
              free: formatBytes(info.memory.free),
            })}
          </Typography>
        </Card>

        <Card icon={<DeveloperBoardRounded />} title={t('Prozessor')}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {info.cpuModel}, {tn(info.cpuCores, '1 Kern', '{count} Kerne')}
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1 }}>
            {t('Auslastung im Mittel (Load je Kern)')}
          </Typography>
          {[
            [t('1 Min.'), loads[0]],
            [t('5 Min.'), loads[1]],
            [t('15 Min.'), loads[2]],
          ].map(([label, load]) => {
            const pct = Math.min(100, ((load as number) / Math.max(1, info.cpuCores)) * 100);
            return (
              <Box
                key={label as string}
                sx={{ display: 'grid', gridTemplateColumns: '56px 1fr 48px', alignItems: 'center', gap: 1.5, py: 0.5 }}
              >
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {label}
                </Typography>
                <Box sx={{ height: 6, borderRadius: `${radius.full}px`, bgcolor: c.surfaceContainerHighest, overflow: 'hidden' }}>
                  <m.div
                    initial={false}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: ease.emphasizedDecelerate }}
                    style={{
                      height: '100%',
                      background: pct >= 90 ? 'var(--mui-palette-m3-error)' : 'var(--mui-palette-m3-primary)',
                      borderRadius: 999,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(pct)} %
                </Typography>
              </Box>
            );
          })}
        </Card>

        <Card icon={<ScheduleRounded />} title={t('Laufzeit')}>
          <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1.1 }}>{formatDuration(uptime)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {t('seit dem letzten Neustart des Servers')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            {t('Der Server-Prozess belegt {processMemoryBytes}', { processMemoryBytes: formatBytes(info.processMemoryBytes) })}
          </Typography>
        </Card>

        <VideoCard initial={videos} />

        <Card icon={<DnsRounded />} title={t('Server')} wide>
          <Box>
            <Row label={t('Hostname')} value={info.hostname} mono />
            <Row label={t('Betriebssystem')} value={`${info.platform} ${info.release} (${info.arch})`} />
            <Row label="Node.js" value={info.nodeVersion} mono />
            <Row label={t('Version')} value={<VersionValue current={info.appVersion} initial={update} />} />
            <Row label={t('FFmpeg')} value={ffmpeg || t('nicht gefunden, Videos bekommen keine Vorschau')} mono={!!ffmpeg} />
          </Box>
        </Card>

        <Card icon={<StorageRounded />} title={t('Datenbank')}>
          <Box>
            <Row label={t('Verbindung')} value={database.label} />
            <Row label={t('Version')} value={database.version} mono />
            <Row label={t('Eingestellt über')} value={SOURCES[database.source] || database.source} />
            {TABLES.filter(([key]) => key in database.tables).map(([key, label]) => (
              <Row key={key} label={label} value={formatNumber(database.tables[key])} />
            ))}
          </Box>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5 }}>
            {t('Umziehen in eine andere Datenbank:')}{' '}
            <Box component="span" sx={{ fontFamily: fonts.mono }}>
              {`node cli.js copy-db <${t('Adresse')}> --use`}
            </Box>
          </Typography>
        </Card>
      </Box>
    </Box>
  );
}
