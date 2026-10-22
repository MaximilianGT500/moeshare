import { useMemo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { DesignBackground, ReportTarget, SiteInfo, ViewDesign } from '../lib/types';
import { DesignProvider, toolsFor, useInjectedCss } from '../lib/design';
import { mix } from '../lib/color';
import { AmbientBackdrop } from './Ambient';
import { BrandMark } from './BrandMark';
import { ThemeToggleButton } from './ThemeToggle';
import { SiteFooter } from './SiteFooter';
import { ReportButton } from './ReportDialog';
import { c } from '../theme/tokens';

export function DesignBackdrop({ background, src, accent }: { background: DesignBackground; src?: string | null; accent: string }) {
  if (background === 'plain') return null;
  if (background === 'ambient') return <AmbientBackdrop src={src || null} color={accent} />;
  if (background === 'gradient') {
    return (
      <Box
        aria-hidden
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `radial-gradient(120% 80% at 0% 0%, ${mix(c.primary, 30)}, transparent 60%), radial-gradient(90% 70% at 100% 100%, ${mix(c.tertiary, 26)}, transparent 62%), ${c.surface}`,
        }}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundColor: c.surface,
        backgroundImage: `radial-gradient(${mix(c.onSurface, 16)} 1.2px, transparent 1.4px), radial-gradient(70% 50% at 50% 0%, ${mix(c.primary, 20)}, transparent 70%)`,
        backgroundSize: '22px 22px, 100% 100%',
      }}
    />
  );
}

export function OwnerPage({
  site,
  design,
  css,
  accent,
  cover = null,
  page,
  report = null,
  children,
}: {
  site: SiteInfo;
  design: ViewDesign;
  css?: string;
  accent: string;
  cover?: string | null;
  page: 'album' | 'profile';
  report?: ReportTarget | null;
  children: ReactNode;
}) {
  const tools = useMemo(() => toolsFor(design), [design]);
  useInjectedCss(css);
  return (
    <DesignProvider value={tools}>
      <Box
        className="ms-page"
        data-page={page}
        sx={{
          position: 'relative',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: tools.font,
          '& .MuiTypography-root, & .MuiButtonBase-root, & .MuiInputBase-root, & .MuiChip-label': { fontFamily: 'inherit' },
        }}
      >
        <DesignBackdrop background={design.background} src={cover} accent={accent} />
        {tools.shows('header') && (
          <Box
            component="header"
            className="ms-header"
            sx={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 3 }, height: 64 }}
          >
            <Box
              component="a"
              href={site.custom ? '/' : site.baseUrl}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none', minWidth: 0, flex: 1 }}
            >
              <BrandMark src={site.favicon} title={site.title} size={34} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }} noWrap>
                {site.title}
              </Typography>
            </Box>
            {design.scheme === 'visitor' && <ThemeToggleButton />}
          </Box>
        )}
        <Box
          component="main"
          sx={{ position: 'relative', zIndex: 1, flex: 1, width: '100%', maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 3 }, pb: 6 }}
        >
          {children}
        </Box>
        <Box className="ms-footer" sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3, display: 'grid', justifyItems: 'center', gap: 1 }}>
          {site.report && report && <ReportButton target={report} />}
          {tools.shows('footer') && <SiteFooter site={site} />}
        </Box>
      </Box>
    </DesignProvider>
  );
}
