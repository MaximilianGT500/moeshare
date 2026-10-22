import { useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import LockRounded from '@mui/icons-material/LockRounded';
import LooksOneRounded from '@mui/icons-material/LooksOneRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { ApiError, openOnce, unlock } from '../lib/api';
import type { LockedInfo, SiteInfo } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { t } from '../lib/i18n';
import { mix } from '../lib/color';
import { AmbientBackdrop } from './Ambient';
import { BrandMark } from './BrandMark';
import { PasswordField } from './PasswordField';
import { SiteFooter } from './SiteFooter';
import { ThemeToggleButton } from './ThemeToggle';
import { c, ease, elevation, radius } from '../theme/tokens';

const COPY = {
  file: { title: t('Geschützte Datei'), text: t('Gib das Passwort ein, das du zusammen mit dem Link bekommen hast.') },
  link: { title: t('Geschützter Link'), text: t('Dieser Kurzlink ist mit einem Passwort geschützt.') },
  album: { title: t('Geschütztes Album'), text: t('Gib das Passwort ein, um das Album zu sehen.') },
};

export function LockedScreen({ site, locked }: { site: SiteInfo; locked: LockedInfo }) {
  const kind = locked.kind || 'file';
  const once = locked.state === 'once';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (once) await openOnce(locked.slug);
      else await unlock(kind, locked.slug, password);
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'));
      setBusy(false);
    }
  };

  const copy = COPY[kind];

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
          style={{ width: 'min(440px, 100%)' }}
        >
          <Box
            component="form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: `${radius.xl}px`,
              bgcolor: mix(c.surfaceContainerLow, 88),
              backdropFilter: 'blur(24px) saturate(1.2)',
              boxShadow: elevation[3],
              textAlign: 'center',
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                mx: 'auto',
                borderRadius: '24px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: c.primaryContainer,
                color: c.onPrimaryContainer,
                '& svg': { fontSize: 36 },
              }}
            >
              {once ? <LooksOneRounded /> : <LockRounded />}
            </Box>
            <Typography variant="h5" component="h1" sx={{ mt: 2.5 }}>
              {once ? t('Nur einmal abrufbar') : copy.title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, mb: 3 }}>
              {once
                ? t(
                    'Sobald du die Datei öffnest, ist sie für alle anderen weg. Du hast danach 15 Minuten Zeit, sie anzusehen oder herunterzuladen.'
                  )
                : copy.text}
            </Typography>
            {!once && (
              <PasswordField
                label={t('Passwort')}
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  if (error) setError('');
                }}
                autoComplete="current-password"
                autoFocus
                error={!!error}
                helperText={error || ' '}
              />
            )}
            {once && error && (
              <Typography variant="body2" sx={{ color: c.error, mb: 2 }}>
                {error}
              </Typography>
            )}
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={busy || (!once && !password)}
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : once ? <VisibilityRounded /> : <LockOpenRounded />}
              sx={{ mt: once ? 0 : 1 }}
            >
              {once ? t('Jetzt öffnen') : t('Entsperren')}
            </Button>
            {locked.expiresAt && (
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 2 }}>
                {t('Wird am {date} gelöscht.', { date: formatDateTime(new Date(locked.expiresAt)) })}
              </Typography>
            )}
          </Box>
        </m.div>
      </Box>
      <SiteFooter site={site} sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3 }} />
    </Box>
  );
}
