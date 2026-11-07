import { m } from 'motion/react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { readBoot } from '../../lib/boot';
import type { LegalBoot } from '../../lib/types';
import { AmbientBackdrop } from '../../components/Ambient';
import { BrandMark } from '../../components/BrandMark';
import { LegalText } from '../../components/LegalText';
import { SiteFooter } from '../../components/SiteFooter';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { mix } from '../../lib/color';
import { c, ease, radius } from '../../theme/tokens';

export function LegalPage() {
  const boot = readBoot<LegalBoot>();
  const { site, legal } = boot;
  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AmbientBackdrop src={site.favicon || null} color={c.primary} strength={0.5} />
      <Box
        component="header"
        sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 3 }, height: 64 }}
      >
        <ButtonBase component="a" href="/" nativeButton={false} aria-label={site.title} sx={{ borderRadius: '50%' }}>
          <BrandMark src={site.favicon} title={site.title} size={34} />
        </ButtonBase>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {legal.heading || site.title}
        </Typography>
        <ThemeToggleButton />
      </Box>
      <Box component="main" sx={{ position: 'relative', zIndex: 1, flex: 1, px: 2, pt: { xs: 3, md: 6 }, pb: 8 }}>
        <m.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: ease.emphasizedDecelerate }}
          style={{ maxWidth: 720, margin: '0 auto' }}
        >
          <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.5rem' }, mb: 3 }}>
            {legal.title}
          </Typography>
          <Box
            sx={{
              p: { xs: 2.5, sm: 4 },
              borderRadius: `${radius.xl}px`,
              bgcolor: mix(c.surfaceContainerLow, 85),
              border: `1px solid ${mix(c.outlineVariant, 60)}`,
              maxWidth: '75ch',
            }}
          >
            <LegalText text={legal.text} />
          </Box>
        </m.article>
      </Box>
      <SiteFooter site={site} report sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3 }} />
    </Box>
  );
}
