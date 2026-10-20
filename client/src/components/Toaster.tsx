import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { c, ease, elevation, radius } from '../theme/tokens';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface Toast extends Required<Pick<ToastOptions, 'variant' | 'duration'>> {
  id: number;
  message: string;
  action?: ToastOptions['action'];
}

type ToastFn = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ToastFn>(() => {});

export const useToast = () => useContext(ToastContext);

const ICONS = {
  success: <CheckCircleRounded fontSize="small" sx={{ color: c.inversePrimary }} />,
  error: <ErrorRounded fontSize="small" sx={{ color: 'var(--mui-palette-m3-errorContainer)' }} />,
  info: <InfoRounded fontSize="small" sx={{ color: c.inversePrimary }} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback<ToastFn>(
    (message, options = {}) => {
      const id = nextId.current++;
      const entry: Toast = {
        id,
        message,
        variant: options.variant ?? 'info',
        duration: options.duration ?? (options.variant === 'error' ? 6000 : 3600),
        action: options.action,
      };
      setToasts((list) => {
        const filtered = list.filter((t) => t.message !== message);
        return [...filtered, entry].slice(-3);
      });
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), entry.duration)
      );
    },
    [dismiss]
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Box
        aria-live="polite"
        sx={{
          position: 'fixed',
          zIndex: 1600,
          bottom: { xs: 'calc(env(safe-area-inset-bottom) + 96px)', md: 24 },
          left: { xs: 12, md: 112 },
          right: { xs: 12, md: 'auto' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: { xs: 'stretch', md: 'flex-start' },
          gap: 1,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <m.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16, ease: ease.emphasizedAccelerate } }}
              transition={{ duration: 0.32, ease: ease.emphasizedDecelerate }}
              style={{ pointerEvents: 'auto' }}
            >
              <Box
                role={t.variant === 'error' ? 'alert' : 'status'}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  minHeight: 48,
                  maxWidth: { md: 480 },
                  pl: 2,
                  pr: 1,
                  py: 0.75,
                  borderRadius: `${radius.sm}px`,
                  bgcolor: c.inverseSurface,
                  color: c.inverseOnSurface,
                  boxShadow: elevation[3],
                }}
              >
                {ICONS[t.variant]}
                <Typography variant="body2" sx={{ flex: 1, py: 0.5, color: 'inherit' }}>
                  {t.message}
                </Typography>
                {t.action && (
                  <Button
                    size="small"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    sx={{ color: c.inversePrimary, fontWeight: 700 }}
                  >
                    {t.action.label}
                  </Button>
                )}
                <IconButton
                  size="small"
                  aria-label="Meldung schließen"
                  onClick={() => dismiss(t.id)}
                  sx={{ color: 'inherit', opacity: 0.8 }}
                >
                  <CloseRounded fontSize="small" />
                </IconButton>
              </Box>
            </m.div>
          ))}
        </AnimatePresence>
      </Box>
    </ToastContext.Provider>
  );
}
