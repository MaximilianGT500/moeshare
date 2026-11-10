import { forwardRef, useEffect, useRef, useState, type CSSProperties } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useForkRef } from '@mui/material/utils';
import type { Subtitle } from '../lib/types';

interface VideoPlayerProps {
  src: string;
  hls?: string | null;
  poster?: string | null;
  autoPlay?: boolean;
  style?: CSSProperties;
  className?: string;
  tracks?: Subtitle[];
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
  onEnded?: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(function VideoPlayer(
  { src, hls, poster, autoPlay = false, style, className, tracks, onLoadedMetadata, onEnded },
  ref
) {
  const local = useRef<HTMLVideoElement | null>(null);
  const handleRef = useForkRef(local, ref);

  useEffect(() => {
    const video = local.current;
    if (!video) return undefined;
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;

    if (hls && !video.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js/light')
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            video.src = src;
            return;
          }
          const player = new Hls({ enableWorker: true });
          player.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              player.destroy();
              video.src = src;
            }
          });
          player.loadSource(hls);
          player.attachMedia(video);
          instance = player;
        })
        .catch(() => {
          video.src = src;
        });
    } else {
      video.src = hls || src;
    }

    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, [src, hls]);

  return (
    <video
      ref={handleRef}
      className={className}
      poster={poster || undefined}
      controls
      playsInline
      autoPlay={autoPlay}
      preload="metadata"
      style={style}
      onLoadedMetadata={(event) => onLoadedMetadata?.(event.currentTarget)}
      onEnded={onEnded}
    >
      {(tracks || []).map((track) => (
        <track key={track.id} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} default={track.default} />
      ))}
    </video>
  );
});

interface VideoFrameProps {
  src: string;
  hls?: string | null;
  poster?: string | null;
  width?: number | null;
  height?: number | null;
  maxHeight: string;
  limit?: string;
  autoPlay?: boolean;
  className?: string;
  tracks?: Subtitle[];
  sx?: SxProps<Theme>;
  onEnded?: () => void;
}

const differs = (a: number, b: number) => !b || Math.abs(a - b) / b > 0.01;

export function VideoFrame({
  src,
  hls,
  poster,
  width,
  height,
  maxHeight,
  limit = '100%',
  autoPlay,
  className,
  tracks,
  sx,
  onEnded,
}: VideoFrameProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const stored = width && height ? width / height : 0;
  const w = natural?.w || width || 0;
  const h = natural?.h || height || 0;
  const ratio = w && h ? w / h : 16 / 9;
  const widest = w ? Math.max(320, Math.min(w, 1600)) : 1280;
  return (
    <Box
      className={className}
      sx={[
        {
          position: 'relative',
          width: `min(${limit}, ${widest}px, calc(${maxHeight} * ${ratio}))`,
          aspectRatio: `${ratio}`,
          maxWidth: '100%',
          mx: 'auto',
          bgcolor: '#000',
          overflow: 'hidden',
          lineHeight: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <VideoPlayer
        src={src}
        hls={hls}
        poster={poster}
        autoPlay={autoPlay}
        tracks={tracks}
        onEnded={onEnded}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
        onLoadedMetadata={(video) => {
          if (video.videoWidth && video.videoHeight && differs(video.videoWidth / video.videoHeight, stored)) {
            setNatural({ w: video.videoWidth, h: video.videoHeight });
          }
        }}
      />
    </Box>
  );
}
