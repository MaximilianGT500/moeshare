import { useState } from 'react';
import Box from '@mui/material/Box';
import type { FileItem } from '../lib/types';
import { meaningfulColor, mix } from '../lib/color';
import { fileIcon } from './FileIcons';
import { c, radius } from '../theme/tokens';

export function FileThumb({ file, size = 56, muted = false }: { file: FileItem; size?: number; muted?: boolean }) {
  const [failed, setFailed] = useState(false);
  const visual = (file.type === 'image' || file.type === 'video') && !failed;
  const tint = meaningfulColor(file.color);
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: `${Math.min(radius.tile, size / 4)}px`,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        bgcolor: tint ? mix(tint, 40) : c.surfaceContainerHighest,
        color: c.onSurfaceVariant,
        '& svg': { fontSize: Math.round(size * 0.46) },
      }}
    >
      {visual ? (
        <img
          src={file.isGif ? file.urls.direct : file.urls.preview}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: muted ? 'grayscale(0.55)' : undefined,
            opacity: muted ? 0.8 : 1,
          }}
        />
      ) : (
        fileIcon(file.filename, file.type)
      )}
    </Box>
  );
}
