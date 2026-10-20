import type { ReactNode } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SiteInfo } from '../../lib/types';
import { AmbientBackdrop } from '../../components/Ambient';
import { useElementHeight } from '../../lib/hooks';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { SiteFooter } from '../../components/SiteFooter';
import { mix } from '../../lib/color';
import { c, ease, radius } from '../../theme/tokens';

export function AuthLayout({ site, children, wide = false }: { site: SiteInfo; children: ReactNode; wide?: boolean }) {
  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2, py: 6, overflow: 'hidden' }}>
      <AmbientBackdrop src={site.favicon || null} color={c.primary} strength={0.9} />

      <Box sx={{ position: 'fixed', top: 12, right: 12, zIndex: 2 }}>
        <ThemeToggleButton />
      </Box>

      <m.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: ease.emphasizedDecelerate }}
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: wide ? 460 : 420 }}
      >
        <Box
          sx={{
            borderRadius: `${radius.xl}px`,
            bgcolor: mix(c.surfaceContainerLow, 80),
            backdropFilter: 'blur(24px) saturate(1.2)',
            border: `1px solid ${mix(c.outlineVariant, 60)}`,
          }}
        >
          <AutoHeight>
            <Box sx={{ p: { xs: 3, sm: 4 } }}>{children}</Box>
          </AutoHeight>
        </Box>
        <SiteFooter site={site} version sx={{ mt: 2.5 }} />
      </m.div>
    </Box>
  );
}

export function AutoHeight({ children }: { children: ReactNode }) {
  const [ref, height] = useElementHeight<HTMLDivElement>();
  return (
    <m.div
      initial={false}
      animate={height ? { height } : undefined}
      transition={{ duration: 0.38, ease: ease.emphasizedDecelerate }}
      style={{ overflow: 'hidden' }}
    >
      <div ref={ref}>{children}</div>
    </m.div>
  );
}

export const stepMotion = {
  initial: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.32, ease: ease.emphasizedDecelerate } },
  exit: (direction: number) => ({ opacity: 0, x: direction * -28, transition: { duration: 0.14, ease: ease.emphasizedAccelerate } }),
};

export function Shake({ attempt, children }: { attempt: number; children: ReactNode }) {
  return (
    <m.div
      key={attempt}
      animate={attempt > 0 ? { x: [0, -10, 10, -6, 6, -2, 0] } : undefined}
      transition={{ duration: 0.42, ease: 'easeInOut' }}
    >
      {children}
    </m.div>
  );
}

export function OrDivider() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }} aria-hidden>
      <Box sx={{ flex: 1, height: '1px', bgcolor: c.outlineVariant }} />
      <Typography variant="caption">oder</Typography>
      <Box sx={{ flex: 1, height: '1px', bgcolor: c.outlineVariant }} />
    </Box>
  );
}

export async function postAuth<T = Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: T & { error?: string; field?: string; redirect?: string } }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: 'Keine Verbindung zum Server. Prüfe deine Verbindung und versuche es erneut.' } as T & { error: string },
    };
  }
}
