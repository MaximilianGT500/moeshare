import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import Box from '@mui/material/Box';
import { useElementWidth } from '../lib/hooks';
import { mix } from '../lib/color';
import { t } from '../lib/i18n';
import { c } from '../theme/tokens';

const BAR = 3;
const GAP = 2;

export function resample(peaks: number[], count: number) {
  if (count <= 0 || !peaks.length) return [];
  if (peaks.length === count) return peaks;
  const result: number[] = [];
  for (let index = 0; index < count; index++) {
    const from = Math.floor((index * peaks.length) / count);
    const to = Math.max(from + 1, Math.floor(((index + 1) * peaks.length) / count));
    let peak = 0;
    for (let at = from; at < to && at < peaks.length; at++) peak = Math.max(peak, peaks[at]);
    result.push(peak);
  }
  return result;
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function PeaksWaveform({
  peaks,
  progress,
  color,
  height = 64,
  duration = 0,
  onSeek,
  label,
}: {
  peaks: number[];
  progress: number;
  color: string;
  height?: number | string;
  duration?: number;
  onSeek?: (fraction: number) => void;
  label?: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);
  const count = Math.max(8, Math.floor((width + GAP) / (BAR + GAP)));
  const bars = useMemo(() => resample(peaks, count), [peaks, count]);
  const played = Math.max(0, Math.min(1, progress || 0));
  const interactive = !!onSeek;

  const fractionAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSeek || !duration) return;
    const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -30, PageUp: 30 }[event.key];
    if (event.key === 'Home') onSeek(0);
    else if (event.key === 'End') onSeek(0.999);
    else if (step) onSeek(Math.max(0, Math.min(1, played + step / duration)));
    else return;
    event.preventDefault();
  };
  const position = played * duration;

  return (
    <Box
      ref={ref}
      role={interactive ? 'slider' : undefined}
      aria-hidden={interactive ? undefined : true}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label || t('Position') : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? Math.round(duration) : undefined}
      aria-valuenow={interactive ? Math.round(position) : undefined}
      aria-valuetext={interactive ? t('{time} von {total}', { time: clock(position), total: clock(duration) }) : undefined}
      onKeyDown={interactive ? keys : undefined}
      onPointerDown={
        interactive
          ? (event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              onSeek(fractionAt(event));
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (event) => {
              const fraction = fractionAt(event);
              setHover(fraction);
              if (dragging.current) onSeek(fraction);
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? () => {
              dragging.current = false;
            }
          : undefined
      }
      onPointerLeave={interactive ? () => setHover(null) : undefined}
      sx={{
        position: 'relative',
        width: '100%',
        height,
        cursor: interactive ? 'pointer' : 'default',
        touchAction: interactive ? 'none' : 'auto',
        outline: 'none',
        borderRadius: '6px',
        '&:focus-visible': { boxShadow: `0 0 0 3px ${mix(color, 45)}` },
      }}
    >
      {width > 0 && (
        <svg width={width} height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          {bars.map((value, index) => {
            const share = Math.max(2, value) / 100;
            const x = index * (BAR + GAP);
            const reached = (index + 0.5) / bars.length <= played;
            const near = hover !== null && (index + 0.5) / bars.length <= hover;
            return (
              <rect
                key={index}
                x={x}
                y={`${(50 - share * 50).toFixed(2)}%`}
                width={BAR}
                height={`${(share * 100).toFixed(2)}%`}
                rx={BAR / 2}
                fill={reached ? color : near ? mix(color, 55) : mix(c.onSurface, 26)}
              />
            );
          })}
        </svg>
      )}
    </Box>
  );
}
