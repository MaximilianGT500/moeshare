import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import GlobalStyles from '@mui/material/GlobalStyles';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import Modal from '@mui/material/Modal';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import ShareRounded from '@mui/icons-material/ShareRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CalendarTodayRounded from '@mui/icons-material/CalendarTodayRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import AspectRatioRounded from '@mui/icons-material/AspectRatioRounded';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import { readBoot } from '../../lib/boot';
import { SiteFooter } from '../../components/SiteFooter';
import type { ViewBoot } from '../../lib/types';
import { extensionOf, formatBytes, formatDateTime, formatNumber, parseServerDate, relativeFromServer } from '../../lib/format';
import { meaningfulColor, mix } from '../../lib/color';
import { BrandMark } from '../../components/BrandMark';
import { AmbientBackdrop } from '../../components/Ambient';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { CopyTextButton } from '../../components/CopyButton';
import { ShareMenuItems } from '../../components/ShareList';
import { UserAvatar } from '../../components/UserAvatar';
import { VideoPlayer } from '../../components/VideoPlayer';
import { Waveform, waveformKeyframes } from '../../components/Waveform';
import { fileIcon, typeDescription } from '../../components/FileIcons';
import { c, ease, elevation, radius } from '../../theme/tokens';

function Meta({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <Box
      component="li"
      title={title}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', '& svg': { fontSize: 18 } }}
    >
      {icon}
      <Typography variant="body2" component="span" sx={{ color: 'text.primary' }}>
        {children}
      </Typography>
    </Box>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function AudioStage({ src, seed }: { src: string; seed: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };
  return (
    <Box
      sx={{
        width: 'min(860px, 100%)',
        mx: 'auto',
        p: { xs: 2.5, sm: 4 },
        borderRadius: `${radius.xl}px`,
        bgcolor: mix(c.surfaceContainerHigh, 88),
        backdropFilter: 'blur(20px)',
        boxShadow: elevation[3],
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, sm: 3 } }}>
        <IconButton
          aria-label={playing ? 'Pausieren' : 'Abspielen'}
          onClick={toggle}
          sx={{
            width: { xs: 64, sm: 80 },
            height: { xs: 64, sm: 80 },
            flexShrink: 0,
            bgcolor: c.primaryContainer,
            color: c.onPrimaryContainer,
            boxShadow: elevation[2],
            transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1), background-color 200ms',
            '&:hover': { bgcolor: `color-mix(in srgb, ${c.onPrimaryContainer} 8%, ${c.primaryContainer})` },
            '&:active': { transform: 'scale(0.94)' },
            '& svg': { fontSize: { xs: 34, sm: 42 } },
          }}
        >
          {playing ? <PauseRounded /> : <PlayArrowRounded />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, height: { xs: 64, sm: 80 }, display: 'flex', alignItems: 'center' }}>
          <Waveform seed={seed} playing={playing} bars={44} height="100%" />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 40, fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(time)}
        </Typography>
        <Slider
          aria-label="Position"
          size="small"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(time, duration || 1)}
          onChange={(_event, value) => {
            const el = audio.current;
            if (el && typeof value === 'number') {
              el.currentTime = value;
              setTime(value);
            }
          }}
          getAriaValueText={(value) => formatTime(value)}
          sx={{ flex: 1 }}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(duration)}
        </Typography>
      </Box>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      />
    </Box>
  );
}

function FileStage({ filename, size }: { filename: string; size: number }) {
  return (
    <Box
      sx={{
        width: 'min(860px, 100%)',
        mx: 'auto',
        py: { xs: 5, sm: 7 },
        px: 3,
        borderRadius: `${radius.xl}px`,
        textAlign: 'center',
        bgcolor: mix(c.surfaceContainerHigh, 88),
        backdropFilter: 'blur(20px)',
        boxShadow: elevation[3],
      }}
    >
      <Box
        sx={{
          width: 128,
          height: 128,
          mx: 'auto',
          borderRadius: '40px',
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.secondaryContainer,
          color: c.onSecondaryContainer,
          '& svg': { fontSize: 60 },
        }}
      >
        {fileIcon(filename, 'file')}
      </Box>
      <Typography sx={{ mt: 3, fontSize: { xs: '2.5rem', sm: '3.25rem' }, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>
        .{extensionOf(filename) || 'datei'}
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1.5 }}>
        {formatBytes(size)}
      </Typography>
    </Box>
  );
}

