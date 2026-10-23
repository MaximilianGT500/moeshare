import { useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { t } from '../../lib/i18n';
import { mix } from '../../lib/color';
import { useDesign } from '../../lib/design';
import { PageFooter, PageHeader, type ViewModel } from './parts';
import { c, ease, radius } from '../../theme/tokens';

export function WarningGate({ model, onReveal }: { model: ViewModel; onReveal: () => void }) {
  const { r } = useDesign();
  const { file, urls, accent } = model;
  const visual = file.type === 'image' || file.type === 'video';
  const [failed, setFailed] = useState(false);
  const blur = visual && !failed ? `${urls.view.replace(/\/+$/, '')}/blur.jpg` : null;

  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, zIndex: 0, bgcolor: c.surface }}>
        {blur ? (
          <Box
            component="img"
            src={blur}
            alt=""
            onError={() => setFailed(true)}
            sx={{
              position: 'absolute',
              top: '-6%',
              left: '-6%',
              width: '112%',
              height: '112%',
              maxWidth: 'none',
              objectFit: 'cover',
              filter: 'saturate(1.1)',
            }}
          />
        ) : (
          <Box
            sx={{ position: 'absolute', inset: 0, background: `radial-gradient(70% 60% at 50% 35%, ${mix(accent, 30)}, transparent)` }}
          />
        )}
        <Box sx={{ position: 'absolute', inset: 0, bgcolor: blur ? 'rgb(10 8 14 / 0.45)' : 'transparent' }} />
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1, color: blur ? '#fff' : 'inherit' }}>
        <PageHeader model={model} tone={blur ? 'glass' : 'normal'} />
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1, flex: 1, display: 'grid', placeItems: 'center', px: 2, py: 4 }}>
        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: ease.emphasizedDecelerate }}
          style={{ width: 'min(440px, 100%)' }}
        >
          <Box
            role="alertdialog"
            aria-labelledby="warning-title"
            aria-describedby="warning-text"
            sx={{
              textAlign: 'center',
              p: { xs: 3, sm: 4 },
              borderRadius: `${r(radius.xl)}px`,
              bgcolor: mix(c.surfaceContainerHigh, blur ? 88 : 100),
              backdropFilter: blur ? 'blur(18px) saturate(1.2)' : 'none',
              color: c.onSurface,
              boxShadow: '0 24px 60px -20px rgb(0 0 0 / 0.5)',
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                mx: 'auto',
                borderRadius: '22px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: c.tertiaryContainer,
                color: c.onTertiaryContainer,
                '& svg': { fontSize: 32 },
              }}
            >
              <WarningAmberRounded />
            </Box>
            <Typography id="warning-title" variant="h5" component="h1" sx={{ mt: 2.5, fontWeight: 800 }}>
              {file.warning ? file.warning : t('Inhaltswarnung')}
            </Typography>
            <Typography id="warning-text" variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              {file.warning
                ? t('Wer das hochgeladen hat, warnt vor diesem Inhalt. Sieh ihn dir nur an, wenn du das möchtest.')
                : t('Wer das hochgeladen hat, hat den Inhalt als heikel markiert. Sieh ihn dir nur an, wenn du das möchtest.')}
            </Typography>
            <Button variant="contained" size="large" startIcon={<VisibilityRounded />} onClick={onReveal} sx={{ mt: 3 }}>
              {t('Inhalt anzeigen')}
            </Button>
          </Box>
        </m.div>
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1, color: blur ? 'rgb(255 255 255 / 0.85)' : 'inherit' }}>
        <PageFooter model={model} />
      </Box>
    </Box>
  );
}
