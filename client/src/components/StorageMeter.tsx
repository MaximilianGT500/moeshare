import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { StorageBreakdown } from '../lib/types';
import { formatBytes } from '../lib/format';
import { c, ease, fileTypeColor, radius } from '../theme/tokens';

const SEGMENTS = [
  { key: 'images', label: 'Bilder', color: fileTypeColor.image },
  { key: 'videos', label: 'Videos', color: fileTypeColor.video },
  { key: 'audio', label: 'Audio', color: fileTypeColor.audio },
  { key: 'other', label: 'Sonstiges', color: fileTypeColor.other },
] as const;

export function StorageMeter({
  breakdown,
  animate = true,
  capacity = null,
}: {
  breakdown: StorageBreakdown;
  animate?: boolean;
  capacity?: number | null;
}) {
  const used = SEGMENTS.reduce((sum, s) => sum + (breakdown[s.key] || 0), 0);
  const total = capacity && capacity > used ? capacity : used;
  const free = capacity ? Math.max(0, capacity - used) : 0;
  const freeLabel = capacity && free < capacity && formatBytes(free) === formatBytes(capacity) ? formatBytes(free, 2) : formatBytes(free);
  const visible = SEGMENTS.filter((s) => (breakdown[s.key] || 0) > 0);

  return (
    <Box>
      <Box
        role="img"
        aria-label={`Speicherverteilung: ${visible.map((s) => `${s.label} ${formatBytes(breakdown[s.key])}`).join(', ') || 'leer'}`}
        sx={{
          display: 'flex',
          gap: '2px',
          height: 10,
          borderRadius: `${radius.full}px`,
          overflow: 'hidden',
          bgcolor: c.surfaceContainerHighest,
        }}
      >
        {total > 0 &&
          visible.map((segment, index) => {
            const share = (breakdown[segment.key] / total) * 100;
            return (
              <Tooltip key={segment.key} title={`${segment.label}: ${formatBytes(breakdown[segment.key])} (${Math.round(share)} %)`}>
                <m.div
                  initial={animate ? { scaleX: 0 } : false}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.15 + index * 0.08, duration: 0.7, ease: ease.emphasizedDecelerate }}
                  style={{
                    flexBasis: `${share}%`,
                    flexGrow: 0,
                    flexShrink: 1,
                    minWidth: 4,
                    height: '100%',
                    transformOrigin: 'left center',
                    background: segment.color,
                  }}
                />
              </Tooltip>
            );
          })}
      </Box>
      <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 1, listStyle: 'none', p: 0, m: 0, mt: 1.5 }}>
        {SEGMENTS.map((segment) => (
          <Box component="li" key={segment.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: segment.color, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {segment.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {formatBytes(breakdown[segment.key] || 0)}
            </Typography>
          </Box>
        ))}
        {capacity ? (
          <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '3px',
                bgcolor: c.surfaceContainerHighest,
                boxShadow: `inset 0 0 0 1px ${c.outlineVariant}`,
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Frei
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: free / capacity < 0.1 ? c.error : 'text.primary' }}>
              {freeLabel} von {formatBytes(capacity)}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
