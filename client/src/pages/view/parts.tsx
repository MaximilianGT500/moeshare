import { useEffect, useRef, useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import Modal from '@mui/material/Modal';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
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
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import type { SiteInfo, ViewBoot, ViewFile, ViewUrls } from '../../lib/types';
import { t, tn } from '../../lib/i18n';
import { useDesign } from '../../lib/design';
import { extensionOf, formatBytes, formatDateTime, formatNumber, parseServerDate, relativeFromServer, relativeMs } from '../../lib/format';
import { mix } from '../../lib/color';
import { DesignBackdrop } from '../../components/OwnerPage';
import { BrandMark } from '../../components/BrandMark';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { CopyIconButton, CopyTextButton, CopyTextLink } from '../../components/CopyButton';
import { ShareMenuItems } from '../../components/ShareList';
import { UserAvatar } from '../../components/UserAvatar';
import { VideoPlayer } from '../../components/VideoPlayer';
import { Waveform } from '../../components/Waveform';
import { fileIcon, typeDescription } from '../../components/FileIcons';
import { SiteFooter } from '../../components/SiteFooter';
import { ReportButton } from '../../components/ReportDialog';
import { TextStage } from './TextStage';
import { c, ease, elevation, radius } from '../../theme/tokens';

export interface ViewModel {
  site: SiteInfo;
  file: ViewFile;
  urls: ViewUrls;
  label: string;
  accent: string;
  boot: ViewBoot;
}

export const labelOf = (file: ViewFile) => file.title || file.originalName || file.filename;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function AudioStage({ src, seed }: { src: string; seed: string }) {
  const { r } = useDesign();
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
        borderRadius: `${r(radius.xl)}px`,
        bgcolor: mix(c.surfaceContainerHigh, 88),
        backdropFilter: 'blur(20px)',
        boxShadow: elevation[3],
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, sm: 3 } }}>
        <IconButton
          aria-label={playing ? t('Pausieren') : t('Abspielen')}
          onClick={toggle}
          sx={{
            width: { xs: 64, sm: 80 },
            height: { xs: 64, sm: 80 },
            flexShrink: 0,
            borderRadius: `${r(40)}px`,
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
          aria-label={t('Position')}
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

export function FileStage({ filename, size }: { filename: string; size: number }) {
  const { r } = useDesign();
  return (
    <Box
      sx={{
        width: 'min(860px, 100%)',
        mx: 'auto',
        py: { xs: 5, sm: 7 },
        px: 3,
        borderRadius: `${r(radius.xl)}px`,
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
          borderRadius: `${r(40)}px`,
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

export function ImageZoom({
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
    <Modal open onClose={() => setClosing(true)} hideBackdrop sx={{ zIndex: 1400 }} aria-label={t('Bild in voller Größe')}>
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
          aria-label={t('Schließen')}
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

export type MediaFit = 'framed' | 'stage' | 'flat';

export function MediaStage({
  model,
  fit = 'framed',
  maxHeight,
  onZoom,
  onLoaded,
  hidden = false,
}: {
  model: ViewModel;
  fit?: MediaFit;
  maxHeight?: string | Record<string, string>;
  onZoom?: (rect: DOMRect) => void;
  onLoaded?: () => void;
  hidden?: boolean;
}) {
  const { r } = useDesign();
  const { file, urls, label, accent } = model;
  const frame = fit === 'framed';
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (imageRef.current?.complete) onLoaded?.();
  }, []);
  const height = maxHeight ?? { xs: '58vh', md: 'max(360px, min(72vh, calc(100dvh - 300px)))' };
  if (file.type === 'image') {
    return (
      <Box
        component="img"
        className="ms-media"
        src={urls.display}
        alt={label}
        width={file.width || undefined}
        height={file.height || undefined}
        onLoad={onLoaded}
        ref={imageRef}
        onClick={(event) => onZoom?.((event.currentTarget as HTMLImageElement).getBoundingClientRect())}
        title={t('In voller Größe ansehen')}
        sx={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: height,
          width: 'auto',
          height: 'auto',
          mx: 'auto',
          objectFit: 'contain',
          borderRadius: fit === 'stage' ? 0 : `${r(radius.lg)}px`,
          cursor: 'zoom-in',
          visibility: hidden ? 'hidden' : 'visible',
          boxShadow: frame ? `0 30px 80px -24px ${mix(accent, 70)}, ${elevation[3]}` : 'none',
        }}
      />
    );
  }
  if (file.type === 'video') {
    const ratio = file.width && file.height ? file.width / file.height : 16 / 9;
    const limit = typeof height === 'string' ? height : 'max(360px, min(72vh, 100dvh - 300px))';
    return (
      <Box
        className="ms-media"
        sx={{
          borderRadius: fit === 'stage' ? 0 : `${r(radius.lg)}px`,
          overflow: 'hidden',
          bgcolor: '#000',
          boxShadow: frame ? elevation[4] : 'none',
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
            width: `min(100%, ${file.width ? Math.max(320, Math.min(file.width, 1600)) : 1280}px, calc(${limit} * ${ratio}))`,
            aspectRatio: file.width && file.height ? `${file.width} / ${file.height}` : '16 / 9',
          }}
        />
      </Box>
    );
  }
  if (file.type === 'audio') {
    return (
      <Box className="ms-media">
        <AudioStage src={urls.direct} seed={file.filename} />
      </Box>
    );
  }
  if (file.type === 'text') {
    return (
      <Box className="ms-media">
        <TextStage
          rawUrl={urls.raw}
          syntax={file.syntax || 'auto'}
          preview={file.textPreview}
          sizeBytes={file.sizeBytes}
          downloadUrl={urls.download}
        />
      </Box>
    );
  }
  return (
    <Box className="ms-media">
      <FileStage filename={file.filename} size={file.sizeBytes} />
    </Box>
  );
}

export type ActionStyle = 'buttons' | 'compact' | 'links' | 'glass';

export function Actions({ model, style = 'buttons' }: { model: ViewModel; style?: ActionStyle }) {
  const { shows, r } = useDesign();
  const { file, urls, label } = model;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const shareable = {
    filename: label,
    type: file.type,
    urls: { view: urls.view, direct: file.protected || file.once ? urls.view : urls.direct },
  };
  const original = (file.type === 'image' || file.type === 'file') && !file.once && shows('original');
  const glass = style === 'glass';
  const iconSx = glass ? { color: '#fff', '&:hover': { bgcolor: 'rgb(255 255 255 / 0.14)' } } : {};

  const menu = (
    <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ root: { sx: { zIndex: 1500 } } }}>
      <ShareMenuItems file={shareable} onDone={() => setAnchor(null)} />
    </Menu>
  );

  if (style === 'compact' || glass) {
    return (
      <Box className="ms-actions" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {shows('copy') && <CopyIconButton value={urls.view} message={t('Link kopiert')} sx={iconSx} />}
        {shows('share') && (
          <Tooltip title={t('Teilen')}>
            <IconButton aria-label={t('Teilen')} aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)} sx={iconSx}>
              <ShareRounded />
            </IconButton>
          </Tooltip>
        )}
        {original && (
          <Tooltip title={t('Original in neuem Tab öffnen')}>
            <IconButton aria-label={t('Original')} href={urls.direct} target="_blank" rel="noopener" sx={iconSx}>
              <OpenInNewRounded />
            </IconButton>
          </Tooltip>
        )}
        {shows('download') && (
          <Button
            variant="contained"
            href={urls.download}
            startIcon={<DownloadRounded />}
            sx={{
              ml: 0.5,
              borderRadius: `${r(radius.full)}px`,
              ...(glass ? { bgcolor: '#fff', color: '#111', '&:hover': { bgcolor: '#f1f1f1' } } : {}),
            }}
          >
            {t('Herunterladen')}
          </Button>
        )}
        {menu}
      </Box>
    );
  }

  if (style === 'links') {
    const link = { color: 'text.primary', fontWeight: 700, textUnderlineOffset: '4px' };
    return (
      <Box className="ms-actions" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 1 }}>
        {shows('download') && (
          <Link href={urls.download} underline="always" sx={link}>
            {t('Herunterladen')}
          </Link>
        )}
        {shows('copy') && (
          <CopyTextLink value={urls.view} message={t('Link kopiert')} sx={link}>
            {t('Link kopieren')}
          </CopyTextLink>
        )}
        {shows('share') && (
          <Link component="button" type="button" underline="always" sx={link} onClick={(event) => setAnchor(event.currentTarget)}>
            {t('Teilen')}
          </Link>
        )}
        {original && (
          <Link href={urls.direct} target="_blank" rel="noopener" underline="always" sx={link}>
            {t('Original')}
          </Link>
        )}
        {menu}
      </Box>
    );
  }

  return (
    <Box className="ms-actions" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      {shows('download') && (
        <Button variant="contained" startIcon={<DownloadRounded />} href={urls.download} sx={{ borderRadius: `${r(radius.full)}px` }}>
          {t('Herunterladen')}
        </Button>
      )}
      {shows('copy') && (
        <CopyTextButton value={urls.view} variant="tonal" message={t('Link kopiert')} sx={{ borderRadius: `${r(radius.full)}px` }}>
          {t('Link kopieren')}
        </CopyTextButton>
      )}
      {shows('share') && (
        <Button
          variant="outlined"
          startIcon={<ShareRounded />}
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-haspopup="menu"
          sx={{ borderRadius: `${r(radius.full)}px` }}
        >
          {t('Teilen')}
        </Button>
      )}
      {original && (
        <Tooltip title={t('Original in neuem Tab öffnen')}>
          <Button
            startIcon={<OpenInNewRounded />}
            href={urls.direct}
            target="_blank"
            rel="noopener"
            sx={{ borderRadius: `${r(radius.full)}px` }}
          >
            {t('Original')}
          </Button>
        </Tooltip>
      )}
      {menu}
    </Box>
  );
}

