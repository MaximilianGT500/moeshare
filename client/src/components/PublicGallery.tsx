import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Modal from '@mui/material/Modal';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowBackIosNewRounded from '@mui/icons-material/ArrowBackIosNewRounded';
import ArrowForwardIosRounded from '@mui/icons-material/ArrowForwardIosRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import LooksOneRounded from '@mui/icons-material/LooksOneRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Button from '@mui/material/Button';
import type { AlbumItem } from '../lib/types';
import { justify, tileAspect } from '../lib/justified';
import { useElementWidth } from '../lib/hooks';
import { formatBytes } from '../lib/format';
import { mix } from '../lib/color';
import { useDesign } from '../lib/design';
import { t } from '../lib/i18n';
import { fileIcon } from './FileIcons';
import { VideoPlayer } from './VideoPlayer';
import { c, ease, elevation, fileTypeColor, radius } from '../theme/tokens';

export const viewable = (item: AlbumItem) => !item.locked && !!item.direct && (item.type === 'image' || item.type === 'video');

const warned = (item: AlbumItem) => typeof item.warning === 'string';
const blurOf = (item: AlbumItem) => `${item.view.replace(/\/+$/, '')}/blur.jpg`;

function WarningPill({ item, hint = false }: { item: AlbumItem; hint?: boolean }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.25,
        maxWidth: 'calc(100% - 16px)',
        px: 1.25,
        py: 0.75,
        borderRadius: `${radius.md}px`,
        bgcolor: 'rgb(12 10 16 / 0.55)',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', fontSize: '0.8125rem', fontWeight: 700 }}>
        <WarningAmberRounded sx={{ fontSize: 18, flexShrink: 0 }} />
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.warning || t('Inhaltswarnung')}
        </Box>
      </Box>
      {hint && (
        <Box component="span" sx={{ fontSize: '0.6875rem', opacity: 0.8 }}>
          {t('Zum Anzeigen tippen')}
        </Box>
      )}
    </Box>
  );
}

const typeColor = (item: AlbumItem) =>
  item.type === 'audio'
    ? fileTypeColor.audio
    : item.type === 'text'
      ? fileTypeColor.text
      : item.type === 'file'
        ? fileTypeColor.other
        : c.primary;

function metrics(width: number) {
  if (width < 600) return { target: 140, gap: 6 };
  if (width < 1000) return { target: 196, gap: 8 };
  return { target: 236, gap: 10 };
}

