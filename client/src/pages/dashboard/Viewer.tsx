import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, m, type PanInfo, type TargetAndTransition } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import Modal from '@mui/material/Modal';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import InfoRounded from '@mui/icons-material/InfoRounded';
import ShareRounded from '@mui/icons-material/ShareRounded';
import CropRotateRounded from '@mui/icons-material/CropRotateRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ListItemIcon from '@mui/material/ListItemIcon';
import MenuItem from '@mui/material/MenuItem';
import type { FileItem } from '../../lib/types';
import { extensionOf, formatBytes, formatDateTime, formatNumber, parseServerDate, relativeFromServer } from '../../lib/format';
import { shareFormats } from '../../lib/share';
import { meaningfulColor, mix } from '../../lib/color';
import { CopyIconButton, CopyTextButton } from '../../components/CopyButton';
import { SHARE_ICONS, ShareMenuItems } from '../../components/ShareList';
import { fileIcon, typeDescription } from '../../components/FileIcons';
import { VideoPlayer } from '../../components/VideoPlayer';
import { StatsPanel } from '../../components/StatsView';
import { fetchFileStats } from '../../lib/api';
import { stopAudio } from './audioPlayer';
import { c, ease, elevation, fonts, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

export interface ViewerState {
  index: number;
  origin: DOMRect | null;
  openedWith: string;
}

interface ViewerProps {
  files: FileItem[];
  state: ViewerState | null;
  frameFor: (filename: string) => HTMLElement | null;
  onIndexChange: (index: number) => void;
  onClosed: () => void;
  onDelete: (file: FileItem) => void;
  onHide: (filename: string | null) => void;
  hasMore: boolean;
  onNeedMore: () => void;
  statsEnabled?: boolean;
  canEdit?: (file: FileItem) => boolean;
  onImageEdit?: (file: FileItem) => void;
  onVersions?: (file: FileItem) => void;
  onClip?: (file: FileItem) => void;
  onWarning?: (file: FileItem) => void;
  trash?: boolean;
  paused?: boolean;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const TOPBAR = 64;
const PANEL = 360;
const TILE_RADIUS = 12;
const MEDIA_RADIUS = 10;

const glassButton = { color: '#fff', '&:hover': { bgcolor: 'rgb(255 255 255 / 0.1)' } };

function fit(width: number, height: number, box: Rect, maxScale: number): Rect {
  const scale = Math.min(box.width / width, box.height / height, maxScale);
  const w = width * scale;
  const h = height * scale;
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
}

function flipFrom(origin: DOMRect, target: Rect) {
  const s = Math.max(origin.width / target.width, origin.height / target.height);
  const insetX = Math.max(0, (target.width - origin.width / s) / 2);
  const insetY = Math.max(0, (target.height - origin.height / s) / 2);
  return {
    x: origin.left + origin.width / 2 - (target.left + target.width / 2),
    y: origin.top + origin.height / 2 - (target.top + target.height / 2),
    scale: s,
    opacity: 1,
    clipPath: `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round ${TILE_RADIUS / s}px)`,
  };
}

const settled = { x: 0, y: 0, scale: 1, opacity: 1, clipPath: `inset(0px 0px 0px 0px round ${MEDIA_RADIUS}px)` };

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 1.5, py: 1 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ color: 'text.primary', minWidth: 0, wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Box>
  );
}

function FileStats({ id }: { id: number }) {
  const load = useCallback((days: number) => fetchFileStats(id, days), [id]);
  return <StatsPanel load={load} compact />;
}

