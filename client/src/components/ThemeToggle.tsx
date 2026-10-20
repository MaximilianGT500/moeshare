import type { MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useColorScheme } from '@mui/material/styles';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import BrightnessAutoRounded from '@mui/icons-material/BrightnessAutoRounded';
import { m, AnimatePresence } from 'motion/react';

type Mode = 'light' | 'dark' | 'system';

interface ViewTransitionDocument {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
}

function useModeSwitch() {
  const { mode, systemMode, setMode } = useColorScheme();
  const resolved: 'light' | 'dark' = (mode === 'system' ? systemMode : mode) === 'light' ? 'light' : 'dark';

  const apply = (next: Mode, origin?: { x: number; y: number }) => {
    const doc = document as Document & ViewTransitionDocument;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduce || !origin) {
      setMode(next);
      return;
    }
    const { x, y } = origin;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = doc.startViewTransition(() => {
      flushSync(() => setMode(next));
    });
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 520, easing: 'cubic-bezier(0.2, 0, 0, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      })
      .catch(() => {});
  };

  return { mode: (mode ?? 'dark') as Mode, resolved, apply };
}

const originOf = (event: MouseEvent<HTMLElement>) => {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

export function ThemeToggleButton({ size = 'medium' }: { size?: 'small' | 'medium' }) {
  const { resolved, apply } = useModeSwitch();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Helles Design' : 'Dunkles Design';
  return (
    <Tooltip title={label} placement="right">
      <IconButton aria-label={label} size={size} onClick={(event) => apply(next, originOf(event))}>
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={resolved}
            initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ display: 'inline-flex' }}
          >
            {resolved === 'dark' ? <DarkModeRounded /> : <LightModeRounded />}
          </m.span>
        </AnimatePresence>
      </IconButton>
    </Tooltip>
  );
}

export function ThemeModeSelector() {
  const { mode, apply } = useModeSwitch();
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={mode}
      onChange={(event, value: Mode | null) => {
        if (value) apply(value, originOf(event as MouseEvent<HTMLElement>));
      }}
      aria-label="Darstellung"
      fullWidth
    >
      <ToggleButton value="light" aria-label="Hell">
        <LightModeRounded fontSize="small" /> Hell
      </ToggleButton>
      <ToggleButton value="dark" aria-label="Dunkel">
        <DarkModeRounded fontSize="small" /> Dunkel
      </ToggleButton>
      <ToggleButton value="system" aria-label="Wie System">
        <BrightnessAutoRounded fontSize="small" /> Auto
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
