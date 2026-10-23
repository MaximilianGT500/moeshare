import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import {
  ApiError,
  cancelUploadSession,
  discardResumable,
  fingerprintOf,
  listUploadSessions,
  uploadFile,
  uploadResumable,
  type UploadOptions,
  type UploadResponse,
} from '../../lib/api';
import type { UploadSession } from '../../lib/types';
import { t, tn } from '../../lib/i18n';
import { formatBytes } from '../../lib/format';
import { isTypingTarget } from '../../lib/hooks';
import { mix } from '../../lib/color';
import { droppedEntries, groupPicked, readDrop, type DropContents } from '../../lib/folders';
import { canUnzip, isZip } from '../../lib/unzip';
import { useToast } from '../../components/Toaster';
import { fileIcon } from '../../components/FileIcons';
import { c, css, ease, elevation, radius } from '../../theme/tokens';

type Status = 'queued' | 'uploading' | 'paused' | 'retrying' | 'done' | 'error';

interface UploadItem {
  id: number;
  file: File;
  options: UploadOptions;
  progress: number;
  status: Status;
  resumable: boolean;
  error?: string;
  thumb?: string;
  result?: UploadResponse;
}

interface Control {
  abort: () => void;
  pause?: () => void;
  resume?: () => void;
}

interface UploadContextValue {
  pick: () => void;
  pickFolder: () => void;
  enqueue: (files: FileList | File[], overrides?: UploadOptions) => void;
  active: number;
  setOptions: (options: UploadOptions) => void;
  pending: UploadSession[];
  discardPending: () => Promise<void>;
}

const UploadContext = createContext<UploadContextValue>({
  pick: () => {},
  pickFolder: () => {},
  enqueue: () => {},
  active: 0,
  setOptions: () => {},
  pending: [],
  discardPending: async () => {},
});
export const useUploads = () => useContext(UploadContext);