function InfoPanel({ file, stats }: { file: FileItem; stats: boolean }) {
  const date = parseServerDate(file.date);
  return (
    <Box sx={{ p: 3, overflowY: 'auto', height: '100%' }}>
      <Typography variant="h6" component="h2">
        {t('Details')}
      </Typography>
      <Box sx={{ mt: 1 }}>
        <DetailRow label={t('Typ')}>{typeDescription(file.filename, file.type, file.isGif)}</DetailRow>
        <DetailRow label={t('Größe')}>{formatBytes(file.sizeBytes)}</DetailRow>
        {file.width > 0 && file.height > 0 && (
          <DetailRow label={t('Auflösung')}>
            {formatNumber(file.width)} × {formatNumber(file.height)} px
          </DetailRow>
        )}
        <DetailRow label={t('Hochgeladen')}>
          {formatDateTime(date)}
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
            {relativeFromServer(file.date)}
          </Typography>
        </DetailRow>
        <DetailRow label={t('Aufrufe')}>{formatNumber(file.views)}</DetailRow>
        {(file.version > 1 || (file.versions ?? 0) > 0) && (
          <DetailRow label={t('Version')}>
            {t('Version {version}', { version: file.version })}
            {file.versions ? (
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
                {tn(file.versions, '1 ältere Fassung aufbewahrt', '{count} ältere Fassungen aufbewahrt')}
              </Typography>
            ) : null}
          </DetailRow>
        )}
        {!!file.twins && (
          <DetailRow label={t('Duplikate')}>
            {tn(file.twins, 'Diese Datei hast du noch einmal hochgeladen', 'Diese Datei hast du noch {count}-mal hochgeladen')}
          </DetailRow>
        )}
        {file.scan === 'clean' && <DetailRow label={t('Virenscan')}>{t('Geprüft, nichts gefunden')}</DetailRow>}
        <DetailRow label={t('Dateiname')}>
          <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.8rem' }}>
            {file.filename}
          </Box>
        </DetailRow>
      </Box>

      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
        {t('Teilen')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {shareFormats(file).map((format) => (
          <Box
            key={format.key}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              pl: 1.5,
              pr: 0.5,
              py: 0.75,
              borderRadius: `${radius.tile}px`,
              bgcolor: c.surfaceContainerHigh,
            }}
          >
            <Box sx={{ color: c.onSurfaceVariant, display: 'flex', '& svg': { fontSize: 20 } }}>{SHARE_ICONS[format.key]}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
                {format.label}
              </Typography>
              <Typography variant="body2" noWrap sx={{ fontFamily: fonts.mono, fontSize: '0.75rem' }} title={format.value}>
                {format.value}
              </Typography>
            </Box>
            <CopyIconButton
              value={format.value}
              label={t('{label} kopieren', { label: format.label })}
              message={format.copied}
              size="small"
            />
          </Box>
        ))}
      </Box>

      {stats && (
        <>
          <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1.5 }}>
            {t('Statistik')}
          </Typography>
          <FileStats key={file.id} id={file.id} />
        </>
      )}
    </Box>
  );
}

