import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Skeleton from '@mui/material/Skeleton';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { avatarFromFile, errorMessage, fileContentUrl, listFiles, removeAvatar, uploadAvatar, type AvatarCrop } from '../lib/api';
import type { FileItem } from '../lib/types';
import { formatBytes } from '../lib/format';
import { t } from '../lib/i18n';
import { useToast } from './Toaster';
import { GrowTransition } from './transitions';
import { UserAvatar } from './UserAvatar';
import { c, radius } from '../theme/tokens';

const VIEW = 264;
const MAX_ZOOM = 4;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

interface Source {
  url: string;
  blob?: Blob;
  fileId?: number;
  name: string;
}

interface Natural {
  w: number;
  h: number;
}

export interface AvatarLimits {
  maxBytes: number;
  animated: boolean;
}

export function AvatarButton({
  name,
  src,
  size,
  onClick,
  label,
}: {
  name: string;
  src: string | null | undefined;
  size: number;
  onClick?: () => void;
  label: string;
}) {
  if (!onClick) return <UserAvatar name={name} src={src} size={size} />;
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={label}
      sx={{
        position: 'relative',
        borderRadius: '50%',
        flexShrink: 0,
        '&:focus-visible': { outline: `3px solid ${c.primary}`, outlineOffset: 3 },
        '&:hover .avatar-badge, &:focus-visible .avatar-badge': { transform: 'scale(1.08)' },
      }}
    >
      <UserAvatar name={name} src={src} size={size} />
      <Box
        className="avatar-badge"
        aria-hidden
        sx={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: Math.max(22, Math.round(size * 0.36)),
          height: Math.max(22, Math.round(size * 0.36)),
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.primary,
          color: c.onPrimary,
          boxShadow: `0 0 0 3px ${c.surfaceContainerLow}`,
          transition: 'transform 160ms ease',
          '& svg': { fontSize: Math.max(13, Math.round(size * 0.2)) },
        }}
      >
        <PhotoCameraRounded />
      </Box>
    </ButtonBase>
  );
}

function clampOffset(offset: { x: number; y: number }, natural: Natural, scale: number) {
  const width = natural.w * scale;
  const height = natural.h * scale;
  return {
    x: Math.min(0, Math.max(VIEW - width, offset.x)),
    y: Math.min(0, Math.max(VIEW - height, offset.y)),
  };
}