const CONCURRENCY = 2;
const RUNNING: Status[] = ['uploading', 'retrying'];

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
  chunked,
  chunkSize,
  albums,
  onFolders,
  onArchive,
}: {
  children: ReactNode;
  onUploaded: (names: string[], results: UploadResponse[]) => void;
  maxBytes: number | null;
  chunked: boolean;
  chunkSize: number;
  albums: boolean;
  onFolders: (contents: DropContents) => void;
  onArchive: (file: File) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pending, setPending] = useState<UploadSession[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const handles = useRef(new Map<number, Control>());
  const started = useRef(new Set<number>());
  const nextId = useRef(1);
  const finished = useRef<UploadResponse[]>([]);
  const flushTimer = useRef(0);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const routeRef = useRef({ albums, onFolders, onArchive });
  routeRef.current = { albums, onFolders, onArchive };
  const optionsRef = useRef<UploadOptions>({});
  const setOptions = useCallback((options: UploadOptions) => {
    optionsRef.current = options;
  }, []);

  useEffect(() => {
    if (!chunked) return;
    listUploadSessions()
      .then((res) => setPending(res.uploads.filter((session) => !session.fileId)))
      .catch(() => {});
  }, [chunked]);

  const update = useCallback((id: number, patch: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const enqueue = useCallback(
    (fileList: FileList | File[], overrides: UploadOptions = {}) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      setCollapsed(false);
      const prints = new Set(files.map(fingerprintOf));
      setPending((list) => list.filter((session) => !session.fingerprint || !prints.has(session.fingerprint)));
      setItems((list) => [
        ...list,
        ...files.map((file) => {
          const tooBig = maxBytes !== null && file.size > maxBytes;
          return {
            id: nextId.current++,
            file,
            options: { ...optionsRef.current, ...overrides },
            progress: 0,
            resumable: chunked && file.size > chunkSize,
            status: tooBig ? ('error' as const) : ('queued' as const),
            error: tooBig ? t('Zu groß – erlaubt sind bis zu {max}.', { max: formatBytes(maxBytes!) }) : undefined,
            thumb: guessType(file) === 'image' && file.size < 25 * 1024 * 1024 ? URL.createObjectURL(file) : undefined,
          };
        }),
      ]);
    },
    [maxBytes, chunked, chunkSize]
  );

  const route = useCallback(
    (contents: DropContents) => {
      if (contents.folders.length && routeRef.current.albums) {
        routeRef.current.onFolders(contents);
        return;
      }
      const all = [...contents.loose, ...contents.folders.flatMap((folder) => folder.files)];
      if (all.length === 1 && isZip(all[0]) && routeRef.current.albums && canUnzip()) {
        routeRef.current.onArchive(all[0]);
        return;
      }
      enqueue(all);
    },
    [enqueue]
  );

  useEffect(() => {
    const running = items.filter((item) => RUNNING.includes(item.status)).length;
    const waiting = items.filter((item) => item.status === 'queued' && !started.current.has(item.id));
    for (const item of waiting.slice(0, Math.max(0, CONCURRENCY - running))) {
      started.current.add(item.id);
      update(item.id, { status: 'uploading', progress: 0 });
      const onProgress = (progress: number) => update(item.id, { progress });
      let promise: Promise<UploadResponse>;
      if (item.resumable) {
        const handle = uploadResumable(item.file, onProgress, item.options, {
          onState: (state) => update(item.id, { status: state === 'running' ? 'uploading' : state }),
        });
        handles.current.set(item.id, handle);
        promise = handle.promise as Promise<UploadResponse>;
      } else {
        const handle = uploadFile(item.file, onProgress, item.options);
        handles.current.set(item.id, handle);
        promise = handle.promise;
      }
      promise
        .then((result) => {
          update(item.id, { status: 'done', progress: 1, result });
          finished.current.push(result);
          window.clearTimeout(flushTimer.current);
          flushTimer.current = window.setTimeout(() => {
            const results = finished.current.splice(0);
            onUploadedRef.current(
              results.map((entry) => entry.filename || entry.view.split('/').pop() || ''),
              results
            );
          }, 350);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.code === 'aborted') return;
          const message = error instanceof ApiError ? error.message : t('Upload fehlgeschlagen.');
          update(item.id, { status: 'error', error: message });
          if (error instanceof ApiError && error.sessionExpired) {
            toast(message, { variant: 'error', action: { label: t('Anmelden'), onClick: () => window.location.assign('/login') } });
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

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const forget = (item: UploadItem) => {
    const handle = handles.current.get(item.id);
    if (handle) handle.abort();
    else if (item.resumable && item.status === 'error') discardResumable(item.file);
    if (item.thumb) URL.revokeObjectURL(item.thumb);
  };

  const remove = (id: number) => {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (item) forget(item);
    setItems((list) => list.filter((entry) => entry.id !== id));
  };

  const clearAll = () => {
    itemsRef.current.forEach(forget);
    setItems([]);
  };

  const pause = (id: number) => {
    handles.current.get(id)?.pause?.();
    update(id, { status: 'paused' });
  };

  const resume = (id: number) => {
    handles.current.get(id)?.resume?.();
    update(id, { status: 'uploading' });
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
      const entries = droppedEntries(event.dataTransfer);
      if (entries.some((entry) => entry.isDirectory)) {
        readDrop(entries)
          .then(route)
          .catch(() => toast(t('Der Ordner ließ sich nicht lesen.'), { variant: 'error' }));
        return;
      }
      if (event.dataTransfer?.files.length) route({ loose: Array.from(event.dataTransfer.files), folders: [] });
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
  }, [route, toast]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const files = Array.from(event.clipboardData?.files || []);
      if (!files.length) return;
      event.preventDefault();
      const named = files.map((file) =>
        file.name === 'image.png' || !file.name
          ? new File([file], t('Einfügen-{time}.png', { time: Date.now() }), { type: file.type || 'image/png' })
          : file
      );
      toast(
        named.length === 1
          ? t('Aus der Zwischenablage wird hochgeladen')
          : t('{count} Dateien aus der Zwischenablage werden hochgeladen', { count: named.length }),
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

  const discardPending = useCallback(async () => {
    const list = pending;
    setPending([]);
    await Promise.all(list.map((session) => cancelUploadSession(session.id).catch(() => {})));
  }, [pending]);

  const active = items.filter((item) => ['queued', 'uploading', 'paused', 'retrying'].includes(item.status)).length;
  const value = useMemo(
    () => ({
      pick: () => input.current?.click(),
      pickFolder: () => folderInput.current?.click(),
      enqueue,
      active,
      setOptions,
      pending,
      discardPending,
    }),
    [enqueue, active, setOptions, pending, discardPending]
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) route({ loose: Array.from(event.target.files), folders: [] });
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(event) => {
          if (event.target.files) route(groupPicked(event.target.files));
          event.target.value = '';
        }}
      />
      <GlobalStyles
        styles={{
          '.moeshare-upload-tray': { bottom: 'calc(16px + env(safe-area-inset-bottom))' },
          '@media (max-width: 899.95px)': { '.moeshare-upload-tray': { bottom: 'calc(92px + env(safe-area-inset-bottom))' } },
        }}
      />
      <DropOverlay open={dragging} maxBytes={maxBytes} albums={albums} />
      <UploadTray
        items={items}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onRemove={remove}
        onPause={pause}
        onResume={resume}
        onRetry={(id) => {
          started.current.delete(id);
          update(id, { status: 'queued', progress: 0, error: undefined });
        }}
        onClose={clearAll}
      />
    </UploadContext.Provider>
  );
}

export function ResumeNotice() {
  const { pending, pick, discardPending } = useUploads();
  const [busy, setBusy] = useState(false);
  if (!pending.length) return null;
  const bytes = pending.reduce((sum, session) => sum + (session.size - session.received), 0);
  return (
    <m.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}>
      <Box
        role="status"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
          px: 2,
          py: 1.5,
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerHigh,
          color: c.onSurface,
        }}
      >
        <Box sx={{ color: c.primary, display: 'flex' }}>
          <RestoreRounded />
        </Box>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
            {tn(pending.length, 'Ein Upload wurde unterbrochen', '{count} Uploads wurden unterbrochen')}:{' '}
            {pending
              .slice(0, 3)
              .map((session) => session.name)
              .join(', ')}
            {pending.length > 3 ? ' …' : ''}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Wähle dieselben Dateien noch einmal aus, dann geht es an der Stelle weiter. Es fehlen noch {size}.', {
              size: formatBytes(bytes),
            })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            color="inherit"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await discardPending();
              setBusy(false);
            }}
          >
            {t('Verwerfen')}
          </Button>
          <Button variant="contained" onClick={pick}>
            {t('Dateien wählen')}
          </Button>
        </Box>
      </Box>
    </m.div>
  );
}

