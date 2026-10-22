import { memo, useRef, useState, type MouseEvent, type PointerEvent, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import LockRounded from '@mui/icons-material/LockRounded';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import LooksOneRounded from '@mui/icons-material/LooksOneRounded';
import CloudOutlined from '@mui/icons-material/CloudOutlined';
import BlockRounded from '@mui/icons-material/BlockRounded';
import AccountBoxOutlined from '@mui/icons-material/AccountBoxOutlined';
import type { FileItem } from '../../lib/types';
import { t } from '../../lib/i18n';
import { syntaxLabel } from '../../lib/syntax';
import { extensionOf, formatBytes, formatNumber, relativeFromServer, relativeMs } from '../../lib/format';
import { meaningfulColor, mix } from '../../lib/color';
import { CopyIconButton } from '../../components/CopyButton';
import { fileIcon } from '../../components/FileIcons';
import { toggleAudio, useAudioState } from './audioPlayer';
import { Waveform } from '../../components/Waveform';
import { c, css, fileTypeColor, radius } from '../../theme/tokens';

export interface TileHandlers {
  onOpen: (file: FileItem, frame: HTMLElement | null) => void;
  onToggleSelect: (file: FileItem, shiftKey: boolean) => void;
  onMenu: (file: FileItem, anchor: HTMLElement | { x: number; y: number }) => void;
  register: (filename: string, el: HTMLElement | null) => void;
}

interface MediaTileProps extends TileHandlers {
  file: FileItem;
  selected: boolean;
  selecting: boolean;
  hidden: boolean;
  fresh: boolean;
  compact: boolean;
}

const glass = {
  bgcolor: 'rgb(12 10 16 / 0.46)',
  color: '#fff',
  backdropFilter: 'blur(10px)',
  '&:hover': { bgcolor: 'rgb(12 10 16 / 0.66)' },
};

const surfaceButton = {
  bgcolor: mix(c.surfaceContainerHighest, 90),
  color: c.onSurface,
  '&:hover': { bgcolor: c.surfaceContainerHighest },
};

function MediaImage({ file }: { file: FileItem }) {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'preview' | 'direct' | 'video'>(file.isGif ? 'direct' : 'preview');

  if (mode === 'video') {
    return (
      <video
        className="tile-media"
        src={`${file.urls.direct}#t=0.5`}
        muted
        playsInline
        preload="metadata"
        onLoadedData={() => setLoaded(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0 }}
      />
    );
  }

  return (
    <img
      className="tile-media"
      src={mode === 'preview' ? file.urls.preview : file.urls.direct}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (file.type === 'video') setMode('video');
        else if (mode === 'preview') setMode('direct');
      }}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0 }}
    />
  );
}

function AudioArt({ file, compact }: { file: FileItem; compact: boolean }) {
  const audio = useAudioState();
  const playing = audio.src === file.urls.direct && audio.playing;
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        p: compact ? 1 : 1.5,
        background: `linear-gradient(155deg, ${mix(fileTypeColor.audio, 34)}, ${c.surfaceContainerHigh} 70%)`,
      }}
    >
      <Box sx={{ height: compact ? 20 : 28 }} />
      <Waveform seed={file.filename} playing={playing} bars={compact ? 18 : 28} />
      <Box sx={{ minWidth: 0, height: 44, pr: 6, display: compact ? 'none' : 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <Typography
          variant="caption"
          component="p"
          noWrap
          sx={{ fontWeight: 700, color: c.onSurface, display: 'flex', alignItems: 'center', gap: 0.5, '& svg': { fontSize: 14 } }}
        >
          {fileIcon(file.filename, 'audio')}
          {extensionOf(file.filename).toUpperCase() || t('Audio')}
        </Typography>
        <Typography variant="caption" component="p" noWrap sx={{ color: c.onSurfaceVariant }}>
          {formatBytes(file.sizeBytes)}
        </Typography>
      </Box>
    </Box>
  );
}

