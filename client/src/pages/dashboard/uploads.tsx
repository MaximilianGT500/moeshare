import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import GlobalStyles from '@mui/material/GlobalStyles';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { ApiError, uploadFile, type UploadHandle, type UploadResponse } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import { isTypingTarget } from '../../lib/hooks';
import { mix } from '../../lib/color';
import { useToast } from '../../components/Toaster';
import { fileIcon } from '../../components/FileIcons';
import { c, css, ease, elevation, radius } from '../../theme/tokens';

type Status = 'queued' | 'uploading' | 'done' | 'error';

interface UploadItem {
  id: number;
  file: File;
  progress: number;
  status: Status;
  error?: string;
  thumb?: string;
  result?: UploadResponse;
}

interface UploadContextValue {
  pick: () => void;
  enqueue: (files: FileList | File[]) => void;
  active: number;
}

const UploadContext = createContext<UploadContextValue>({ pick: () => {}, enqueue: () => {}, active: 0 });
export const useUploads = () => useContext(UploadContext);

const CONCURRENCY = 2;

function guessType(file: File) {
  if (file.type.startsWith('image/')) return 'image' as const;
  if (file.type.startsWith('video/')) return 'video' as const;
  if (file.type.startsWith('audio/')) return 'audio' as const;
  return 'file' as const;
}

export function UploadProvider({
  children,
  onUploaded,
  maxBytes,
}: {
  children: ReactNode;
  onUploaded: (names: string[]) => void;
  maxBytes: number | null;
}) {
  const toast = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const handles = useRef(new Map<number, UploadHandle>());
  const started = useRef(new Set<number>());
  const nextId = useRef(1);
  const finished = useRef<string[]>([]);
  const flushTimer = useRef(0);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const update = useCallback((id: number, patch: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const enqueue = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      setCollapsed(false);
      setItems((list) => [
        ...list,
        ...files.map((file) => {
          const tooBig = maxBytes !== null && file.size > maxBytes;
          return {
            id: nextId.current++,
            file,
            progress: 0,
            status: tooBig ? ('error' as const) : ('queued' as const),
            error: tooBig ? `Zu groß – erlaubt sind bis zu ${formatBytes(maxBytes!)}.` : undefined,
            thumb: guessType(file) === 'image' && file.size < 25 * 1024 * 1024 ? URL.createObjectURL(file) : undefined,
          };
        }),
      ]);
    },
    [maxBytes]
  );

  useEffect(() => {
    const running = items.filter((item) => item.status === 'uploading').length;
    const waiting = items.filter((item) => item.status === 'queued' && !started.current.has(item.id));
    for (const item of waiting.slice(0, Math.max(0, CONCURRENCY - running))) {
      started.current.add(item.id);
      update(item.id, { status: 'uploading', progress: 0 });
      const handle = uploadFile(item.file, (progress) => update(item.id, { progress }));
      handles.current.set(item.id, handle);
      handle.promise
        .then((result) => {
          update(item.id, { status: 'done', progress: 1, result });
          finished.current.push(result.view.split('/').pop() || '');
          window.clearTimeout(flushTimer.current);
          flushTimer.current = window.setTimeout(() => {
            const names = finished.current.splice(0);
            onUploadedRef.current(names);
          }, 350);
        })
        .catch((error: unknown) => {
          const message = error instanceof ApiError ? error.message : 'Upload fehlgeschlagen.';
          update(item.id, { status: 'error', error: message });
          if (error instanceof ApiError && error.sessionExpired) {
            toast(message, { variant: 'error', action: { label: 'Anmelden', onClick: () => window.location.assign('/login') } });
          }
        })
        .finally(() => handles.current.delete(item.id));
    }
  }, [items, update, toast]);

  const allDone = items.length > 0 && items.every((item) => item.status === 'done');
  useEffect(() => {
    if (!allDone) return undefined;
    const timer = window.setTimeout(() => {
      setItems((list) => {
        list.forEach((item) => item.thumb && URL.revokeObjectURL(item.thumb));
        return [];
      });
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [allDone]);

  const remove = (id: number) => {
    handles.current.get(id)?.abort();
    setItems((list) => {
      const item = list.find((entry) => entry.id === id);
      if (item?.thumb) URL.revokeObjectURL(item.thumb);
      return list.filter((entry) => entry.id !== id);
    });
  };

  const clearAll = () => {
    handles.current.forEach((handle) => handle.abort());
    setItems((list) => {
      list.forEach((item) => item.thumb && URL.revokeObjectURL(item.thumb));
      return [];
    });
  };

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      if (event.dataTransfer?.files.length) enqueue(event.dataTransfer.files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [enqueue]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const files = Array.from(event.clipboardData?.files || []);
      if (!files.length) return;
      event.preventDefault();
      const named = files.map((file) =>
        file.name === 'image.png' || !file.name ? new File([file], `Einfügen-${Date.now()}.png`, { type: file.type || 'image/png' }) : file
      );
      toast(
        named.length === 1
          ? 'Aus der Zwischenablage wird hochgeladen'
          : `${named.length} Dateien aus der Zwischenablage werden hochgeladen`,
        {
          variant: 'info',
          duration: 2400,
        }
      );
      enqueue(named);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enqueue, toast]);

  const active = items.filter((item) => item.status === 'queued' || item.status === 'uploading').length;
  const value = useMemo(() => ({ pick: () => input.current?.click(), enqueue, active }), [enqueue, active]);

  return (
    <UploadContext.Provider value={value}>
      {children}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) enqueue(event.target.files);
          event.target.value = '';
        }}
      />
      <GlobalStyles
        styles={{
          '.moeshare-upload-tray': { bottom: 'calc(16px + env(safe-area-inset-bottom))' },
          '@media (max-width: 899.95px)': { '.moeshare-upload-tray': { bottom: 'calc(92px + env(safe-area-inset-bottom))' } },
        }}
      />
      <DropOverlay open={dragging} maxBytes={maxBytes} />
      <UploadTray
        items={items}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onRemove={remove}
        onRetry={(id) => {
          started.current.delete(id);
          update(id, { status: 'queued', progress: 0, error: undefined });
        }}
        onClose={clearAll}
      />
    </UploadContext.Provider>
  );
}