function Cropper({
  source,
  onReady,
  onFailed,
  onChange,
}: {
  source: Source;
  onReady: () => void;
  onFailed: () => void;
  onChange: (crop: AvatarCrop) => void;
}) {
  const [natural, setNatural] = useState<Natural | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const base = natural ? VIEW / Math.min(natural.w, natural.h) : 1;
  const scale = base * zoom;

  useEffect(() => {
    if (!natural) return;
    onChange({ x: -offset.x / scale, y: -offset.y / scale, size: VIEW / scale });
  }, [natural, offset, scale, onChange]);

  const zoomTo = useCallback(
    (next: number, focus = { x: VIEW / 2, y: VIEW / 2 }) => {
      if (!natural) return;
      const target = Math.min(MAX_ZOOM, Math.max(1, next));
      setOffset((current) => {
        const before = base * zoom;
        const after = base * target;
        const point = { x: (focus.x - current.x) / before, y: (focus.y - current.y) / before };
        return clampOffset({ x: focus.x - point.x * after, y: focus.y - point.y * after }, natural, after);
      });
      setZoom(target);
    },
    [natural, base, zoom]
  );

  const moveBy = (dx: number, dy: number) => {
    if (!natural) return;
    setOffset((current) => clampOffset({ x: current.x + dx, y: current.y + dy }, natural, scale));
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0) zoomTo((pinch.current.zoom * distance) / pinch.current.distance);
      return;
    }
    moveBy(event.clientX - previous.x, event.clientY - previous.y);
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const viewport = useRef<HTMLDivElement>(null);
  const wheelZoom = useRef<(event: WheelEvent) => void>(() => {});
  wheelZoom.current = (event: WheelEvent) => {
    if (!natural || !viewport.current) return;
    event.preventDefault();
    const box = viewport.current.getBoundingClientRect();
    zoomTo(zoom * Math.exp(-event.deltaY * 0.0015), { x: event.clientX - box.left, y: event.clientY - box.top });
  };

  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const listener = (event: WheelEvent) => wheelZoom.current(event);
    element.addEventListener('wheel', listener, { passive: false });
    return () => element.removeEventListener('wheel', listener);
  }, []);

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => moveBy(step, 0),
      ArrowRight: () => moveBy(-step, 0),
      ArrowUp: () => moveBy(0, step),
      ArrowDown: () => moveBy(0, -step),
      '+': () => zoomTo(zoom * 1.15),
      '=': () => zoomTo(zoom * 1.15),
      '-': () => zoomTo(zoom / 1.15),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
      <Box
        ref={viewport}
        role="application"
        tabIndex={0}
        aria-label={t('Bildausschnitt. Mit den Pfeiltasten verschieben, mit Plus und Minus zoomen.')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={keys}
        sx={{
          position: 'relative',
          width: VIEW,
          height: VIEW,
          overflow: 'hidden',
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerHighest,
          touchAction: 'none',
          cursor: natural ? 'grab' : 'default',
          userSelect: 'none',
          '&:active': { cursor: natural ? 'grabbing' : 'default' },
          '&:focus-visible': { outline: `3px solid ${c.primary}`, outlineOffset: 3 },
        }}
      >
        {!natural && <Skeleton variant="rectangular" width={VIEW} height={VIEW} sx={{ position: 'absolute', inset: 0 }} />}
        <Box
          component="img"
          src={source.url}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            const size = { w: image.naturalWidth, h: image.naturalHeight };
            if (!size.w || !size.h) return onFailed();
            const fit = VIEW / Math.min(size.w, size.h);
            setNatural(size);
            setZoom(1);
            setOffset({ x: (VIEW - size.w * fit) / 2, y: (VIEW - size.h * fit) / 2 });
            onReady();
          }}
          onError={onFailed}
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: natural ? natural.w * scale : VIEW,
            height: natural ? natural.h * scale : VIEW,
            maxWidth: 'none',
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            opacity: natural ? 1 : 0,
            pointerEvents: 'none',
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)',
            outline: '2px solid rgb(255 255 255 / 0.85)',
            outlineOffset: -2,
            pointerEvents: 'none',
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: VIEW }}>
        <ZoomOutRounded fontSize="small" sx={{ color: 'text.secondary' }} />
        <Slider
          size="small"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!natural}
          onChange={(_, value) => zoomTo(value as number)}
          aria-label={t('Zoom')}
          getAriaValueText={(value) => t('{percent} Prozent', { percent: Math.round(value * 100) })}
        />
        <ZoomInRounded fontSize="small" sx={{ color: 'text.secondary' }} />
      </Box>
    </Box>
  );
}

function UploadPicker({ onPick }: { onPick: (file: FileItem) => void }) {
  const [items, setItems] = useState<FileItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listFiles({ page: 1, limit: 30, search: '', type: 'image', sort: 'newest' })
      .then((result) => active && setItems(result.files.filter((file) => file.type === 'image')))
      .catch((failure) => active && setError(errorMessage(failure)));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <Typography sx={{ color: c.error }}>{error}</Typography>;
  if (items && !items.length) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
        {t('Du hast noch keine Bilder hochgeladen.')}
      </Typography>
    );
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
        gap: 1,
        maxHeight: 320,
        overflowY: 'auto',
        p: 0.5,
      }}
    >
      {(items || Array.from({ length: 9 }, () => null)).map((file, index) =>
        file ? (
          <ButtonBase
            key={file.id}
            onClick={() => onPick(file)}
            aria-label={t('{name} als Profilbild nehmen', { name: file.title || file.originalName || file.filename })}
            sx={{
              aspectRatio: '1',
              borderRadius: `${radius.md}px`,
              overflow: 'hidden',
              bgcolor: file.color || c.surfaceContainerHigh,
              '&:focus-visible': { outline: `3px solid ${c.primary}`, outlineOffset: 2 },
            }}
          >
            <Box
              component="img"
              src={file.urls.preview}
              alt=""
              loading="lazy"
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </ButtonBase>
        ) : (
          <Skeleton key={index} variant="rounded" sx={{ aspectRatio: '1', height: 'auto' }} />
        )
      )}
    </Box>
  );
}