function AudioPlayButton({ file, compact }: { file: FileItem; compact: boolean }) {
  const audio = useAudioState();
  const active = audio.src === file.urls.direct;
  const playing = active && audio.playing;
  return (
    <IconButton
      aria-label={playing ? t('{filename} pausieren', { filename: file.filename }) : t('{filename} abspielen', { filename: file.filename })}
      onClick={(event) => {
        event.stopPropagation();
        toggleAudio(file.urls.direct);
      }}
      sx={{
        position: 'absolute',
        zIndex: 2,
        right: compact ? '50%' : 12,
        bottom: compact ? 8 : 12,
        transform: compact ? 'translateX(50%)' : 'none',
        width: 44,
        height: 44,
        bgcolor: c.primaryContainer,
        color: c.onPrimaryContainer,
        boxShadow: active ? `0 0 0 4px ${mix(c.primary, 30)}` : 'none',
        '&:hover': { bgcolor: `color-mix(in srgb, ${c.onPrimaryContainer} 8%, ${c.primaryContainer})` },
      }}
    >
      {playing ? <PauseRounded /> : <PlayArrowRounded />}
    </IconButton>
  );
}

export const displayName = (file: FileItem) => file.title || file.originalName || file.filename;

function TextArt({ file, compact }: { file: FileItem; compact: boolean }) {
  const syntax = file.syntax && !['auto', 'plaintext'].includes(file.syntax) ? syntaxLabel(file.syntax) : '';
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        p: compact ? 1.25 : 1.75,
        background: `linear-gradient(160deg, ${mix(fileTypeColor.text, 22)}, ${c.surfaceContainerHigh} 65%)`,
        color: c.onSurface,
      }}
    >
      <Box aria-hidden sx={{ display: 'grid', gap: compact ? 0.6 : 0.8, mt: compact ? 3 : 4, opacity: 0.5 }}>
        {[86, 64, 92, 48].map((width, index) => (
          <Box key={index} sx={{ height: compact ? 4 : 6, width: `${width}%`, borderRadius: 3, bgcolor: c.onSurfaceVariant }} />
        ))}
      </Box>
      <Box sx={{ flex: 1 }} />
      <Typography
        component="p"
        noWrap
        sx={{ fontSize: compact ? '0.9375rem' : '1.125rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.01em', mb: 0.5 }}
      >
        {file.title || t('Text')}
      </Typography>
      <Typography variant="caption" component="p" sx={{ color: c.onSurfaceVariant }} noWrap>
        {[syntax, formatBytes(file.sizeBytes)].filter(Boolean).join(' · ')}
      </Typography>
    </Box>
  );
}