function ImageZoom({
  src,
  origin,
  width,
  height,
  onClose,
}: {
  src: string;
  origin: DOMRect;
  width: number;
  height: number;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const pad = 24;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w0 = width || origin.width;
  const h0 = height || origin.height;
  const scale = Math.min((vw - pad * 2) / w0, (vh - pad * 2) / h0, Math.max(1, origin.width / w0));
  const target = { width: w0 * scale, height: h0 * scale };
  const left = (vw - target.width) / 2;
  const top = (vh - target.height) / 2;
  const from = {
    x: origin.left + origin.width / 2 - (left + target.width / 2),
    y: origin.top + origin.height / 2 - (top + target.height / 2),
    scale: origin.width / target.width,
  };
  return (
    <Modal open onClose={() => setClosing(true)} hideBackdrop sx={{ zIndex: 1400 }} aria-label="Bild in voller Größe">
      <Box sx={{ position: 'fixed', inset: 0, outline: 'none' }} tabIndex={-1} onClick={() => setClosing(true)}>
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: closing ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          style={{ position: 'absolute', inset: 0, background: 'rgb(8 6 12 / 0.92)', backdropFilter: 'blur(6px)' }}
        />
        <m.img
          src={src}
          alt=""
          initial={from}
          animate={closing ? from : { x: 0, y: 0, scale: 1 }}
          transition={{ duration: closing ? 0.32 : 0.45, ease: closing ? ease.standard : ease.emphasizedDecelerate }}
          onAnimationComplete={() => closing && onClose()}
          style={{
            position: 'absolute',
            left,
            top,
            width: target.width,
            height: target.height,
            borderRadius: 12,
            boxShadow: elevation[5],
            cursor: 'zoom-out',
          }}
        />
        <IconButton
          aria-label="Schließen"
          onClick={() => setClosing(true)}
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: '#fff',
            bgcolor: 'rgb(255 255 255 / 0.12)',
            '&:hover': { bgcolor: 'rgb(255 255 255 / 0.22)' },
          }}
        >
          <CloseRounded />
        </IconButton>
      </Box>
    </Modal>
  );
}

