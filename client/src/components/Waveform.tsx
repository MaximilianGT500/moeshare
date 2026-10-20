import { useMemo } from 'react';
import Box from '@mui/material/Box';
import { hueFromString, mix } from '../lib/color';
import { c, css, fileTypeColor } from '../theme/tokens';

export function Waveform({
  seed,
  playing,
  bars = 28,
  height = '42%',
}: {
  seed: string;
  playing: boolean;
  bars?: number;
  height?: string | number;
}) {
  const heights = useMemo(() => {
    let h = hueFromString(seed) + 7;
    return Array.from({ length: bars }, (_, i) => {
      h = (h * 9301 + 49297) % 233280;
      const wave = Math.sin((i / bars) * Math.PI);
      return 22 + Math.round((h / 233280) * 50 * (0.5 + wave * 0.5) + wave * 28);
    });
  }, [seed, bars]);
  return (
    <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: '3px', height, width: '100%' }}>
      {heights.map((bar, i) => (
        <Box
          key={i}
          sx={{
            flex: 1,
            height: `${bar}%`,
            borderRadius: 4,
            bgcolor: playing ? fileTypeColor.audio : mix(c.onSurface, 28),
            transformOrigin: 'center',
            animation: playing ? `moeshare-eq 900ms ${css.standard} ${(i % 7) * 70}ms infinite alternate` : 'none',
            transition: 'background-color 300ms',
          }}
        />
      ))}
    </Box>
  );
}

export const waveformKeyframes = { '@keyframes moeshare-eq': { from: { transform: 'scaleY(0.35)' }, to: { transform: 'scaleY(1)' } } };
