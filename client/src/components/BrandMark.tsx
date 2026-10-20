import { useState } from 'react';
import Box from '@mui/material/Box';
import { c } from '../theme/tokens';

export function BrandMark({ src, title, size = 40, ring = false }: { src: string; title: string; size?: number; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const letter = (title || 'M').trim().charAt(0).toUpperCase();
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        bgcolor: c.primaryContainer,
        color: c.onPrimaryContainer,
        fontWeight: 800,
        fontSize: size * 0.44,
        boxShadow: ring ? `0 0 0 3px ${c.surface}, 0 0 0 5px ${c.primary}` : 'none',
      }}
    >
      {src && !failed ? (
        <Box
          component="img"
          src={src}
          alt=""
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        letter
      )}
    </Box>
  );
}