function DropOverlay({ open, maxBytes, albums }: { open: boolean; maxBytes: number | null; albums: boolean }) {
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
                  {t('Zum Hochladen loslassen')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                  {t('Bilder, Videos, Audio und alle anderen Dateien')}
                  {maxBytes ? t(' – bis zu {maxBytes} pro Datei', { maxBytes: formatBytes(maxBytes) }) : ''}.
                </Typography>
                {albums && (
                  <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                    {t('Ordner und ZIP-Archive werden auf Wunsch zum Album.')}
                  </Typography>
                )}
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
  onPause,
  onResume,
  onRetry,
  onClose,
}: {
  items: UploadItem[];
  collapsed: boolean;
  onToggle: () => void;
  onRemove: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onRetry: (id: number) => void;
  onClose: () => void;
}) {
  const active = items.filter((item) => ['queued', 'uploading', 'paused', 'retrying'].includes(item.status));
  const failed = items.filter((item) => item.status === 'error').length;
  const done = items.filter((item) => item.status === 'done').length;
  const paused = items.filter((item) => item.status === 'paused').length;
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0) || 1;
  const progress = items.reduce((sum, item) => sum + item.file.size * (item.status === 'error' ? 1 : item.progress), 0) / totalBytes;

  const title = active.length
    ? paused === active.length
      ? tn(paused, 'Ein Upload ist pausiert', '{count} Uploads sind pausiert')
      : tn(active.length, 'Eine Datei wird hochgeladen', '{count} Dateien werden hochgeladen')
    : failed
      ? tn(failed, '1 Upload ist fehlgeschlagen', '{count} Uploads sind fehlgeschlagen')
      : tn(done, 'Datei hochgeladen', '{count} Dateien hochgeladen');

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
                    {t('{percent} % insgesamt', { percent: Math.round(progress * 100) })}
                  </Typography>
                )}
              </Box>
              <Tooltip title={collapsed ? t('Liste zeigen') : t('Liste einklappen')}>
                <IconButton size="small" onClick={onToggle} aria-label={collapsed ? t('Liste zeigen') : t('Liste einklappen')}>
                  <ExpandMoreRounded
                    sx={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: `transform 250ms ${css.standard}` }}
                  />
                </IconButton>
              </Tooltip>
              <Tooltip title={active.length ? t('Alle abbrechen') : t('Schließen')}>
                <IconButton size="small" onClick={onClose} aria-label={active.length ? t('Alle Uploads abbrechen') : t('Schließen')}>
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
                      <UploadRow
                        item={item}
                        onRemove={() => onRemove(item.id)}
                        onRetry={() => onRetry(item.id)}
                        onPause={() => onPause(item.id)}
                        onResume={() => onResume(item.id)}
                      />
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

