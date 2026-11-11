import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import { useDesign } from '../../lib/design';
import { canEmbedPdf } from '../../lib/device';
import { formatBytes } from '../../lib/format';
import { mix } from '../../lib/color';
import { t } from '../../lib/i18n';
import { c, elevation, radius } from '../../theme/tokens';

export function PdfStage({ src, name, size }: { src: string; name: string; size: number }) {
  const { r } = useDesign();
  const [embed] = useState(canEmbedPdf);

  if (!embed) {
    return (
      <Box
        sx={{
          width: 'min(860px, 100%)',
          mx: 'auto',
          py: { xs: 5, sm: 7 },
          px: 3,
          borderRadius: `${r(radius.xl)}px`,
          textAlign: 'center',
          bgcolor: mix(c.surfaceContainerHigh, 88),
          backdropFilter: 'blur(20px)',
          boxShadow: elevation[3],
        }}
      >
        <Box
          sx={{
            width: 128,
            height: 128,
            mx: 'auto',
            borderRadius: `${r(40)}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: c.secondaryContainer,
            color: c.onSecondaryContainer,
            '& svg': { fontSize: 60 },
          }}
        >
          <PictureAsPdfRounded />
        </Box>
        <Typography sx={{ mt: 3, fontSize: { xs: '2.5rem', sm: '3.25rem' }, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>
          .pdf
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1.5 }}>
          {formatBytes(size)}
        </Typography>
        <Button variant="tonal" href={src} target="_blank" rel="noopener" startIcon={<OpenInNewRounded />} sx={{ mt: 3 }}>
          {t('PDF öffnen')}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 'min(1100px, 100%)',
        mx: 'auto',
        borderRadius: `${r(radius.xl)}px`,
        overflow: 'hidden',
        boxShadow: elevation[3],
        bgcolor: '#525659',
      }}
    >
      <Box
        component="iframe"
        src={src}
        title={t('PDF-Vorschau: {name}', { name })}
        sx={{ display: 'block', width: '100%', height: { xs: '72vh', md: 'min(84vh, calc(100dvh - 200px))' }, border: 0 }}
      />
    </Box>
  );
}