export function AvatarDialog({
  open,
  onClose,
  name,
  current,
  limits,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  current: string | null;
  limits: AvatarLimits;
  onSaved: (avatar: string | null) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [picking, setPicking] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const crop = useRef<AvatarCrop>({ x: 0, y: 0, size: 0 });

  const reset = () => {
    setSource((previous) => {
      if (previous && previous.blob) URL.revokeObjectURL(previous.url);
      return null;
    });
    setPicking(false);
    setReady(false);
    setError('');
  };

  useEffect(() => () => reset(), []);

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('Das ist kein Bild. Nimm ein JPG, PNG, WebP, AVIF oder GIF.'));
      return;
    }
    if (file.size > limits.maxBytes) {
      setError(t('Das Bild ist zu groß. Erlaubt sind bis zu {size}.', { size: formatBytes(limits.maxBytes) }));
      return;
    }
    reset();
    setSource({ url: URL.createObjectURL(file), blob: file, name: file.name });
  };

  const pickUpload = (file: FileItem) => {
    reset();
    setSource({ url: fileContentUrl(file.id), fileId: file.id, name: file.title || file.originalName || file.filename });
  };

  const save = async () => {
    if (!source) return;
    setBusy('save');
    setError('');
    try {
      const result = source.blob ? await uploadAvatar(source.blob, crop.current) : await avatarFromFile(source.fileId || 0, crop.current);
      onSaved(result.avatar);
      toast(t('Profilbild gespeichert'), { variant: 'success' });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError('');
    try {
      await removeAvatar();
      onSaved(null);
      toast(t('Profilbild entfernt'), { variant: 'success' });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const onCrop = useCallback((next: AvatarCrop) => {
    crop.current = next;
  }, []);

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      slotProps={{ transition: { onExited: reset } }}
      aria-labelledby="avatar-dialog-title"
    >
      <DialogTitle id="avatar-dialog-title">{t('Profilbild')}</DialogTitle>
      <DialogContent
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer.files?.[0]);
        }}
      >
        {source ? (
          <Cropper
            key={source.url}
            source={source}
            onReady={() => setReady(true)}
            onFailed={() => {
              setReady(false);
              setError(t('Dieses Bild kann der Browser nicht anzeigen. Nimm ein JPG, PNG, WebP oder GIF.'));
            }}
            onChange={onCrop}
          />
        ) : picking ? (
          <UploadPicker onPick={pickUpload} />
        ) : (
          <Box
            sx={{
              display: 'grid',
              justifyItems: 'center',
              gap: 2,
              py: 2,
              borderRadius: `${radius.lg}px`,
              outline: dragging ? `2px dashed ${c.primary}` : '2px dashed transparent',
              bgcolor: dragging ? c.primaryContainer : 'transparent',
              transition: 'background-color 160ms ease',
            }}
          >
            <UserAvatar name={name} src={current} size={128} />
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 320 }}>
              {limits.animated
                ? t(
                    'Wähle ein Bild oder zieh es hierher. Bewegte GIFs bleiben bewegt. Alle, die deine Dateien oder dein Profil sehen, sehen auch das Bild.'
                  )
                : t('Wähle ein Bild oder zieh es hierher. Alle, die deine Dateien oder dein Profil sehen, sehen auch das Bild.')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="contained" startIcon={<PhotoCameraRounded />} onClick={() => input.current?.click()}>
                {t('Bild auswählen')}
              </Button>
              <Button variant="tonal" startIcon={<CollectionsOutlined />} onClick={() => setPicking(true)}>
                {t('Aus deinen Uploads')}
              </Button>
            </Box>
          </Box>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {error && (
          <Typography variant="body2" role="alert" sx={{ color: c.error, mt: 2, textAlign: 'center' }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {source || picking ? (
          <Button startIcon={<ArrowBackRounded />} onClick={reset} disabled={!!busy} sx={{ mr: 'auto' }}>
            {t('Anderes Bild')}
          </Button>
        ) : (
          current && (
            <Button
              color="error"
              startIcon={busy === 'remove' ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineRounded />}
              onClick={remove}
              disabled={!!busy}
              sx={{ mr: 'auto' }}
            >
              {t('Entfernen')}
            </Button>
          )
        )}
        <Button onClick={onClose} disabled={!!busy}>
          {t('Abbrechen')}
        </Button>
        {source && (
          <Button
            variant="contained"
            onClick={save}
            disabled={!ready || !!busy}
            startIcon={busy === 'save' ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {t('Speichern')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