function MetaItem({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <Box
      component="li"
      title={title}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', '& svg': { fontSize: 18 } }}
    >
      {icon}
      <Typography variant="body2" component="span" sx={{ color: 'inherit' }}>
        {children}
      </Typography>
    </Box>
  );
}

export function Owner({ model, size = 24 }: { model: ViewModel; size?: number }) {
  const profile = model.boot.profile;
  const name = profile?.name || model.file.username;
  const content = (
    <>
      <UserAvatar name={model.file.username} size={size} />
      <Typography variant="body2" component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
        {name}
      </Typography>
    </>
  );
  if (profile) {
    return (
      <Link
        href={profile.url}
        underline="hover"
        className="ms-owner"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: 'inherit' }}
      >
        {content}
      </Link>
    );
  }
  return (
    <Box className="ms-owner" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {content}
    </Box>
  );
}

export function MetaList({ model, owner = true, dense = false }: { model: ViewModel; owner?: boolean; dense?: boolean }) {
  const { shows } = useDesign();
  const { file } = model;
  const date = parseServerDate(file.date);
  return (
    <Box
      component="ul"
      className="ms-meta"
      sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexWrap: 'wrap', columnGap: dense ? 2 : 3, rowGap: dense ? 0.75 : 1.25 }}
    >
      {owner && shows('owner') && (
        <Box component="li" sx={{ display: 'flex', alignItems: 'center' }}>
          <Owner model={model} />
        </Box>
      )}
      {shows('date') && date && (
        <MetaItem icon={<CalendarTodayRounded />} title={formatDateTime(date)}>
          {relativeFromServer(file.date)}
        </MetaItem>
      )}
      {shows('size') && <MetaItem icon={<SaveRounded />}>{formatBytes(file.sizeBytes)}</MetaItem>}
      {shows('resolution') && file.width > 0 && file.height > 0 && (
        <MetaItem icon={<AspectRatioRounded />}>
          {formatNumber(file.width)} × {formatNumber(file.height)}
        </MetaItem>
      )}
      {shows('views') && <MetaItem icon={<VisibilityOutlined />}>{tn(file.views, '1 Aufruf', '{count} Aufrufe')}</MetaItem>}
      {file.expiresAt && (
        <MetaItem icon={<TimerOutlined />} title={formatDateTime(new Date(file.expiresAt))}>
          {t('wird gelöscht {when}', { when: relativeMs(file.expiresAt) })}
        </MetaItem>
      )}
      {file.protected && <MetaItem icon={<LockOutlined />}>{t('Mit Passwort geschützt')}</MetaItem>}
    </Box>
  );
}