export function PublicGallery({ items }: { items: AlbumItem[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { target, gap } = metrics(width);
  const media = useMemo(() => items.filter(viewable), [items]);
  const [open, setOpen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const rows = useMemo(() => justify(items, tileAspect, width, { targetHeight: target, gap }), [items, width, target, gap]);

  const openItem = (item: AlbumItem) => {
    const index = media.findIndex((entry) => entry.id === item.id);
    if (index >= 0) setOpen(index);
  };
  const reveal = (item: AlbumItem) => setRevealed((current) => new Set(current).add(item.id));
  const veiled = (item: AlbumItem) => warned(item) && !revealed.has(item.id);

  return (
    <>
      <Box ref={ref} className="ms-gallery" sx={{ display: 'grid', gap: `${gap}px` }}>
        {rows.map((row, rowIndex) => (
          <Box key={rowIndex} sx={{ display: 'flex', gap: `${gap}px`, height: Math.round(row.height) }}>
            {row.cells.map((cell, cellIndex) => (
              <AlbumTile
                key={cell.item.id}
                item={cell.item}
                width={row.complete && cellIndex === row.cells.length - 1 ? undefined : Math.round(cell.width)}
                index={rowIndex * 10 + cellIndex}
                veiled={veiled(cell.item)}
                onReveal={() => reveal(cell.item)}
                onOpen={() => openItem(cell.item)}
              />
            ))}
          </Box>
        ))}
      </Box>
      <AnimatePresence>
        {open !== null && media[open] && (
          <Lightbox
            items={media}
            index={open}
            onIndex={setOpen}
            onClose={() => setOpen(null)}
            veiled={veiled(media[open])}
            onReveal={() => reveal(media[open])}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AlbumTile({
  item,
  width,
  index,
  veiled,
  onReveal,
  onOpen,
}: {
  item: AlbumItem;
  width?: number;
  index: number;
  veiled: boolean;
  onReveal: () => void;
  onOpen: () => void;
}) {
  const { r } = useDesign();
  const [loaded, setLoaded] = useState(false);
  const canOpen = viewable(item);
  const name = item.locked ? (item.once ? t('Nur einmal abrufbar') : t('Geschützte Datei')) : item.name || t('Datei');
  const showImage = !item.locked && !!item.preview;
  const visualVeil = veiled && showImage && (item.type === 'image' || item.type === 'video');

  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (veiled) {
      event.preventDefault();
      onReveal();
      return;
    }
    if (!canOpen) return;
    event.preventDefault();
    onOpen();
  };

  return (
    <m.a
      href={item.view}
      onClick={click}
      aria-label={veiled ? t('{name}, Inhaltswarnung: zum Anzeigen tippen', { name: item.warning || name }) : name}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 24) * 0.025, ease: ease.emphasizedDecelerate }}
      style={{
        flex: width === undefined ? '1 1 0' : `0 0 ${width}px`,
        minWidth: 0,
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          height: '100%',
          borderRadius: `${r(radius.md)}px`,
          overflow: 'hidden',
          bgcolor: item.color && !item.locked ? mix(item.color, 45) : c.surfaceContainerHigh,
          transition: 'transform 220ms cubic-bezier(0.2, 0, 0, 1), box-shadow 220ms',
          'a:hover > &': { transform: 'translateY(-2px)', boxShadow: elevation[3] },
          'a:focus-visible > &': { outline: `3px solid ${c.primary}`, outlineOffset: 2 },
        }}
      >
        {showImage && (
          <img
            key={visualVeil ? 'veiled' : 'clear'}
            src={visualVeil ? blurOf(item) : item.preview!}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 300ms',
              transform: visualVeil ? 'scale(1.08)' : undefined,
            }}
          />
        )}
        {veiled && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 1 }}>
            <WarningPill item={item} hint />
          </Box>
        )}
        {!showImage && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              p: 1.5,
              background: item.locked
                ? `linear-gradient(160deg, ${mix(c.primary, 24)}, ${c.surfaceContainerHigh} 70%)`
                : `linear-gradient(160deg, ${mix(typeColor(item), 26)}, ${c.surfaceContainerHigh} 70%)`,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: `${radius.tile}px`,
                display: 'grid',
                placeItems: 'center',
                bgcolor: c.surfaceContainerHighest,
                color: item.locked ? c.primary : typeColor(item),
                '& svg': { fontSize: 22 },
              }}
            >
              {item.locked ? item.once ? <LooksOneRounded /> : <LockRounded /> : fileIcon(item.filename || '', item.type)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: c.onSurface }}>
                {name}
              </Typography>
              {!item.locked && (
                <Typography variant="caption" noWrap component="p" sx={{ color: c.onSurfaceVariant }}>
                  {formatBytes(item.sizeBytes)}
                </Typography>
              )}
            </Box>
          </Box>
        )}
        {item.type === 'video' && showImage && !veiled && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgb(0 0 0 / 0.45)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
            }}
          >
            <PlayArrowRounded />
          </Box>
        )}
      </Box>
    </m.a>
  );
}

