import type { ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { RAIL_WIDTH } from './AppShell';
import { c, ease, elevation, radius } from '../theme/tokens';

export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box component="section" id={id} aria-labelledby={id ? `${id}-title` : undefined} sx={{ scrollMarginTop: 96 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mb: 1.5, px: { xs: 0.5, sm: 1 } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={id ? `${id}-title` : undefined} variant="h6" component="h2">
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 680 }}>
              {description}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      <Box
        sx={{
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerLow,
          overflow: 'hidden',
          '& > * + *': { borderTop: `1px solid ${c.outlineVariant}` },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function SettingRow({
  label,
  description,
  htmlFor,
  stacked = false,
  icon,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  stacked?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: stacked ? 'column' : { xs: 'column', sm: 'row' },
        alignItems: stacked ? 'stretch' : { xs: 'stretch', sm: 'center' },
        gap: stacked ? 1.5 : { xs: 1.5, sm: 3 },
        px: { xs: 2, sm: 3 },
        py: 2.25,
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
        {icon && (
          <Box sx={{ color: c.onSurfaceVariant, mt: 0.25, display: 'flex', '& svg': { fontSize: 22 } }} aria-hidden>
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            component={htmlFor ? 'label' : 'div'}
            htmlFor={htmlFor}
            variant="subtitle1"
            sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: '0.9375rem' }}
          >
            {label}
          </Typography>
          {description && (
            <Typography variant="body2" component="div" sx={{ color: 'text.secondary', mt: 0.25, maxWidth: 620 }}>
              {description}
            </Typography>
          )}
        </Box>
      </Box>
      {children && (
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: stacked ? 'stretch' : { xs: 'flex-start', sm: 'flex-end' },
            minWidth: 0,
            pl: stacked && icon ? '38px' : 0,
            '& > *': stacked ? { flex: 1 } : {},
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
}

export function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  icon,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Box
      onClick={(event) => {
        if (disabled) return;
        if ((event.target as HTMLElement).closest('input, a, button, label')) return;
        onChange(!checked);
      }}
      sx={{
        cursor: disabled ? 'default' : 'pointer',
        '&:hover': disabled ? {} : { bgcolor: 'color-mix(in srgb, var(--mui-palette-m3-onSurface) 3%, transparent)' },
      }}
    >
      <SettingRow label={label} description={description} htmlFor={id} icon={icon}>
        <Switch id={id} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      </SettingRow>
    </Box>
  );
}

export function SaveBar({
  count,
  busy,
  onSave,
  onReset,
  label = 'Speichern',
  bottomNav = true,
}: {
  count: number;
  busy: boolean;
  onSave: () => void;
  onReset: () => void;
  label?: string;
  bottomNav?: boolean;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <Box
          sx={{
            position: 'fixed',
            zIndex: 1180,
            left: { xs: 12, md: RAIL_WIDTH + 24 },
            right: { xs: 12, md: 24 },
            bottom: { xs: `calc(${bottomNav ? 92 : 16}px + env(safe-area-inset-bottom))`, md: 24 },
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <m.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, transition: { duration: 0.16, ease: ease.emphasizedAccelerate } }}
            transition={{ duration: 0.36, ease: ease.emphasizedDecelerate }}
            style={{ pointerEvents: 'auto', width: '100%', maxWidth: 720 }}
          >
            <Box
              role="region"
              aria-label="Ungespeicherte Änderungen"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pl: 2.5,
                pr: 1,
                py: 1,
                borderRadius: `${radius.full}px`,
                bgcolor: c.inverseSurface,
                color: c.inverseOnSurface,
                boxShadow: elevation[3],
              }}
            >
              <Typography variant="body2" sx={{ flex: 1, color: 'inherit', fontWeight: 500 }}>
                {count === 1 ? '1 ungespeicherte Änderung' : `${count} ungespeicherte Änderungen`}
              </Typography>
              <Button onClick={onReset} disabled={busy} sx={{ color: 'inherit', opacity: 0.85 }}>
                Verwerfen
              </Button>
              <Button
                variant="contained"
                onClick={onSave}
                disabled={busy}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ bgcolor: c.inversePrimary, color: c.onPrimaryContainer, '&:hover': { bgcolor: c.inversePrimary } }}
              >
                {label}
              </Button>
            </Box>
          </m.div>
        </Box>
      )}
    </AnimatePresence>
  );
}