function MediaCard({ file }: { file: FileItem }) {
  const isAudio = file.type === 'audio';
  return (
    <Box
      sx={{
        width: 'min(440px, calc(100vw - 32px))',
        borderRadius: `${radius.xl}px`,
        p: { xs: 3, sm: 4 },
        bgcolor: c.surfaceContainerHigh,
        color: c.onSurface,
        textAlign: 'center',
        boxShadow: elevation[4],
      }}
    >
      <Box
        sx={{
          width: 112,
          height: 112,
          mx: 'auto',
          borderRadius: '32px',
          display: 'grid',
          placeItems: 'center',
          bgcolor: isAudio ? c.tertiaryContainer : c.secondaryContainer,
          color: isAudio ? c.onTertiaryContainer : c.onSecondaryContainer,
          '& svg': { fontSize: 52 },
        }}
      >
        {fileIcon(file.filename, file.type)}
      </Box>
      <Typography variant="h5" component="p" sx={{ mt: 2.5, fontWeight: 800 }}>
        .{extensionOf(file.filename) || 'datei'}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
        {formatBytes(file.sizeBytes)}
      </Typography>
      {isAudio ? (
        <Box component="audio" src={file.urls.direct} controls autoPlay sx={{ width: '100%', mt: 3 }} />
      ) : (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 3, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<DownloadRounded />} href={file.urls.download}>
            {t('Herunterladen')}
          </Button>
          <Button variant="tonal" startIcon={<OpenInNewRounded />} href={file.urls.view} target="_blank" rel="noopener">
            {t('Ansichtsseite')}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export function Viewer({
  files,
  state,
  frameFor,
  onIndexChange,
  onClosed,
  onDelete,
  onHide,
  hasMore,
  onNeedMore,
  statsEnabled = false,
  canEdit,
  onImageEdit,
  onVersions,
  onClip,
  onWarning,
  trash = false,
  paused = false,
}: ViewerProps) {
  const open = state !== null;
  const index = state ? state.index : null;
  const file = open ? (files[index!] ?? null) : null;
  const viewport = useViewport();
  const wide = useMediaQuery('(min-width:1200px)', { noSsr: true });
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [panelOpen, setPanelOpen] = useState(false);
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening');
  const [direction, setDirection] = useState(0);
  const [natural, setNatural] = useState<Record<string, { w: number; h: number }>>({});
  const [fullLoaded, setFullLoaded] = useState<Record<string, boolean>>({});
  const [shareAnchor, setShareAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [closeTarget, setCloseTarget] = useState<TargetAndTransition | null>(null);

  const openKey = state ? `${state.openedWith}:${state.origin?.top ?? 0}:${state.origin?.left ?? 0}` : '';
  useLayoutEffect(() => {
    if (!openKey) return;
    setPhase('opening');
    setCloseTarget(null);
    setDirection(0);
  }, [openKey]);

  useEffect(() => {
    if (!open) setPhase('opening');
  }, [open]);

  useEffect(() => {
    if (open && file && phase !== 'opening') onHide(file.filename);
  }, [open, file, phase, onHide]);

  useEffect(() => {
    if (open && hasMore && index! >= files.length - 3) onNeedMore();
  }, [open, index, files.length, hasMore, onNeedMore]);

  useEffect(() => {
    if (!open) return;
    [files[index! + 1], files[index! - 1]].forEach((neighbour) => {
      if (neighbour && neighbour.type === 'image') {
        const img = new Image();
        img.src = neighbour.isGif ? neighbour.urls.direct : neighbour.urls.preview;
      }
    });
  }, [open, index, files]);

  const panelVisible = panelOpen && !phone;
  const stage: Rect = useMemo(() => {
    const pad = phone ? 8 : 24;
    const right = panelVisible && wide ? PANEL : 0;
    return {
      left: pad,
      top: TOPBAR + pad / 2,
      width: Math.max(80, viewport.w - right - pad * 2),
      height: Math.max(80, viewport.h - TOPBAR - pad * (phone ? 1 : 1.5) - (phone ? 56 : 0)),
    };
  }, [viewport, panelVisible, wide, phone]);

  const targetFor = useCallback(
    (item: FileItem): Rect => {
      const known = natural[item.filename];
      const w = known?.w || item.width || 16;
      const h = known?.h || item.height || 10;
      return fit(w, h, stage, item.type === 'video' ? 8 : 2);
    },
    [natural, stage]
  );

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next < 0 || next >= files.length) return;
      stopAudio();
      setDirection(delta);
      setPhase('open');
      onIndexChange(next);
    },
    [index, files.length, onIndexChange]
  );

  const requestClose = useCallback(() => {
    if (!file || phase === 'closing') return;
    const el = frameFor(file.filename);
    const rect = el?.getBoundingClientRect();
    const visual = file.type === 'image' || file.type === 'video';
    const onScreen = rect && rect.width > 0 && rect.bottom > TOPBAR && rect.top < window.innerHeight;
    setCloseTarget(visual && rect && onScreen ? flipFrom(rect, targetFor(file)) : { opacity: 0, scale: 0.92, x: 0, y: 0 });
    setPhase('closing');
  }, [file, phase, frameFor, targetFor]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || shareAnchor || moreAnchor || paused) return;
      if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === 'i') setPanelOpen((v) => !v);
      else if (event.key === 'Delete' && file) onDelete(file);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go, file, onDelete, shareAnchor, moreAnchor, paused]);

  if (!open || !file) return null;

  const target = targetFor(file);
  const visual = file.type === 'image' || file.type === 'video';
  const color = meaningfulColor(file.color);
  const isOpening = phase === 'opening' && file.filename === state!.openedWith && !!state!.origin && visual;
  const thumb = file.isGif ? file.urls.direct : file.urls.preview;
  const fullSrc = file.urls.direct;
  const showFull = file.type === 'image' && fullLoaded[file.filename];

  const finishClose = () => {
    onHide(null);
    setPhase('opening');
    onClosed();
  };

  const variants = {
    enter: (dir: number) => ({ ...settled, x: dir * 90, opacity: 0, scale: 0.98 }),
    center: settled,
    exit: (dir: number) => ({
      ...settled,
      x: dir * -90,
      opacity: 0,
      scale: 0.98,
      transition: { duration: 0.2, ease: ease.emphasizedAccelerate },
    }),
  };

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -500) go(1);
    else if (info.offset.x > 70 || info.velocity.x > 500) go(-1);
  };

  return (
    <Modal
      open
      onClose={requestClose}
      hideBackdrop
      sx={{ zIndex: 1400 }}
      aria-label={t('Vorschau: {filename}', { filename: file.filename })}
    >
      <Box sx={{ position: 'fixed', inset: 0, outline: 'none', color: '#fff' }} tabIndex={-1}>
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'closing' ? 0 : 1 }}
          transition={{ duration: phase === 'closing' ? 0.3 : 0.35, ease: ease.standard }}
          onClick={requestClose}
          style={{ position: 'absolute', inset: 0, background: '#09070d', overflow: 'hidden' }}
        >
          <AnimatePresence initial={false}>
            {visual && (
              <m.img
                key={file.filename}
                src={thumb}
                alt=""
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.34 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={{
                  position: 'absolute',
                  inset: '-20%',
                  width: '140%',
                  height: '140%',
                  objectFit: 'cover',
                  filter: 'blur(90px) saturate(1.6)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </AnimatePresence>
          {!visual && color && (
            <Box
              sx={{ position: 'absolute', inset: 0, background: `radial-gradient(60% 50% at 50% 40%, ${mix(color, 30)}, transparent)` }}
            />
          )}
        </m.div>

        <m.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: phase === 'closing' ? 0 : 1, y: 0 }}
          transition={{ duration: 0.3, delay: phase === 'opening' ? 0.08 : 0 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: panelVisible && wide ? PANEL : 0,
            height: TOPBAR,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: phone ? '0 4px' : '0 12px',
            zIndex: 3,
            background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.5), transparent)',
          }}
        >
          <Tooltip title={t('Schließen (Esc)')}>
            <IconButton aria-label={t('Schließen')} onClick={requestClose} sx={glassButton}>
              <CloseRounded />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0, ml: 0.5 }}>
            <Typography variant="subtitle2" noWrap sx={{ color: '#fff' }} title={file.filename}>
              {file.filename}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'rgb(255 255 255 / 0.7)', display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}
            >
              <span>
                {t('{current} von {total}', { current: index! + 1, total: files.length })}
                {hasMore ? '+' : ''}
              </span>
              {typeof file.warning === 'string' && (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, color: '#ffd58a' }}>
                  <WarningAmberRounded sx={{ fontSize: 14 }} />
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.warning || t('Inhaltswarnung')}
                  </Box>
                </Box>
              )}
            </Typography>
          </Box>
          {!phone && (
            <CopyTextButton
              value={file.urls.view}
              variant="tonal"
              size="small"
              message={t('Link kopiert')}
              sx={{ mr: 0.5, bgcolor: 'rgb(255 255 255 / 0.14)', color: '#fff', '&:hover': { bgcolor: 'rgb(255 255 255 / 0.22)' } }}
            >
              {t('Link kopieren')}
            </CopyTextButton>
          )}
          {phone && <CopyIconButton value={file.urls.view} sx={glassButton} />}
          <Tooltip title={t('Teilen')}>
            <IconButton
              aria-label={t('Teilen')}
              aria-haspopup="menu"
              onClick={(event) => setShareAnchor(event.currentTarget)}
              sx={glassButton}
            >
              <ShareRounded />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('Herunterladen')}>
            <IconButton aria-label={t('Herunterladen')} href={file.urls.download} sx={glassButton}>
              <DownloadRounded />
            </IconButton>
          </Tooltip>
          {!phone && (
            <Tooltip title={t('Ansichtsseite öffnen')}>
              <IconButton aria-label={t('Ansichtsseite öffnen')} href={file.urls.view} target="_blank" rel="noopener" sx={glassButton}>
                <OpenInNewRounded />
              </IconButton>
            </Tooltip>
          )}
          {onImageEdit && canEdit?.(file) && (
            <Tooltip title={t('Bild bearbeiten')}>
              <IconButton aria-label={t('Bild bearbeiten')} onClick={() => onImageEdit(file)} sx={glassButton}>
                <CropRotateRounded />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={trash ? t('In den Papierkorb (Entf)') : t('Löschen')}>
            <IconButton aria-label={trash ? t('In den Papierkorb') : t('Löschen')} onClick={() => onDelete(file)} sx={glassButton}>
              <DeleteOutlineRounded />
            </IconButton>
          </Tooltip>
          {(onVersions || onWarning || (onClip && file.type === 'video')) && (
            <Tooltip title={t('Mehr')}>
              <IconButton
                aria-label={t('Weitere Aktionen')}
                aria-haspopup="menu"
                onClick={(event) => setMoreAnchor(event.currentTarget)}
                sx={glassButton}
              >
                <MoreVertRounded />
              </IconButton>
            </Tooltip>
          )}
          {!phone && (
            <Tooltip title={panelOpen ? t('Details ausblenden (i)') : t('Details zeigen (i)')}>
              <IconButton aria-label={t('Details')} aria-pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)} sx={glassButton}>
                {panelOpen ? <InfoRounded /> : <InfoOutlined />}
              </IconButton>
            </Tooltip>
          )}
        </m.div>

        <Menu
          anchorEl={shareAnchor}
          open={!!shareAnchor}
          onClose={() => setShareAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ root: { sx: { zIndex: 1500 } } }}
        >
          <ShareMenuItems file={file} onDone={() => setShareAnchor(null)} />
        </Menu>

        <Menu
          anchorEl={moreAnchor}
          open={!!moreAnchor}
          onClose={() => setMoreAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ root: { sx: { zIndex: 1500 } } }}
        >
          {onClip && file.type === 'video' && (
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                onClip(file);
              }}
            >
              <ListItemIcon>
                <ContentCutRounded />
              </ListItemIcon>
              {t('Kürzen oder GIF machen')}
            </MenuItem>
          )}
          {onVersions && (
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                onVersions(file);
              }}
            >
              <ListItemIcon>
                <HistoryRounded />
              </ListItemIcon>
              {file.versions ? t('Versionen ({count})', { count: file.versions + 1 }) : t('Versionen')}
            </MenuItem>
          )}
          {onWarning && (
            <MenuItem
              onClick={() => {
                setMoreAnchor(null);
                onWarning(file);
              }}
            >
              <ListItemIcon>
                <WarningAmberRounded />
              </ListItemIcon>
              {typeof file.warning === 'string' ? t('Inhaltswarnung entfernen') : t('Inhaltswarnung setzen')}
            </MenuItem>
          )}
        </Menu>

        <AnimatePresence custom={direction} mode="popLayout">
          {visual ? (
            <m.div
              key={file.filename}
              custom={direction}
              variants={variants}
              initial={isOpening ? flipFrom(state!.origin!, target) : 'enter'}
              animate={phase === 'closing' && closeTarget ? closeTarget : 'center'}
              exit="exit"
              transition={{
                duration: phase === 'closing' ? 0.34 : isOpening ? 0.46 : 0.32,
                ease: phase === 'closing' ? ease.standard : ease.emphasizedDecelerate,
              }}
              onAnimationComplete={() => {
                if (phase === 'closing') finishClose();
                else if (phase === 'opening') setPhase('open');
              }}
              drag={file.type === 'image' && phase === 'open' ? 'x' : false}
              dragSnapToOrigin
              dragElastic={0.35}
              onDragEnd={onDragEnd}
              style={{
                position: 'absolute',
                left: target.left,
                top: target.top,
                width: target.width,
                height: target.height,
                zIndex: 2,
                transformOrigin: '50% 50%',
                boxShadow: elevation[5],
                background: color ? mix(color, 24) : 'rgb(255 255 255 / 0.04)',
                touchAction: 'pan-y',
                transition:
                  'left 320ms cubic-bezier(0.2,0,0,1), top 320ms cubic-bezier(0.2,0,0,1), width 320ms cubic-bezier(0.2,0,0,1), height 320ms cubic-bezier(0.2,0,0,1)',
              }}
            >
              {file.type === 'image' ? (
                <>
                  <img
                    src={thumb}
                    alt={file.filename}
                    draggable={false}
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      if (!file.width && img.naturalWidth) {
                        setNatural((prev) => ({ ...prev, [file.filename]: { w: img.naturalWidth, h: img.naturalHeight } }));
                      }
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', userSelect: 'none' }}
                  />
                  {!file.isGif && (
                    <img
                      src={fullSrc}
                      alt=""
                      aria-hidden
                      draggable={false}
                      onLoad={() => setFullLoaded((prev) => ({ ...prev, [file.filename]: true }))}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: showFull ? 1 : 0,
                        transition: 'opacity 240ms',
                        userSelect: 'none',
                      }}
                    />
                  )}
                </>
              ) : (
                <VideoPlayer
                  src={file.urls.direct}
                  poster={file.urls.preview}
                  autoPlay={phase !== 'closing'}
                  onLoadedMetadata={(video) => {
                    if (!file.width && video.videoWidth) {
                      setNatural((prev) => ({ ...prev, [file.filename]: { w: video.videoWidth, h: video.videoHeight } }));
                    }
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
                />
              )}
            </m.div>
          ) : (
            <m.div
              key={file.filename}
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={phase === 'closing' ? { opacity: 0, scale: 0.94, y: 16 } : { opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.32, ease: ease.emphasizedDecelerate }}
              onAnimationComplete={() => {
                if (phase === 'closing') finishClose();
                else if (phase === 'opening') setPhase('open');
              }}
              style={{
                position: 'absolute',
                left: stage.left,
                top: stage.top,
                width: stage.width,
                height: stage.height,
                display: 'grid',
                placeItems: 'center',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            >
              <Box sx={{ pointerEvents: 'auto' }}>
                <MediaCard file={file} />
              </Box>
            </m.div>
          )}
        </AnimatePresence>

        {!phone && index! > 0 && phase !== 'closing' && (
          <IconButton
            aria-label={t('Vorherige Datei')}
            onClick={() => go(-1)}
            sx={{
              position: 'absolute',
              left: 16,
              top: '50%',
              zIndex: 3,
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              bgcolor: 'rgb(255 255 255 / 0.12)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
              '&:hover': { bgcolor: 'rgb(255 255 255 / 0.22)' },
            }}
          >
            <ChevronLeftRounded />
          </IconButton>
        )}
        {!phone && index! < files.length - 1 && phase !== 'closing' && (
          <IconButton
            aria-label={t('Nächste Datei')}
            onClick={() => go(1)}
            sx={{
              position: 'absolute',
              right: (panelVisible && wide ? PANEL : 0) + 16,
              top: '50%',
              zIndex: 3,
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              bgcolor: 'rgb(255 255 255 / 0.12)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
              '&:hover': { bgcolor: 'rgb(255 255 255 / 0.22)' },
            }}
          >
            <ChevronRightRounded />
          </IconButton>
        )}
        {phone && phase !== 'closing' && (
          <Box
            sx={{
              position: 'absolute',
              insetInline: 0,
              bottom: 0,
              height: 56,
              zIndex: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1,
              pb: 'env(safe-area-inset-bottom)',
            }}
          >
            <IconButton aria-label={t('Vorherige Datei')} disabled={index === 0} onClick={() => go(-1)} sx={glassButton}>
              <ChevronLeftRounded />
            </IconButton>
            <Typography variant="caption" sx={{ color: 'rgb(255 255 255 / 0.75)' }}>
              {formatBytes(file.sizeBytes)}, {relativeFromServer(file.date)}
            </Typography>
            <IconButton aria-label={t('Nächste Datei')} disabled={index === files.length - 1} onClick={() => go(1)} sx={glassButton}>
              <ChevronRightRounded />
            </IconButton>
          </Box>
        )}

        <AnimatePresence>
          {panelVisible && phase !== 'closing' && (
            <m.aside
              key="panel"
              initial={{ x: PANEL, opacity: wide ? 1 : 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: PANEL, opacity: wide ? 1 : 0, transition: { duration: 0.22, ease: ease.emphasizedAccelerate } }}
              transition={{ duration: 0.38, ease: ease.emphasizedDecelerate }}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: PANEL, zIndex: 4 }}
            >
              <Box
                sx={{
                  height: '100%',
                  bgcolor: c.surfaceContainerLow,
                  color: c.onSurface,
                  borderTopLeftRadius: wide ? 0 : `${radius.xl}px`,
                  borderBottomLeftRadius: wide ? 0 : `${radius.xl}px`,
                  boxShadow: wide ? 'none' : elevation[4],
                }}
              >
                <InfoPanel file={file} stats={statsEnabled} />
              </Box>
            </m.aside>
          )}
        </AnimatePresence>
      </Box>
    </Modal>
  );
}