export function TitleBlock({ model, size = 'normal' }: { model: ViewModel; size?: 'normal' | 'large' | 'display' }) {
  const { shows, r } = useDesign();
  const { file, label } = model;
  if (!shows('title')) return null;
  if (size === 'display') {
    return (
      <Typography
        component="h1"
        className="ms-title"
        sx={{
          fontSize: { xs: '2.25rem', sm: '3.25rem', md: '4.25rem' },
          lineHeight: 1.02,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          overflowWrap: 'anywhere',
          maxWidth: '18ch',
        }}
      >
        {label}
      </Typography>
    );
  }
  if (size === 'large') {
    return (
      <Box className="ms-title">
        <Typography
          component="h1"
          sx={{ fontSize: { xs: '1.6rem', md: '2.1rem' }, fontWeight: 800, lineHeight: 1.12, overflowWrap: 'anywhere' }}
        >
          {label}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
          {typeDescription(file.filename, file.type, file.isGif)}
        </Typography>
      </Box>
    );
  }
  return (
    <Box className="ms-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: `${r(radius.tile)}px`,
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
        <Typography variant="subtitle1" component="h1" noWrap sx={{ fontWeight: 700 }} title={label}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {typeDescription(file.filename, file.type, file.isGif)}
        </Typography>
      </Box>
    </Box>
  );
}

