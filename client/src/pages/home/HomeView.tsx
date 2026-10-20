import type { MouseEvent, ReactElement } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InsertDriveFileRounded from '@mui/icons-material/InsertDriveFileRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import ImageRounded from '@mui/icons-material/ImageRounded';
import MovieRounded from '@mui/icons-material/MovieRounded';
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import type { HomeActivityDay, HomeOptions, HomeStatKey, HomeStats, SiteInfo } from '../../lib/types';
import { AmbientBackdrop } from '../../components/Ambient';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { BrandMark } from '../../components/BrandMark';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { FooterLinks } from '../../components/SiteFooter';
import { formatBytes, formatNumber, plural } from '../../lib/format';
import { mix } from '../../lib/color';
import { c, ease, radius } from '../../theme/tokens';

export const STAT_META: Record<HomeStatKey, { label: string; icon: ReactElement; format: (value: number) => string }> = {
  files: { label: 'Dateien', icon: <InsertDriveFileRounded />, format: formatNumber },
  storage: { label: 'Speicher belegt', icon: <StorageRounded />, format: formatBytes },
  views: { label: 'Aufrufe', icon: <VisibilityRounded />, format: formatNumber },
  users: { label: 'Mitglieder', icon: <GroupRounded />, format: formatNumber },
  images: { label: 'Bilder', icon: <ImageRounded />, format: formatNumber },
  videos: { label: 'Videos', icon: <MovieRounded />, format: formatNumber },
  audio: { label: 'Audiodateien', icon: <GraphicEqRounded />, format: formatNumber },
  today: { label: 'Heute hochgeladen', icon: <TodayRounded />, format: formatNumber },
};

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dayLabel = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dateOf = (day: string) => new Date(`${day}T12:00:00Z`);

interface HomeViewProps {
  site: SiteInfo;
  home: HomeOptions;
  stats: HomeStats;
  user: { username: string } | null;
  registration: boolean;
  preview?: boolean;
}