function doneCaption(item: UploadItem) {
  const twin = item.result?.duplicateOf;
  if (twin) return twin.stored ? t('Schon vorhanden, belegt keinen zusätzlichen Speicher') : t('Diese Datei hast du schon');
  return t('{size} hochgeladen', { size: formatBytes(item.file.size) });
}

function UploadRow({
  item,
  onRemove,
  onRetry,
  onPause,
  onResume,
}: {
  item: UploadItem;
  onRemove: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const type = guessType(item.file);
  const label =
    item.status === 'queued'
      ? t('wartet')
      : item.status === 'paused'
        ? t('pausiert')
        : item.status === 'retrying'
          ? t('neuer Versuch')
          : `${Math.round(item.progress * 100)} %`;
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
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
            {doneCaption(item)}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
            <LinearProgress
              variant={item.status === 'queued' ? 'indeterminate' : 'determinate'}
              value={item.progress * 100}
              color={item.status === 'paused' || item.status === 'retrying' ? 'inherit' : 'primary'}
              sx={{ flex: 1, height: 4 }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 34, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {label}
            </Typography>
          </Box>
        )}
      </Box>
      {item.status === 'done' && <CheckCircleRounded sx={{ color: c.primary }} />}
      {item.resumable && (item.status === 'uploading' || item.status === 'retrying') && (
        <Tooltip title={t('Pausieren')}>
          <IconButton size="small" onClick={onPause} aria-label={t('Upload pausieren')}>
            <PauseRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {item.status === 'paused' && (
        <Tooltip title={t('Fortsetzen')}>
          <IconButton size="small" onClick={onResume} aria-label={t('Upload fortsetzen')}>
            <PlayArrowRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {item.status === 'error' && (
        <>
          <ErrorRounded sx={{ color: c.error }} />
          {!item.error?.startsWith(t('Zu groß')) && (
            <Tooltip title={item.resumable ? t('Fortsetzen') : t('Erneut versuchen')}>
              <IconButton size="small" onClick={onRetry} aria-label={item.resumable ? t('Upload fortsetzen') : t('Erneut versuchen')}>
                <ReplayRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}
      {item.status !== 'done' && (
        <Tooltip title={item.status === 'error' ? t('Entfernen') : t('Abbrechen')}>
          <IconButton size="small" onClick={onRemove} aria-label={item.status === 'error' ? t('Entfernen') : t('Upload abbrechen')}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
