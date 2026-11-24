import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import type { InterstitialInfo, SiteInfo } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { t } from '../lib/i18n';
import { mix } from '../lib/color';
import { AmbientBackdrop } from './Ambient';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';
import { ThemeToggleButton } from './ThemeToggle';
import { c, ease, elevation, fonts, radius } from '../theme/tokens';

function splitUrl(url: string) {
  const match = /^(https?:\/\/)([^/?#]+)(.*)$/i.exec(url);
  return match ? { scheme: match[1], host: match[2], rest: match[3] } : { scheme: '', host: url, rest: '' };
}

export function InterstitialScreen({ site, info }: { site: SiteInfo; info: InterstitialInfo }) {
  const parts = splitUrl(info.url);
  const back = typeof window !== 'undefined' && window.history.length > 1;
  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AmbientBackdrop src={null} color={c.primary} />
      <Box
        component="header"
        sx={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 3 }, height: 64 }}
      >
        <BrandMark src={site.favicon} title={site.title} size={34} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }} noWrap>
          {site.title}
        </Typography>
        <ThemeToggleButton />
      </Box>
      <Box component="main" sx={{ position: 'relative', zIndex: 1, flex: 1, display: 'grid', placeItems: 'center', px: 2, py: 4 }}>
        <m.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: ease.emphasizedDecelerate }}
          style={{ width: 'min(560px, 100%)' }}
        >
          <Box
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: `${radius.xl}px`,
              bgcolor: mix(c.surfaceContainerLow, 88),
              backdropFilter: 'blur(24px) saturate(1.2)',
              boxShadow: elevation[3],
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '14px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: c.primaryContainer,
                  color: c.onPrimaryContainer,
                  flexShrink: 0,
                }}
              >
                <LinkRounded />
              </Box>
              <Typography variant="body2">{t('Dieser Kurzlink führt zu')}</Typography>
            </Box>
            <Typography
              component="h1"
              sx={{
                mt: 2,
                fontSize: { xs: '1.9rem', sm: '2.4rem' },
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                overflowWrap: 'anywhere',
              }}
            >
              {info.host}
            </Typography>
            <Box
              data-testid="interstitial-url"
              sx={{
                mt: 2.5,
                px: 2,
                py: 1.5,
                borderRadius: `${radius.md}px`,
                bgcolor: c.surfaceContainerHighest,
                fontFamily: fonts.mono,
                fontSize: '0.8125rem',
                lineHeight: 1.6,
                color: c.onSurfaceVariant,
                overflowWrap: 'anywhere',
                maxHeight: 160,
                overflowY: 'auto',
              }}
            >
              {parts.scheme}
              <Box component="strong" sx={{ color: c.onSurface, fontWeight: 800 }}>
                {parts.host}
              </Box>
              {parts.rest}
            </Box>
            {(!info.secure || info.brokenSince) && (
              <Box sx={{ display: 'grid', gap: 1, mt: 2 }}>
                {!info.secure && <Alert severity="warning">{t('Die Verbindung zu dieser Seite ist nicht verschlüsselt.')}</Alert>}
                {info.brokenSince && (
                  <Alert severity="warning">
                    {t('Bei der letzten Prüfung am {date} war die Seite nicht erreichbar.', {
                      date: formatDateTime(new Date(info.checkedAt || info.brokenSince)),
                    })}
                  </Alert>
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3, alignItems: 'center' }}>
              <Button
                variant="contained"
                size="large"
                href={info.next}
                rel="noreferrer"
                endIcon={<ArrowForwardRounded />}
                sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: 0 }}
              >
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('Weiter zu {host}', { host: info.host })}
                </Box>
              </Button>
              {back && (
                <Button size="large" onClick={() => window.history.back()}>
                  {t('Zurück')}
                </Button>
              )}
            </Box>
            {info.owner && (
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 2 }}>
                {t('Ob vor der Weiterleitung diese Seite erscheint, stellst du im Dashboard unter Links ein.')}
              </Typography>
            )}
          </Box>
        </m.div>
      </Box>
      <SiteFooter site={site} sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3 }} />
    </Box>
  );
}
