import { StrictMode, createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domAnimation, type FeatureBundle } from 'motion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../theme/theme';
import { ease } from '../theme/tokens';
import { ToastProvider } from '../components/Toaster';
import { readBoot } from '../lib/boot';
import '../theme/fonts.css';

interface MountOptions {
  seed?: string | null;
  features?: FeatureBundle;
  scheme?: 'dark' | 'light' | null;
  isolated?: boolean;
}

const SeedContext = createContext<(seed: string) => void>(() => {});

export const useThemeSeed = () => useContext(SeedContext);

function Root({
  initialSeed,
  features,
  scheme,
  isolated,
  children,
}: {
  initialSeed: string;
  features: FeatureBundle;
  scheme: 'dark' | 'light' | null;
  isolated: boolean;
  children: ReactNode;
}) {
  const [seed, setSeed] = useState(initialSeed);
  const theme = useMemo(() => createAppTheme(seed), [seed]);
  const detached = isolated || !!scheme;
  return (
    <SeedContext.Provider value={setSeed}>
      <ThemeProvider
        theme={theme}
        defaultMode={scheme || 'dark'}
        modeStorageKey="mui-mode"
        storageManager={detached ? null : undefined}
        noSsr
        disableTransitionOnChange
      >
        <CssBaseline enableColorScheme />
        <LazyMotion features={features} strict>
          <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: ease.emphasizedDecelerate }}>
            <ToastProvider>{children}</ToastProvider>
          </MotionConfig>
        </LazyMotion>
      </ThemeProvider>
    </SeedContext.Provider>
  );
}

function registerServiceWorker() {
  if (!readBoot().site.pwa || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}

export function mount(app: ReactNode, { seed, features = domAnimation, scheme = null, isolated = false }: MountOptions = {}) {
  const container = document.getElementById('root');
  if (!container) return;
  if (!isolated) registerServiceWorker();
  createRoot(container).render(
    <StrictMode>
      <Root initialSeed={seed || readBoot().site.seedColor} features={features} scheme={scheme} isolated={isolated}>
        {app}
      </Root>
    </StrictMode>
  );
}