export function NoteBlock({ align = 'left' }: { align?: 'left' | 'center' }) {
  const { design, r } = useDesign();
  if (!design.note && !design.button.url) return null;
  return (
    <Box
      className="ms-note"
      sx={{
        textAlign: align,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: 1.5,
      }}
    >
      {design.note && (
        <Typography variant="body1" sx={{ whiteSpace: 'pre-line', color: 'text.secondary', maxWidth: '62ch' }}>
          {design.note}
        </Typography>
      )}
      {design.button.url && (
        <Button
          className="ms-cta"
          variant="tonal"
          href={design.button.url}
          target="_blank"
          rel="noopener"
          endIcon={<ArrowOutwardRounded />}
          sx={{ borderRadius: `${r(radius.full)}px` }}
        >
          {design.button.label}
        </Button>
      )}
    </Box>
  );
}

export function Notices({ model, sx }: { model: ViewModel; sx?: object }) {
  const { boot, file } = model;
  if (!boot.hlsConverting && !(file.once && !file.owner) && !file.blocked) return null;
  return (
    <Box sx={{ display: 'grid', gap: 1.5, ...sx }}>
      {file.blocked && (
        <Alert severity="error">
          {t('Diese Datei ist von der Moderation gesperrt. Nur du und die Admins sehen sie noch.')}
          {file.blocked.reason ? ` ${t('Grund: {reason}', { reason: file.blocked.reason })}` : ''}
        </Alert>
      )}
      {boot.hlsConverting && (
        <Alert severity="info">{t('Das Video wird gerade fürs Streaming aufbereitet. Bis dahin läuft die Originaldatei.')}</Alert>
      )}
      {file.once && !file.owner && (
        <Alert severity="warning">
          {t('Diese Datei ist nur einmal abrufbar. Lade sie jetzt herunter, wenn du sie behalten möchtest.')}
        </Alert>
      )}
    </Box>
  );
}

export function PageHeader({ model, tone = 'normal' }: { model: ViewModel; tone?: 'normal' | 'glass' }) {
  const { shows, design } = useDesign();
  const { site } = model;
  if (!shows('header')) return null;
  const glass = tone === 'glass';
  return (
    <Box
      component="header"
      className="ms-header"
      sx={{
        position: 'relative',
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: { xs: 2, md: 3 },
        height: 64,
        color: glass ? '#fff' : 'inherit',
      }}
    >
      <Box
        component="a"
        href={site.custom ? '/' : site.baseUrl}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none', minWidth: 0, flex: 1 }}
      >
        <BrandMark src={site.favicon} title={site.title} size={34} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }} noWrap>
          {site.title}
        </Typography>
      </Box>
      {design.scheme === 'visitor' && <ThemeToggleButton />}
    </Box>
  );
}

export function PageFooter({ model, sx }: { model: ViewModel; sx?: object }) {
  const { shows } = useDesign();
  const { site, boot } = model;
  const report = site.report && boot.report ? <ReportButton target={boot.report} /> : null;
  if (!shows('footer')) {
    return report ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', pb: 2, position: 'relative', zIndex: 1, ...sx }}>{report}</Box>
    ) : null;
  }
  return (
    <Box
      className="ms-footer"
      sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3, display: 'grid', justifyItems: 'center', gap: 1, ...sx }}
    >
      {report}
      <SiteFooter site={site} />
    </Box>
  );
}

export function Backdrop({ model }: { model: ViewModel }) {
  const { design } = useDesign();
  const { file, urls, accent } = model;
  const src = file.type === 'image' ? urls.display : file.type === 'video' ? urls.poster : null;
  return <DesignBackdrop background={design.background} src={src} accent={accent} />;
}

export function useSchemeSync() {
  const { setMode } = useColorScheme();
  return (scheme: 'visitor' | 'dark' | 'light') => setMode(scheme === 'visitor' ? 'system' : scheme);
}