function DropOverlay({ open, maxBytes }: { open: boolean; maxBytes: number | null }) {
  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 1700, pointerEvents: 'none' }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: mix(c.surface, 78),
              backdropFilter: 'blur(10px) saturate(1.2)',
              display: 'grid',
              placeItems: 'center',
              p: 3,
            }}
          >
            <m.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: ease.emphasizedDecelerate }}
              style={{ position: 'relative', width: 'min(640px, 100%)' }}
            >
              <Box
                sx={{
                  position: 'relative',
                  borderRadius: `${radius.xl}px`,
                  bgcolor: mix(c.primaryContainer, 22),
                  px: { xs: 3, sm: 6 },
                  py: { xs: 6, sm: 8 },
                  textAlign: 'center',
                  color: c.onSurface,
                }}
              >
                <Box
                  component="svg"
                  aria-hidden
                  sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
                >
                  <rect
                    x="1.5"
                    y="1.5"
                    rx={radius.xl}
                    fill="none"
                    stroke="var(--mui-palette-m3-primary)"
                    strokeWidth="3"
                    strokeDasharray="14 10"
                    style={{ width: 'calc(100% - 3px)', height: 'calc(100% - 3px)', animation: 'moeshare-march 1.2s linear infinite' }}
                  />
                </Box>
                <m.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ display: 'inline-flex' }}
                >
                  <Box
                    sx={{
                      width: 88,
                      height: 88,
                      borderRadius: '28px',
                      bgcolor: c.primaryContainer,
                      color: c.onPrimaryContainer,
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: elevation[3],
                    }}
                  >
                    <CloudUploadRounded sx={{ fontSize: 44 }} />
                  </Box>
                </m.div>
                <Typography variant="h4" component="p" sx={{ mt: 3 }}>
                  Zum Hochladen loslassen
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                  Bilder, Videos, Audio und alle anderen Dateien
                  {maxBytes ? ` – bis zu ${formatBytes(maxBytes)} pro Datei` : ''}.
                </Typography>
              </Box>
            </m.div>
          </Box>
          <style>{'@keyframes moeshare-march { to { stroke-dashoffset: -48; } }'}</style>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function UploadTray({
  items,
  collapsed,
  onToggle,
  onRemove,
  onRetry,
  onClose,
}: {
  items: UploadItem[];
  collapsed: boolean;
  onToggle: () => void;
  onRemove: (id: number) => void;
  onRetry: (id: number) => void;
  onClose: () => void;
}) {
  const active = items.filter((item) => item.status === 'queued' || item.status === 'uploading');
  const failed = items.filter((item) => item.status === 'error').length;
  const done = items.filter((item) => item.status === 'done').length;
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0) || 1;
  const progress = items.reduce((sum, item) => sum + item.file.size * (item.status === 'error' ? 1 : item.progress), 0) / totalBytes;

  const title = active.length
    ? `${active.length === 1 ? 'Eine Datei wird' : `${active.length} Dateien werden`} hochgeladen`
    : failed
      ? `${failed} ${failed === 1 ? 'Upload ist' : 'Uploads sind'} fehlgeschlagen`
      : `${done === 1 ? 'Datei' : `${done} Dateien`} hochgeladen`;

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <m.div
          initial={{ opacity: 0, y: 32, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, transition: { duration: 0.2, ease: ease.emphasizedAccelerate } }}
          transition={{ duration: 0.42, ease: ease.emphasizedDecelerate }}
          className="moeshare-upload-tray"
          style={{ position: 'fixed', right: 16, zIndex: 1500, width: 'min(380px, calc(100vw - 32px))' }}
        >
          <Box sx={{ borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerHigh, boxShadow: elevation[3], overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, pr: 1, py: 1.25 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {title}
                </Typography>
                {active.length > 0 && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {Math.round(progress * 100)} % insgesamt
                  </Typography>
                )}
              </Box>
              <Tooltip title={collapsed ? 'Liste zeigen' : 'Liste einklappen'}>
                <IconButton size="small" onClick={onToggle} aria-label={collapsed ? 'Liste zeigen' : 'Liste einklappen'}>
                  <ExpandMoreRounded
                    sx={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: `transform 250ms ${css.standard}` }}
                  />
                </IconButton>
              </Tooltip>
              <Tooltip title={active.length ? 'Alle abbrechen' : 'Schließen'}>
                <IconButton size="small" onClick={onClose} aria-label={active.length ? 'Alle Uploads abbrechen' : 'Schließen'}>
                  <CloseRounded />
                </IconButton>
              </Tooltip>
            </Box>
            {active.length > 0 && <LinearProgress variant="determinate" value={progress * 100} sx={{ mx: 2, mb: 1 }} />}
            <Collapse in={!collapsed}>
              <Box sx={{ maxHeight: 280, overflowY: 'auto', px: 1, pb: 1 }}>
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <m.div
                      key={item.id}
                      layout="position"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <UploadRow item={item} onRemove={() => onRemove(item.id)} onRetry={() => onRetry(item.id)} />
                    </m.div>
                  ))}
                </AnimatePresence>
              </Box>
            </Collapse>
          </Box>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function UploadRow({ item, onRemove, onRetry }: { item: UploadItem; onRemove: () => void; onRetry: () => void }) {
  const type = guessType(item.file);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: `${radius.tile}px` }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: `${radius.sm}px`,
          overflow: 'hidden',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.surfaceContainerHighest,
          color: c.onSurfaceVariant,
        }}
      >
        {item.thumb ? (
          <Box component="img" src={item.thumb} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          fileIcon(item.file.name, type, 'small')
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }} title={item.file.name}>
          {item.file.name}
        </Typography>
        {item.status === 'error' ? (
          <Typography variant="caption" sx={{ color: c.error, display: 'block' }} noWrap title={item.error}>
            {item.error}
          </Typography>
        ) : item.status === 'done' ? (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {formatBytes(item.file.size)} hochgeladen
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
            <LinearProgress
              variant={item.status === 'queued' ? 'indeterminate' : 'determinate'}
              value={item.progress * 100}
              sx={{ flex: 1, height: 4 }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 34, textAlign: 'right' }}>
              {item.status === 'queued' ? 'wartet' : `${Math.round(item.progress * 100)} %`}
            </Typography>
          </Box>
        )}
      </Box>
      {item.status === 'done' && <CheckCircleRounded sx={{ color: c.primary }} />}
      {item.status === 'error' && (
        <>
          <ErrorRounded sx={{ color: c.error }} />
          {!item.error?.startsWith('Zu groß') && (
            <Tooltip title="Erneut versuchen">
              <IconButton size="small" onClick={onRetry} aria-label="Erneut versuchen">
                <ReplayRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}
      {item.status !== 'done' && (
        <Tooltip title={item.status === 'error' ? 'Entfernen' : 'Abbrechen'}>
          <IconButton size="small" onClick={onRemove} aria-label={item.status === 'error' ? 'Entfernen' : 'Upload abbrechen'}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
