import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import type { FileItem } from '../../lib/types';
import { justify, tileAspect } from '../../lib/justified';
import { useElementWidth } from '../../lib/hooks';
import { MediaTile, type TileHandlers } from './MediaTile';
import { ease } from '../../theme/tokens';

interface GalleryProps extends TileHandlers {
  files: FileItem[];
  selected: Set<string>;
  selecting: boolean;
  hiddenFilename: string | null;
  fresh: Set<string>;
  cascade: boolean;
  dimmed: boolean;
  loadingMore: boolean;
}

function metrics(width: number) {
  if (width < 600) return { target: 136, gap: 6, compact: true };
  if (width < 900) return { target: 172, gap: 8, compact: false };
  if (width < 1500) return { target: 220, gap: 8, compact: false };
  return { target: 250, gap: 10, compact: false };
}

interface Placed {
  file: FileItem;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Gallery({ files, selected, selecting, hiddenFilename, fresh, cascade, dimmed, loadingMore, ...handlers }: GalleryProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { target, gap, compact } = metrics(width);

  const [resizing, setResizing] = useState(false);
  const lastWidth = useRef(width);
  useEffect(() => {
    if (lastWidth.current === width) return undefined;
    const first = lastWidth.current === 0;
    lastWidth.current = width;
    if (first) return undefined;
    setResizing(true);
    const timer = window.setTimeout(() => setResizing(false), 180);
    return () => window.clearTimeout(timer);
  }, [width]);

  const { placed, height } = useMemo(() => {
    const rows = justify(files, tileAspect, width, { targetHeight: target, gap });
    const out: Placed[] = [];
    let y = 0;
    let index = 0;
    for (const row of rows) {
      let x = 0;
      const h = Math.round(row.height);
      row.cells.forEach((cell, i) => {
        const isLast = i === row.cells.length - 1;
        const nextX = row.complete && isLast ? width : x + cell.width;
        const left = Math.round(x);
        const w = Math.max(1, Math.round(nextX) - left);
        out.push({ file: cell.item, index, x: left, y, w, h });
        x = nextX + gap;
        index += 1;
      });
      y += h + gap;
    }
    return { placed: out, height: Math.max(0, y - gap) };
  }, [files, width, target, gap]);

  const skeletonY = height + (placed.length ? gap : 0);
  const skeletonWidths = useMemo(() => [1.6, 1, 1.33, 0.8, 1.5, 1.2].map((a) => a * target), [target]);

  const moveTransition = resizing ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 38, mass: 0.9 };

  return (
    <Box
      ref={ref}
      sx={{
        position: 'relative',
        width: '100%',
        height: height + (loadingMore ? target + gap : 0),
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 240ms cubic-bezier(0.2, 0, 0, 1)',
        pointerEvents: dimmed ? 'none' : 'auto',
      }}
    >
      {width > 0 && (
        <AnimatePresence initial={cascade}>
          {placed.map(({ file, index, x, y, w, h }) => (
            <m.div
              key={file.filename}
              initial={{ opacity: 0, x, y: y + 18, width: w, height: h, scale: 0.97 }}
              animate={{ opacity: 1, x, y, width: w, height: h, scale: 1 }}
              exit={{ opacity: 0, scale: 0.86, transition: { duration: 0.22, ease: ease.emphasizedAccelerate } }}
              transition={{
                default: moveTransition,
                opacity: { duration: 0.45, delay: cascade ? Math.min(index, 24) * 0.028 : 0, ease: ease.standard },
                scale: { duration: 0.5, delay: cascade ? Math.min(index, 24) * 0.028 : 0, ease: ease.emphasizedDecelerate },
              }}
              style={{ position: 'absolute', left: 0, top: 0, contentVisibility: 'auto' }}
            >
              <MediaTile
                file={file}
                selected={selected.has(file.filename)}
                selecting={selecting}
                hidden={hiddenFilename === file.filename}
                fresh={fresh.has(file.filename)}
                compact={compact}
                {...handlers}
              />
            </m.div>
          ))}
        </AnimatePresence>
      )}

      {loadingMore && (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: skeletonY,
            display: 'flex',
            gap: `${gap}px`,
            overflow: 'hidden',
            height: target,
          }}
        >
          {skeletonWidths.map((w, i) => (
            <Skeleton key={i} variant="rounded" animation="wave" sx={{ flex: `0 0 ${w}px`, height: target }} />
          ))}
        </Box>
      )}
    </Box>
  );
}
