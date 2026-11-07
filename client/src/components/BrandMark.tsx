import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { c } from '../theme/tokens';
import { AppIcon } from './AppIcon';

export function BrandMark({
  src,
  size = 40,
  ring = false,
}: {
  src: string | null | undefined;
  title?: string;
  size?: number;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <Box
        aria-hidden
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          boxShadow: ring ? `0 0 0 3px ${c.surface}, 0 0 0 5px ${c.primary}` : 'none',
        }}
      >
        <AppIcon size={size} />
      </Box>
    );
  }
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
        boxShadow: ring ? `0 0 0 3px ${c.surface}, 0 0 0 5px ${c.primary}` : 'none',
      }}
    >
      <Box
        component="img"
        src={src}
        alt=""
        onError={() => setFailed(true)}
        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </Box>
  );
}
