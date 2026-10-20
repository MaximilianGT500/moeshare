import { forwardRef, useEffect, useRef, type CSSProperties } from 'react';
import { useForkRef } from '@mui/material/utils';

interface VideoPlayerProps {
  src: string;
  hls?: string | null;
  poster?: string | null;
  autoPlay?: boolean;
  style?: CSSProperties;
  className?: string;
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(function VideoPlayer(
  { src, hls, poster, autoPlay = false, style, className, onLoadedMetadata },
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
    />
  );
});