function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  veiled,
  onReveal,
}: {
  items: AlbumItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  veiled: boolean;
  onReveal: () => void;
}) {
  const item = items[index];
  const [direction, setDirection] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const many = items.length > 1;

  const go = (step: number) => {
    if (!many) return;
    setDirection(step);
    onIndex((index + step + items.length) % items.length);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    for (const offset of [1, -1]) {
      const neighbour = items[(index + offset + items.length) % items.length];
      if (neighbour && neighbour.type === 'image' && neighbour.direct && !warned(neighbour)) {
        const image = new Image();
        image.src = neighbour.direct;
      }
    }
  }, [index, items]);

  const pointerDown = (event: PointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event: PointerEvent) => {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const arrow = (step: number) => (
    <IconButton
      aria-label={step < 0 ? t('Vorherige Datei') : t('Nächste Datei')}
      onClick={() => go(step)}
      sx={{
        position: 'absolute',
        top: '50%',
        [step < 0 ? 'left' : 'right']: { xs: 8, md: 20 },
        transform: 'translateY(-50%)',
        zIndex: 2,
        width: 52,
        height: 52,
        color: '#fff',
        bgcolor: 'rgb(255 255 255 / 0.1)',
        backdropFilter: 'blur(12px)',
        display: { xs: 'none', sm: 'inline-flex' },
        '&:hover': { bgcolor: 'rgb(255 255 255 / 0.2)' },
      }}
    >
      {step < 0 ? <ArrowBackIosNewRounded /> : <ArrowForwardIosRounded />}
    </IconButton>
  );

  return (
    <Modal open onClose={onClose} hideBackdrop sx={{ zIndex: 1400 }} aria-label={item.name || t('Datei')}>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        style={{ position: 'fixed', inset: 0, background: 'rgb(8 8 10 / 0.94)', display: 'flex', flexDirection: 'column', outline: 'none' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, md: 2.5 }, height: 64, color: '#fff', flexShrink: 0 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body1" noWrap sx={{ fontWeight: 700 }}>
              {item.name}
            </Typography>
            {many && (
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {t('{current} von {total}', { current: index + 1, total: items.length })}
              </Typography>
            )}
          </Box>
          {item.download && (
            <Tooltip title={t('Herunterladen')}>
              <IconButton href={item.download} sx={{ color: '#fff' }} aria-label={t('Herunterladen')}>
                <DownloadRounded />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t('Einzeln öffnen')}>
            <IconButton href={item.view} target="_blank" rel="noopener" sx={{ color: '#fff' }} aria-label={t('Einzeln öffnen')}>
              <OpenInNewRounded />
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose} sx={{ color: '#fff' }} aria-label={t('Schließen')}>
            <CloseRounded />
          </IconButton>
        </Box>

        <Box
          onPointerDown={pointerDown}
          onPointerUp={pointerUp}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          sx={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            display: 'grid',
            placeItems: 'center',
            px: { xs: 1, sm: 10 },
            pb: 3,
            touchAction: 'pan-y',
          }}
        >
          {many && arrow(-1)}
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <m.div
              key={item.id}
              custom={direction}
              initial={{ opacity: 0, x: direction * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -60 }}
              transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}
              style={{ maxWidth: '100%', maxHeight: '100%', display: 'grid', placeItems: 'center' }}
            >
              {veiled ? (
                <Box sx={{ position: 'relative', borderRadius: `${radius.md}px`, overflow: 'hidden', lineHeight: 0 }}>
                  <img
                    src={blurOf(item)}
                    alt=""
                    draggable={false}
                    style={{
                      display: 'block',
                      width: `min(88vw, ${item.width ? Math.max(320, Math.min(item.width, 900)) : 720}px)`,
                      aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : '4 / 3',
                      maxHeight: 'calc(100dvh - 120px)',
                      objectFit: 'cover',
                    }}
                  />
                  <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', lineHeight: 1.4 }}>
                    <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
                      <WarningPill item={item} />
                      <Button variant="contained" onClick={onReveal}>
                        {t('Inhalt anzeigen')}
                      </Button>
                    </Box>
                  </Box>
                </Box>
              ) : item.type === 'image' ? (
                <img
                  src={item.direct!}
                  alt={item.name || ''}
                  draggable={false}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: 'calc(100dvh - 100px)',
                    objectFit: 'contain',
                    borderRadius: radius.sm,
                    userSelect: 'none',
                  }}
                />
              ) : (
                <Box sx={{ borderRadius: `${radius.md}px`, overflow: 'hidden', bgcolor: '#000', lineHeight: 0 }}>
                  <VideoPlayer
                    src={item.direct!}
                    hls={null}
                    poster={item.preview}
                    style={{
                      display: 'block',
                      width: `min(92vw, ${item.width ? Math.max(320, item.width) : 1280}px, calc((100dvh - 110px) * ${item.width && item.height ? item.width / item.height : 16 / 9}))`,
                      aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : '16 / 9',
                    }}
                  />
                </Box>
              )}
            </m.div>
          </AnimatePresence>
          {many && arrow(1)}
        </Box>
      </m.div>
    </Modal>
  );
}