function UploadPulse({ days }: { days: HomeActivityDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.uploads));
  const total = days.reduce((sum, day) => sum + day.uploads, 0);
  const busiest = days.reduce((best, day) => (day.uploads > best.uploads ? day : best), days[0]);
  const summary = total
    ? `${plural(total, 'Upload', 'Uploads')} in den letzten 14 Tagen, die meisten am ${dayLabel.format(dateOf(busiest.day))}.`
    : 'In den letzten 14 Tagen wurde nichts hochgeladen.';

  return (
    <Box
      component="figure"
      sx={{
        m: 0,
        p: { xs: 2.5, sm: 3.5 },
        borderRadius: `${radius.xl}px`,
        bgcolor: mix(c.surfaceContainerLow, 82),
        backdropFilter: 'blur(20px) saturate(1.15)',
        border: `1px solid ${mix(c.outlineVariant, 55)}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography component="figcaption" variant="subtitle1" sx={{ fontWeight: 700 }}>
          Uploads der letzten 14 Tage
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {total ? `${formatNumber(total)} insgesamt` : 'noch ruhig hier'}
        </Typography>
      </Box>
      <Box role="img" aria-label={summary} sx={{ mt: 3, position: 'relative' }}>
        {!total && (
          <Typography
            variant="body2"
            sx={{
              position: 'absolute',
              inset: 0,
              bottom: 48,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              color: 'text.secondary',
              px: 2,
            }}
          >
            Sobald jemand etwas hochlädt, wächst hier das Diagramm.
          </Typography>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(14, minmax(0, 1fr))',
            alignItems: 'end',
            gap: { xs: 0.75, sm: 1.25 },
            height: { xs: 150, sm: 200 },
          }}
        >
          {days.map((day, index) => {
            const today = index === days.length - 1;
            const height = day.uploads ? Math.max(8, (day.uploads / max) * 100) : 3;
            return (
              <Tooltip
                key={day.day}
                title={`${dayLabel.format(dateOf(day.day))}: ${plural(day.uploads, 'Upload', 'Uploads')}`}
                placement="top"
              >
                <Box sx={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <m.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.2 + index * 0.04, duration: 0.8, ease: ease.emphasizedDecelerate }}
                    style={{
                      width: '100%',
                      height: `${height}%`,
                      transformOrigin: 'bottom',
                      borderRadius: radius.full,
                      background: day.uploads ? (today ? c.primary : mix(c.primary, 42)) : c.outlineVariant,
                    }}
                  />
                </Box>
              </Tooltip>
            );
          })}
        </Box>
        <Box aria-hidden sx={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: { xs: 0.75, sm: 1.25 }, mt: 1.25 }}>
          {days.map((day, index) => (
            <Typography
              key={day.day}
              variant="caption"
              sx={{
                textAlign: 'center',
                color: index === days.length - 1 ? 'primary.main' : 'text.secondary',
                fontWeight: index === days.length - 1 ? 800 : 500,
              }}
            >
              {WEEKDAYS[dateOf(day.day).getUTCDay()]}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function StatStrip({ stats }: { stats: HomeStats['stats'] }) {
  const columns = Math.min(stats.length, 4);
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${columns}, minmax(0, 1fr))` },
        rowGap: 4,
        columnGap: 3,
        py: { xs: 4, md: 5 },
        borderTop: `1px solid ${mix(c.outlineVariant, 70)}`,
      }}
    >
      {stats.map(({ key, value }) => {
        const meta = STAT_META[key];
        return (
          <Box key={key} sx={{ minWidth: 0 }}>
            <Box
              component="dt"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', '& svg': { fontSize: 18, color: c.primary } }}
            >
              {meta.icon}
              <Typography variant="body2" component="span">
                {meta.label}
              </Typography>
            </Box>
            <Typography
              component="dd"
              sx={{
                m: 0,
                mt: 0.75,
                fontSize: { xs: '2rem', md: '2.75rem' },
                fontWeight: 800,
                lineHeight: 1.05,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}
            >
              <AnimatedNumber value={value} format={meta.format} duration={1.2} />
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export function HomeView({ site, home, stats, user, registration, preview = false }: HomeViewProps) {
  const headline = home.headline || site.title;
  const inert = preview ? (event: MouseEvent) => event.preventDefault() : undefined;
  const activity = stats.activity && stats.activity.length ? stats.activity : null;

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: preview ? 0 : '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      <AmbientBackdrop src={site.favicon || null} color={c.primary} strength={0.85} position={preview ? 'absolute' : 'fixed'} />

      <Box
        component="header"
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          width: '100%',
          maxWidth: 1180,
          mx: 'auto',
          px: { xs: 2, md: 4 },
          height: 72,
        }}
      >
        <BrandMark src={site.favicon} title={site.title} size={36} />
        <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>{site.title}</Typography>
        <Box sx={{ flex: 1 }} />
        <ThemeToggleButton />
      </Box>

      <Box
        component="main"
        sx={{ position: 'relative', zIndex: 1, flex: 1, width: '100%', maxWidth: 1180, mx: 'auto', px: { xs: 2, md: 4 } }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: activity ? 'minmax(0, 1.05fr) minmax(0, 1fr)' : '1fr' },
            gap: { xs: 5, md: 8 },
            alignItems: 'center',
            py: { xs: 5, md: 10 },
          }}
        >
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: ease.emphasizedDecelerate }}
          >
            <Typography
              component="h1"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '2.5rem', sm: '3.25rem', md: '4.25rem' },
                lineHeight: 1.02,
                letterSpacing: '-0.03em',
                overflowWrap: 'anywhere',
              }}
            >
              {headline}
            </Typography>
            {home.text && (
              <Typography
                sx={{
                  mt: 2.5,
                  maxWidth: '52ch',
                  fontSize: { xs: '1.0625rem', md: '1.1875rem' },
                  lineHeight: 1.6,
                  color: 'text.secondary',
                  whiteSpace: 'pre-line',
                }}
              >
                {home.text}
              </Typography>
            )}
            {(user || home.signIn) && (
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 4 }}>
                {user ? (
                  <Button variant="contained" size="large" href="/dashboard" onClick={inert} startIcon={<DashboardRounded />}>
                    Zum Dashboard
                  </Button>
                ) : (
                  <>
                    <Button variant="contained" size="large" href="/login" onClick={inert} startIcon={<LoginRounded />}>
                      Anmelden
                    </Button>
                    {registration && (
                      <Button variant="tonal" size="large" href="/register" onClick={inert}>
                        Konto erstellen
                      </Button>
                    )}
                  </>
                )}
              </Box>
            )}
          </m.div>
          {activity && <UploadPulse days={activity} />}
        </Box>

        {stats.stats.length > 0 && <StatStrip stats={stats.stats} />}
      </Box>

      <Box
        component="footer"
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 1180,
          mx: 'auto',
          px: { xs: 2, md: 4 },
          py: 3,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
          color: 'text.secondary',
        }}
      >
        <FooterLinks links={[...(site.links || []), ...(site.legal || [])]} inert={inert} strong />
        <Box sx={{ ml: { sm: 'auto' }, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
          {site.copyright && <Typography variant="caption">{site.copyright}</Typography>}
          <Typography variant="caption" sx={{ opacity: 0.75 }}>
            Läuft mit MoeShare{site.version ? ` ${site.version}` : ''}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
