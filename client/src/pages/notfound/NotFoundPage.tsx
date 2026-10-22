import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import HideImageRounded from '@mui/icons-material/HideImageRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { readBoot } from '../../lib/boot';
import type { NotFoundBoot } from '../../lib/types';
import { AmbientBackdrop } from '../../components/Ambient';
import { BrandMark } from '../../components/BrandMark';
import { SiteFooter } from '../../components/SiteFooter';
import { c, ease, elevation, fileTypeColor, fonts, radius } from '../../theme/tokens';
import { mix } from '../../lib/color';
import { rich, t } from '../../lib/i18n';

function EmptyStack() {
  const back = [
    { rotate: -11, x: -58, y: 10, color: fileTypeColor.video },
    { rotate: 9, x: 56, y: 4, color: fileTypeColor.audio },
  ];
  return (
    <Box sx={{ position: 'relative', width: 220, height: 176, mx: 'auto' }}>
      {back.map((tile, i) => (
        <m.div
          key={i}
          initial={{ opacity: 0, rotate: 0, x: 0, y: 20 }}
          animate={{ opacity: 1, rotate: tile.rotate, x: tile.x, y: tile.y }}
          transition={{ delay: 0.2 + i * 0.08, duration: 0.7, ease: ease.emphasizedDecelerate }}
          style={{ position: 'absolute', left: 40, top: 8, width: 140, height: 160 }}
        >
          <Box
            sx={{ width: '100%', height: '100%', borderRadius: `${radius.lg}px`, bgcolor: mix(tile.color, 40), boxShadow: elevation[2] }}
          />
        </m.div>
      ))}
      <m.div
        initial={{ opacity: 0, y: 24, scale: 0.9 }}
        animate={{ opacity: 1, y: [0, -6, 0], scale: 1 }}
        transition={{
          opacity: { duration: 0.5 },
          scale: { duration: 0.6, ease: ease.emphasizedDecelerate },
          y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.8 },
        }}
        style={{ position: 'absolute', left: 40, top: 0, width: 140, height: 168 }}
      >
        <Box
          sx={{
            width: '100%',
            height: '100%',
            borderRadius: `${radius.lg}px`,
            bgcolor: c.surfaceContainerHigh,
            border: `2px dashed ${c.outline}`,
            display: 'grid',
            placeItems: 'center',
            color: c.onSurfaceVariant,
            boxShadow: elevation[3],
            '& svg': { fontSize: 52 },
          }}
        >
          <HideImageRounded />
        </Box>
      </m.div>
    </Box>
  );
}

export function NotFoundPage() {
  const boot = readBoot<NotFoundBoot>();
  const { site } = boot;
  const status = boot.status || 404;
  const missing = status === 404;
  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AmbientBackdrop color={c.primary} strength={0.7} />
      <Box
        component="header"
        sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 3 }, height: 64 }}
      >
        <BrandMark src={site.favicon} title={site.title} size={34} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {site.title}
        </Typography>
      </Box>
      <Box
        component="main"
        sx={{ position: 'relative', zIndex: 1, flex: 1, display: 'grid', placeItems: 'center', px: 2, pb: 8, textAlign: 'center' }}
      >
        <Box>
          <EmptyStack />
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6, ease: ease.emphasizedDecelerate }}
          >
            <Typography variant="h2" component="h1" sx={{ mt: 5, fontSize: { xs: '1.75rem', sm: '2.25rem' } }}>
              {boot.message || t('Diese Seite gibt es nicht.')}
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1.5, maxWidth: 460, mx: 'auto' }}>
              {missing
                ? t(
                    'Vielleicht wurde die Datei gelöscht oder der Link ist unvollständig. Prüfe die Adresse oder frag nach einem neuen Link.'
                  )
                : boot.requestId
                  ? t('Lade die Seite neu. Bleibt der Fehler, findest du die Ursache im Server-Log unter der Fehler-ID unten.')
                  : t('Lade die Seite neu. Bleibt der Fehler, steht im Server-Log, was passiert ist.')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 4, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<ArrowBackRounded />}
                onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign('/dashboard'))}
              >
                {t('Zurück')}
              </Button>
              <Button variant="tonal" href="/dashboard">
                {t('Zum Dashboard')}
              </Button>
            </Box>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 4, opacity: 0.7 }}>
              {boot.requestId
                ? rich(
                    'Fehler {status}, Fehler-ID {id}',
                    {
                      id: (
                        <Box component="code" sx={{ fontFamily: fonts.mono, userSelect: 'all' }}>
                          {boot.requestId}
                        </Box>
                      ),
                    },
                    { status }
                  )
                : t('Fehler {status}', { status })}
            </Typography>
          </m.div>
        </Box>
      </Box>
      <SiteFooter site={site} sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3 }} />
    </Box>
  );
}