function StatusBadges({ file, compact, onMedia }: { file: FileItem; compact: boolean; onMedia: boolean }) {
  const items = [
    file.blocked ? { key: 'blocked', icon: <BlockRounded />, label: t('Von der Moderation gesperrt'), alert: true } : null,
    file.listed && !compact ? { key: 'listed', icon: <AccountBoxOutlined />, label: t('Im Profil sichtbar') } : null,
    file.password ? { key: 'lock', icon: <LockRounded />, label: t('Mit Passwort geschützt') } : null,
    file.maxViews ? { key: 'once', icon: <LooksOneRounded />, label: t('Nur einmal abrufbar') } : null,
    file.expiresAt ? { key: 'timer', icon: <TimerOutlined />, label: t('Läuft ab: {when}', { when: relativeMs(file.expiresAt) }) } : null,
    file.storage === 's3' && !compact ? { key: 's3', icon: <CloudOutlined />, label: t('Liegt in S3') } : null,
  ].filter(Boolean) as Array<{ key: string; icon: ReactElement; label: string; alert?: boolean }>;
  if (!items.length) return null;
  return (
    <Box
      sx={{
        position: 'absolute',
        right: compact ? 4 : 8,
        bottom: compact ? 4 : 8,
        zIndex: 1,
        display: 'flex',
        gap: 0.5,
        pointerEvents: 'auto',
      }}
    >
      {items.map((item) => (
        <Tooltip key={item.key} title={item.label}>
          <Box
            role="img"
            aria-label={item.label}
            sx={{
              width: compact ? 22 : 26,
              height: compact ? 22 : 26,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              '& svg': { fontSize: compact ? 13 : 15 },
              ...(item.alert
                ? { bgcolor: c.error, color: c.onError }
                : onMedia
                  ? glass
                  : { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer }),
            }}
          >
            {item.icon}
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

function FileArt({ file, compact }: { file: FileItem; compact: boolean }) {
  const ext = extensionOf(file.filename);
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        p: compact ? 1.25 : 1.75,
        bgcolor: c.surfaceContainerHigh,
        color: c.onSurface,
      }}
    >
      <Box sx={{ flex: 1 }} />
      <Box
        sx={{
          width: compact ? 30 : 36,
          height: compact ? 30 : 36,
          mb: compact ? 1 : 1.5,
          borderRadius: `${radius.tile}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.secondaryContainer,
          color: c.onSecondaryContainer,
          '& svg': { fontSize: compact ? 17 : 20 },
        }}
      >
        {fileIcon(file.filename, 'file')}
      </Box>
      <Typography
        component="p"
        sx={{ fontSize: compact ? '1.25rem' : '1.75rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', mb: 0.75 }}
      >
        .{ext || 'datei'}
      </Typography>
      <Typography variant="caption" component="p" sx={{ color: c.onSurfaceVariant }} noWrap>
        {formatBytes(file.sizeBytes)}
      </Typography>
    </Box>
  );
}

function MediaTileImpl({ file, selected, selecting, hidden, fresh, compact, onOpen, onToggleSelect, onMenu, register }: MediaTileProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const longPress = useRef<{ timer: number; x: number; y: number; fired: boolean }>({ timer: 0, x: 0, y: 0, fired: false });
  const visual = file.type === 'image' || file.type === 'video';
  const color = meaningfulColor(file.color);
  const glow = color ?? (file.type === 'audio' ? fileTypeColor.audio : c.primary);

  const clearPress = () => window.clearTimeout(longPress.current.timer);
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    longPress.current = {
      x: event.clientX,
      y: event.clientY,
      fired: false,
      timer: window.setTimeout(() => {
        longPress.current.fired = true;
        if (navigator.vibrate) navigator.vibrate(12);
        onToggleSelect(file, false);
      }, 460),
    };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - longPress.current.x, event.clientY - longPress.current.y) > 10) clearPress();
  };
  const onClick = (event: MouseEvent) => {
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return;
    }
    if (selecting) onToggleSelect(file, event.shiftKey);
    else onOpen(file, frameRef.current);
  };

  const name = displayName(file);
  const meta = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, opacity: 0.88 }}>
      <span>{formatBytes(file.sizeBytes)}</span>
      <span>{relativeFromServer(file.date)}</span>
      <Box
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}
        aria-label={t('{count} Aufrufe', { count: file.views })}
      >
        <VisibilityOutlined sx={{ fontSize: 13 }} />
        {formatNumber(file.views)}
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: `${compact ? radius.sm + 2 : radius.tile}px`,
        overflow: 'hidden',
        isolation: 'isolate',
        bgcolor: selected ? c.primaryContainer : color ? mix(color, 30) : c.surfaceContainer,
        transition: `box-shadow 320ms ${css.standard}, background-color 220ms ${css.standard}`,
        animation: fresh ? `moeshare-fresh 2.4s ${css.standard} 1` : 'none',
        '@media (hover: hover)': {
          '&:hover': { boxShadow: `0 18px 38px -16px ${mix(glow, 85)}, 0 0 0 1px ${mix(glow, 45)}` },
          '&:hover .tile-media': { transform: selected ? 'none' : 'scale(1.035)' },
          '&:hover .tile-ui, &:focus-within .tile-ui': { opacity: 1 },
        },
        '& .tile-media': { transition: `opacity 420ms ${css.standard}, transform 700ms ${css.decelerate}` },
        '& .tile-ui': { opacity: 0, transition: `opacity 200ms ${css.standard}` },
        '&:focus-within .tile-ui': { opacity: 1 },
      }}
    >
      <ButtonBase
        aria-label={
          selecting ? (selected ? t('{name} abwählen', { name }) : t('{name} auswählen', { name })) : t('{name} öffnen', { name })
        }
        aria-pressed={selecting ? selected : undefined}
        onClick={onClick}
        onContextMenu={(event) => {
          if (selecting) return;
          event.preventDefault();
          onMenu(file, { x: event.clientX, y: event.clientY });
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onPointerLeave={clearPress}
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          textAlign: 'left',
          borderRadius: 'inherit',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
        }}
      >
        <Box
          ref={(el: HTMLDivElement | null) => {
            frameRef.current = el;
            register(file.filename, el);
          }}
          sx={{
            position: 'absolute',
            inset: selected ? (compact ? '8px' : '12px') : 0,
            borderRadius: selected ? `${radius.sm}px` : 0,
            overflow: 'hidden',
            visibility: hidden ? 'hidden' : 'visible',
            transition: `inset 240ms ${css.standard}, border-radius 240ms ${css.standard}`,
          }}
        >
          {visual && <MediaImage file={file} />}
          {file.type === 'audio' && <AudioArt file={file} compact={compact} />}
          {file.type === 'file' && <FileArt file={file} compact={compact} />}
          {file.type === 'text' && <TextArt file={file} compact={compact} />}
        </Box>
      </ButtonBase>

      {!selecting && <StatusBadges file={file} compact={compact} onMedia={visual} />}

      {file.type === 'audio' && !selecting && <AudioPlayButton file={file} compact={compact} />}

      {file.type === 'video' && !selecting && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: compact ? 38 : 48,
            height: compact ? 38 : 48,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            ...glass,
            '& svg': { fontSize: compact ? 24 : 30, ml: '2px' },
          }}
        >
          <PlayArrowRounded />
        </Box>
      )}

      {file.isGif && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            px: 0.75,
            py: 0.125,
            borderRadius: `${radius.xs}px`,
            fontSize: '0.6875rem',
            fontWeight: 800,
            pointerEvents: 'none',
            ...glass,
          }}
        >
          GIF
        </Box>
      )}

      {visual && !selecting && (
        <Box
          className="tile-ui"
          aria-hidden
          sx={{
            position: 'absolute',
            insetInline: 0,
            bottom: 0,
            px: 1.25,
            pb: 1,
            pt: 5,
            color: '#fff',
            pointerEvents: 'none',
            background: 'linear-gradient(to top, rgb(0 0 0 / 0.74), rgb(0 0 0 / 0.32) 55%, transparent)',
            fontSize: '0.75rem',
            display: compact ? 'none' : 'block',
          }}
        >
          <Typography variant="caption" component="p" noWrap sx={{ fontWeight: 700, fontSize: '0.8125rem', mb: 0.25 }}>
            {name}
          </Typography>
          {meta}
        </Box>
      )}

      <Box
        className={selecting || selected ? undefined : 'tile-ui'}
        sx={{ position: 'absolute', top: compact ? 4 : 6, left: compact ? 4 : 6, zIndex: 2 }}
      >
        <Tooltip title={selected ? t('Abwählen') : t('Auswählen')}>
          <IconButton
            role="checkbox"
            aria-checked={selected}
            aria-label={selected ? t('{name} abwählen', { name }) : t('{name} auswählen', { name })}
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(file, event.shiftKey);
            }}
            sx={{ p: 0.5, color: '#fff' }}
          >
            <Box
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                border: selected ? 'none' : `2px solid ${visual ? 'rgb(255 255 255 / 0.9)' : c.outline}`,
                bgcolor: selected ? c.primary : visual ? 'rgb(12 10 16 / 0.35)' : mix(c.surface, 60),
                color: c.onPrimary,
                boxShadow: visual && !selected ? '0 1px 4px rgb(0 0 0 / 0.35)' : 'none',
                transition: `background-color 160ms ${css.standard}, transform 220ms ${css.standard}`,
                transform: selected ? 'scale(1.06)' : 'none',
                '& svg': { fontSize: 16 },
              }}
            >
              {selected && <CheckRounded />}
            </Box>
          </IconButton>
        </Tooltip>
      </Box>

      {!selecting && (
        <Box
          className="tile-ui"
          sx={{ position: 'absolute', top: compact ? 4 : 8, right: compact ? 4 : 8, display: 'flex', gap: 0.5, zIndex: 2 }}
        >
          <CopyIconButton
            value={file.urls.view}
            label={t('Link kopieren')}
            message={t('Link kopiert')}
            size="small"
            sx={{ width: 32, height: 32, fontSize: 18, ...(visual ? glass : surfaceButton) }}
          />
          <Tooltip title={t('Mehr')}>
            <IconButton
              aria-label={t('Aktionen für {name}', { name })}
              aria-haspopup="menu"
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onMenu(file, event.currentTarget);
              }}
              sx={{ width: 32, height: 32, ...(visual ? glass : surfaceButton) }}
            >
              <MoreVertRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

export const MediaTile = memo(MediaTileImpl);