export function ViewPage() {
  const boot = readBoot<ViewBoot>();
  const { site, file, urls } = boot;
  const [shareAnchor, setShareAnchor] = useState<HTMLElement | null>(null);
  const [zoom, setZoom] = useState<DOMRect | null>(null);
  const [loaded, setLoaded] = useState(file.type !== 'image');
  const imgRef = useRef<HTMLImageElement>(null);
  const accent = meaningfulColor(boot.accent);
  const date = parseServerDate(file.date);
  const shareable = { filename: file.filename, type: file.type, urls: { view: urls.view, direct: urls.direct } };
  const backdrop = file.type === 'image' ? urls.display : file.type === 'video' ? urls.poster : null;

  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  const media = (() => {
    if (file.type === 'image') {
      return (
        <Box
          component="img"
          ref={imgRef}
          src={urls.display}
          alt={file.filename}
          width={file.width || undefined}
          height={file.height || undefined}
          onLoad={() => setLoaded(true)}
          onClick={(event) => setZoom((event.currentTarget as HTMLImageElement).getBoundingClientRect())}
          title="In voller Größe ansehen"
          sx={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: { xs: '58vh', md: 'max(360px, min(72vh, calc(100dvh - 300px)))' },
            width: 'auto',
            height: 'auto',
            mx: 'auto',
            borderRadius: `${radius.lg}px`,
            cursor: 'zoom-in',
            visibility: zoom ? 'hidden' : 'visible',
            boxShadow: `0 30px 80px -24px ${accent ? mix(accent, 70) : 'rgb(0 0 0 / 0.55)'}, ${elevation[3]}`,
          }}
        />
      );
    }
    if (file.type === 'video') {
      return (
        <Box
          sx={{
            borderRadius: `${radius.lg}px`,
            overflow: 'hidden',
            bgcolor: '#000',
            boxShadow: elevation[4],
            mx: 'auto',
            width: 'fit-content',
            maxWidth: '100%',
            lineHeight: 0,
          }}
        >
          <VideoPlayer
            src={urls.direct}
            hls={urls.hls}
            poster={urls.poster}
            style={{
              display: 'block',
              width: `min(100%, ${file.width ? Math.max(320, Math.min(file.width, 1280)) : 1280}px, calc(max(360px, min(72vh, 100dvh - 300px)) * ${file.width && file.height ? file.width / file.height : 16 / 9}))`,
              aspectRatio: file.width && file.height ? `${file.width} / ${file.height}` : '16 / 9',
            }}
          />
        </Box>
      );
    }
    if (file.type === 'audio') return <AudioStage src={urls.direct} seed={file.filename} />;
    return <FileStage filename={file.filename} size={file.sizeBytes} />;
  })();

  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <GlobalStyles styles={waveformKeyframes} />
      <AmbientBackdrop src={backdrop} color={accent ?? c.primary} />

      <Box
        component="header"
        sx={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 3 }, height: 64 }}
      >
        <BrandMark src={site.favicon} title={site.title} size={34} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }} noWrap>
          {site.title}
        </Typography>
        <ThemeToggleButton />
      </Box>

      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          maxWidth: 1240,
          mx: 'auto',
          px: { xs: 2, md: 3 },
          pt: { xs: 1, md: 2 },
          pb: 6,
        }}
      >
        <m.figure
          initial={{ opacity: 0, scale: 0.96, y: 16, filter: 'blur(10px)' }}
          animate={loaded ? { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' } : undefined}
          transition={{ duration: 0.7, ease: ease.emphasizedDecelerate }}
          style={{ margin: 0 }}
        >
          {media}
        </m.figure>

        {boot.hlsConverting && (
          <Alert severity="info" sx={{ maxWidth: 720, mx: 'auto', mt: 2 }}>
            Das Video wird gerade fürs Streaming aufbereitet. Bis dahin läuft die Originaldatei.
          </Alert>
        )}

        <m.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: ease.emphasizedDecelerate }}
          style={{ maxWidth: 860, margin: '0 auto' }}
        >
          <Box
            sx={{
              mt: { xs: 2.5, md: 3.5 },
              p: { xs: 2, sm: 3 },
              borderRadius: `${radius.xl}px`,
              bgcolor: mix(c.surfaceContainerLow, 82),
              backdropFilter: 'blur(24px) saturate(1.2)',
              border: `1px solid ${mix(c.outlineVariant, 55)}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: `${radius.tile}px`,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: c.primaryContainer,
                  color: c.onPrimaryContainer,
                  '& svg': { fontSize: 22 },
                }}
              >
                {fileIcon(file.filename, file.type)}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" component="h1" noWrap sx={{ fontWeight: 700 }} title={file.filename}>
                  {file.filename}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {typeDescription(file.filename, file.type, file.isGif)}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2.5 }}>
              <Button variant="contained" startIcon={<DownloadRounded />} href={urls.download}>
                Herunterladen
              </Button>
              <CopyTextButton value={urls.view} variant="tonal" message="Link kopiert">
                Link kopieren
              </CopyTextButton>
              <Button
                variant="outlined"
                startIcon={<ShareRounded />}
                onClick={(event) => setShareAnchor(event.currentTarget)}
                aria-haspopup="menu"
              >
                Teilen
              </Button>
              {(file.type === 'image' || file.type === 'file') && (
                <Tooltip title="Original in neuem Tab öffnen">
                  <Button startIcon={<OpenInNewRounded />} href={urls.direct} target="_blank" rel="noopener">
                    Original
                  </Button>
                </Tooltip>
              )}
            </Box>
            <Menu anchorEl={shareAnchor} open={!!shareAnchor} onClose={() => setShareAnchor(null)}>
              <ShareMenuItems file={shareable} onDone={() => setShareAnchor(null)} />
            </Menu>

            <Box
              component="ul"
              sx={{ listStyle: 'none', p: 0, m: 0, mt: 2.5, display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 1.25 }}
            >
              <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <UserAvatar name={file.username} size={24} />
                <Typography variant="body2">{file.username}</Typography>
              </Box>
              {date && (
                <Meta icon={<CalendarTodayRounded />} title={formatDateTime(date)}>
                  {relativeFromServer(file.date)}
                </Meta>
              )}
              <Meta icon={<SaveRounded />}>{formatBytes(file.sizeBytes)}</Meta>
              {file.width > 0 && file.height > 0 && (
                <Meta icon={<AspectRatioRounded />}>
                  {formatNumber(file.width)} × {formatNumber(file.height)}
                </Meta>
              )}
              <Meta icon={<VisibilityOutlined />}>{file.views === 1 ? '1 Aufruf' : `${formatNumber(file.views)} Aufrufe`}</Meta>
            </Box>
          </Box>
        </m.section>
      </Box>

      <SiteFooter site={site} sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3 }} />

      <AnimatePresence>
        {zoom && file.type === 'image' && (
          <ImageZoom src={urls.direct} origin={zoom} width={file.width} height={file.height} onClose={() => setZoom(null)} />
        )}
      </AnimatePresence>
    </Box>
  );
}
