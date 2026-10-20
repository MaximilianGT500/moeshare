import { useEffect, useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MemoryRounded from '@mui/icons-material/MemoryRounded';
import DeveloperBoardRounded from '@mui/icons-material/DeveloperBoardRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import type { SystemInfo } from '../../lib/types';
import { fetchSystem } from '../../lib/api';
import { formatBytes, formatDuration } from '../../lib/format';
import { c, ease, fonts, radius } from '../../theme/tokens';

function Card({ icon, title, children, wide = false }: { icon: ReactNode; title: string; children: ReactNode; wide?: boolean }) {
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
          {level === 'critical' ? 'Kritisch: kaum noch Arbeitsspeicher frei' : 'Hohe Auslastung'}
        </Typography>
      )}
    </Box>
  );
}

function Row({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
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

export function SystemPanel({ initial }: { initial: SystemInfo }) {
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
          Live, aktualisiert {ago < 2 ? 'gerade eben' : `vor ${ago} s`}
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' } }}>
        <Card icon={<MemoryRounded />} title="Arbeitsspeicher">
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1 }}>{memPercent} %</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              belegt
            </Typography>
          </Box>
          <Meter value={memPercent} label="Arbeitsspeicher belegt" />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            {formatBytes(info.memory.used)} von {formatBytes(info.memory.total)}, frei {formatBytes(info.memory.free)}
          </Typography>
        </Card>

        <Card icon={<DeveloperBoardRounded />} title="Prozessor">
          <Typography variant="body2" sx={{ mb: 2 }}>
            {info.cpuModel}, {info.cpuCores} {info.cpuCores === 1 ? 'Kern' : 'Kerne'}
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1 }}>
            Auslastung im Mittel (Load je Kern)
          </Typography>
          {[
            ['1 Min.', loads[0]],
            ['5 Min.', loads[1]],
            ['15 Min.', loads[2]],
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

        <Card icon={<ScheduleRounded />} title="Laufzeit">
          <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1.1 }}>{formatDuration(uptime)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            seit dem letzten Neustart des Servers
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            MoeShare-Prozess belegt {formatBytes(info.processMemoryBytes)}
          </Typography>
        </Card>

        <Card icon={<DnsRounded />} title="Server" wide>
          <Box>
            <Row label="Hostname" value={info.hostname} mono />
            <Row label="Betriebssystem" value={`${info.platform} ${info.release} (${info.arch})`} />
            <Row label="Node.js" value={info.nodeVersion} mono />
            <Row label="MoeShare" value={`v${info.appVersion}`} mono />
          </Box>
        </Card>
      </Box>
    </Box>
  );
}
