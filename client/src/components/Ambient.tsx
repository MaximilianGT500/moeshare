import { useState } from 'react';
import Box from '@mui/material/Box';
import { m } from 'motion/react';
import { mix } from '../lib/color';
import { c } from '../theme/tokens';

export function AmbientBackdrop({
  src,
  color,
  strength = 1,
  position = 'fixed',
}: {
  src?: string | null;
  color?: string | null;
  strength?: number;
  position?: 'fixed' | 'absolute';
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;
  return (
    <Box aria-hidden sx={{ position, inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {showImage && (
        <m.img
          src={src!}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          initial={{ opacity: 0, scale: 1.25 }}
          animate={loaded ? { opacity: 1, scale: 1.1 } : { opacity: 0, scale: 1.25 }}
          transition={{ duration: 1.2, ease: [0.2, 0, 0, 1] }}
          style={{
            position: 'absolute',
            inset: '-15%',
            width: '130%',
            height: '130%',
            objectFit: 'cover',
            filter: 'blur(80px) saturate(1.6)',
          }}
        />
      )}
      {!showImage && color && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(70% 55% at 50% 0%, ${mix(color, 38)}, transparent 72%)`,
          }}
        />
      )}
      <Box
        sx={(theme) => ({
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${mix(c.surface, 100 - 52 * strength)} 0%, ${mix(c.surface, 100 - 30 * strength)} 45%, ${c.surface} 92%)`,
          ...theme.applyStyles('light', {
            background: `linear-gradient(180deg, ${mix(c.surface, 100 - 38 * strength)} 0%, ${mix(c.surface, 100 - 20 * strength)} 45%, ${c.surface} 92%)`,
          }),
        })}
      />
    </Box>
  );
}
