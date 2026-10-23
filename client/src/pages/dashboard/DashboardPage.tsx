import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Fab from '@mui/material/Fab';
import GlobalStyles from '@mui/material/GlobalStyles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import { readBoot } from '../../lib/boot';
import type { Album, DashboardBoot, FileItem, TagCount, UserStats } from '../../lib/types';
import {
  ApiError,
  bulkFiles,
  fetchTags,
  fetchUserStats,
  listAlbums,
  listFiles,
  updateFile,
  zipUrl,
  type ClipResult,
  type SortKey,
  type TypeFilter,
  type UploadResponse,
} from '../../lib/api';
import type { DropContents } from '../../lib/folders';
import { extensionOf, formatBytes, formatNumber, relativeFromServer } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { sharedUrl, takeSharedItems } from '../../lib/shareTarget';
import { ScrollTabs } from '../../components/ScrollTabs';
import { EditFileDialog } from './EditFileDialog';
import { TextDialog } from './TextDialog';
import { AlbumPickerDialog, AlbumsView } from './albums';
import { LinkDialog, LinksView } from './links';
import { EMPTY_PREFS, UploadOptionsDialog, describePrefs, prefsActive, toUploadOptions, type UploadPrefs } from './options';
import { useDebouncedValue, useHotkey, useInView, useNow } from '../../lib/hooks';
import { mix } from '../../lib/color';
import { AppShell } from '../../components/AppShell';
import { SearchField } from '../../components/SearchField';
import { StorageMeter } from '../../components/StorageMeter';
import { ConfirmProvider, useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { Gallery } from './Gallery';
import { Viewer, type ViewerState } from './Viewer';
import { FilterBar, type TypeCounts } from './FilterBar';
import { BulkDialog, EmptyState, FileMenu, SelectionBar, UrlUploadDialog, type BulkAction, type QuickAction } from './parts';
import { ResumeNotice, UploadProvider, useUploads } from './uploads';
import { FolderImportDialog, type FolderSource } from './folders';
import { VersionsDialog } from './versions';
import { ClipDialog } from './clip';
import { DuplicatesDialog } from './duplicates';
import { TrashView } from './trash';
import { InsightsView } from './insights';
import { ImageEditor } from './editor/ImageEditor';
import { StatsDialog, type StatsTarget } from '../../components/StatsView';
import { displayName, hasWarning } from './MediaTile';
import { c, ease } from '../../theme/tokens';

const keyframes = (
  <GlobalStyles
    styles={{
      '@keyframes moeshare-eq': { from: { transform: 'scaleY(0.35)' }, to: { transform: 'scaleY(1)' } },
      '@keyframes moeshare-fresh': {
        '0%': { boxShadow: `0 0 0 0 ${mix(c.primary, 0)}` },
        '18%': { boxShadow: `0 0 0 4px ${c.primary}` },
        '100%': { boxShadow: `0 0 0 0 ${mix(c.primary, 0)}` },
      },
    }}
  />
);

function totalBytes(stats: UserStats) {
  const b = stats.storageBreakdown;
  return stats.storageBytes ?? b.images + b.videos + b.audio + b.other;
}

function summaryText(stats: UserStats, quotaBytes: number | null) {
  if (!stats.files)
    return quotaBytes
      ? t('Dein Speicher ist noch leer. Dir stehen {size} zur Verfügung.', { size: formatBytes(quotaBytes) })
      : t('Dein Speicher ist noch leer.');
  const parts = [
    tn(stats.files, '1 Datei mit zusammen {size}', '{count} Dateien mit zusammen {size}', { size: formatBytes(totalBytes(stats)) }),
  ];
  if (stats.views) parts.push(tn(stats.views, '1 Aufruf', '{count} Aufrufe'));
  const latest = stats.latestUpload ? ` ${t('Zuletzt hochgeladen {when}.', { when: relativeFromServer(stats.latestUpload) })}` : '';
  return `${parts.join(', ')}.${latest}`;
}

type Section = 'files' | 'albums' | 'links' | 'stats' | 'trash';

const SECTION_HASH: Record<Section, string> = { files: '', albums: '#alben', links: '#links', stats: '#statistik', trash: '#papierkorb' };

function sectionFromHash(boot: DashboardBoot): { section: Section; album: number | null } {
  const hash = window.location.hash;
  const album = /^#album=(\d+)$/.exec(hash);
  if (album && boot.options.albums) return { section: 'albums', album: Number(album[1]) };
  if (hash === '#alben' && boot.options.albums) return { section: 'albums', album: null };
  if (hash === '#links' && boot.options.links) return { section: 'links', album: null };
  if (hash === '#statistik' && boot.options.stats) return { section: 'stats', album: null };
  if (hash === '#papierkorb' && boot.options.trash) return { section: 'trash', album: null };
  return { section: 'files', album: null };
}

function UploadFab({ compact }: { compact: boolean }) {
  const { pick, active } = useUploads();
  return (
    <Fab variant="extended" onClick={pick} aria-label={t('Dateien hochladen')} sx={{ pl: compact ? 2 : 2.5, pr: compact ? 2 : 3 }}>
      <CloudUploadRounded />
      <Collapse orientation="horizontal" in={!compact} timeout={220}>
        <Box component="span" sx={{ whiteSpace: 'nowrap', display: 'inline-block', pl: 1 }}>
          {active ? t('{count} läuft', { count: active }) : t('Hochladen')}
        </Box>
      </Collapse>
    </Fab>
  );
}

function RailUpload() {
  const { pick, active } = useUploads();
  return (
    <Tooltip title={t('Hochladen (U)')} placement="right">
      <Fab onClick={pick} aria-label={t('Dateien hochladen')} sx={{ width: 56, height: 56 }}>
        <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
          <CloudUploadRounded />
          {active > 0 && (
            <Box
              component="span"
              sx={{
                position: 'absolute',
                top: -14,
                right: -16,
                minWidth: 18,
                height: 18,
                px: 0.5,
                borderRadius: 9,
                bgcolor: c.primary,
                color: c.onPrimary,
                fontSize: '0.6875rem',
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {active}
            </Box>
          )}
        </Box>
      </Fab>
    </Tooltip>
  );
}

interface UploadRoutes {
  uploaded: (names: string[], results: UploadResponse[]) => void;
  folders: (contents: DropContents) => void;
  archive: (file: File) => void;
}

interface DashboardProps {
  boot: DashboardBoot;
  registerRoutes: (routes: UploadRoutes) => void;
}

function Dashboard({ boot, registerRoutes }: DashboardProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { pick, pickFolder, enqueue, setOptions } = useUploads();
  const pageSize = boot.files.limit || 40;
  useNow(60000);

  const initial = useMemo(() => sectionFromHash(boot), [boot]);
  const [section, setSection] = useState<Section>(initial.section);
  const [albumOpen, setAlbumOpen] = useState<number | null>(initial.album);
  const [prefs, setPrefs] = useState<UploadPrefs>(EMPTY_PREFS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [textInitial, setTextInitial] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState('');
  const [linksVersion, setLinksVersion] = useState(0);
  const [editing, setEditing] = useState<FileItem | null>(null);
  const [albumPicker, setAlbumPicker] = useState<number[] | null>(null);
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [tags, setTags] = useState<TagCount[]>(boot.tags || []);
  const [tag, setTag] = useState('');
  const [albums, setAlbums] = useState<Album[]>([]);
  const [statsTarget, setStatsTarget] = useState<StatsTarget | null>(null);
  const [imageEdit, setImageEdit] = useState<FileItem | null>(null);
  const [trashVersion, setTrashVersion] = useState(0);
  const [folderSource, setFolderSource] = useState<FolderSource | null>(null);
  const [versionsFile, setVersionsFile] = useState<FileItem | null>(null);
  const [clipFile, setClipFile] = useState<FileItem | null>(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [uploadRound, setUploadRound] = useState(0);

  useEffect(
    () => setOptions({ ...toUploadOptions(prefs), ...(section === 'albums' && albumOpen ? { album: albumOpen } : {}) }),
    [prefs, section, albumOpen, setOptions]
  );

  useEffect(() => {
    const onHash = () => {
      const next = sectionFromHash(boot);
      setSection(next.section);
      setAlbumOpen(next.album);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [boot]);

  const goSection = useCallback((next: Section, album: number | null = null) => {
    setSection(next);
    setAlbumOpen(album);
    const hash = next === 'albums' && album ? `#album=${album}` : SECTION_HASH[next];
    window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
  }, []);

  const refreshTags = useCallback(() => {
    fetchTags()
      .then((res) => setTags(res.tags))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!optionsOpen || !boot.options.albums) return;
    listAlbums()
      .then((res) => setAlbums(res.albums))
      .catch(() => {});
  }, [optionsOpen, boot.options.albums]);

  const [files, setFiles] = useState<FileItem[]>(boot.files.files);
  const [page, setPage] = useState(boot.files.page || 1);
  const [hasMore, setHasMore] = useState(boot.files.hasNext);
  const [total, setTotal] = useState(boot.files.total);
  const [status, setStatus] = useState<'idle' | 'reload' | 'more'>('idle');
  const [stats, setStats] = useState<UserStats>(boot.stats);
  const [quotaBytes, setQuotaBytes] = useState<number | null>(boot.quota?.quotaBytes ?? null);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim(), 280);
  const [type, setType] = useState<TypeFilter>('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewerIndex = viewer ? viewer.index : null;
  const [hidden, setHidden] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ file: FileItem; anchor: HTMLElement | { x: number; y: number } } | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [cascade, setCascade] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const frames = useRef(new Map<string, HTMLElement>());
  const requestId = useRef(0);
  const anchorIndex = useRef<number | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const selecting = selectMode || selected.size > 0;
  const filtered = !!search || type !== '' || !!tag;
  const overlay = viewerIndex !== null || !!imageEdit || !!versionsFile || !!clipFile;
  const trashOn = boot.options.trash;
  const canEditImage = useCallback(
    (file: FileItem) => file.type === 'image' && !file.isGif && boot.options.editable.includes(`.${extensionOf(file.filename)}`),
    [boot.options.editable]
  );
  const openStats = useCallback((file: FileItem) => setStatsTarget({ kind: 'file', id: file.id, title: displayName(file) }), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setCascade(false), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.sessionExpired) {
        toast(error.message, {
          variant: 'error',
          duration: 10000,
          action: { label: t('Anmelden'), onClick: () => window.location.assign('/login') },
        });
      } else {
        toast(error instanceof Error ? error.message : t('Etwas ist schiefgelaufen.'), { variant: 'error' });
      }
    },
    [toast]
  );

  const refreshStats = useCallback(() => {
    fetchUserStats()
      .then((next) => {
        setStats(next);
        if (next.quota) setQuotaBytes(next.quota.quotaBytes);
      })
      .catch(() => {});
  }, []);

  const reload = useCallback(
    async (freshNames: string[] = []) => {
      const id = ++requestId.current;
      setStatus('reload');
      try {
        const res = await listFiles({ page: 1, limit: pageSize, search, type, sort, tag });
        if (id !== requestId.current) return;
        setFiles(res.files);
        setPage(res.page);
        setHasMore(res.hasNext);
        setTotal(res.total);
        if (freshNames.length) {
          setFresh(new Set(freshNames));
          window.setTimeout(() => setFresh(new Set()), 2600);
        }
      } catch (error) {
        if (id === requestId.current) fail(error);
      } finally {
        if (id === requestId.current) setStatus('idle');
      }
    },
    [pageSize, search, type, sort, tag, fail]
  );

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    reload();
  }, [search, type, sort, tag]);

  const loadMore = useCallback(async () => {
    if (statusRef.current !== 'idle' || !hasMore) return;
    const id = requestId.current;
    setStatus('more');
    try {
      const res = await listFiles({ page: page + 1, limit: pageSize, search, type, sort, tag });
      if (id !== requestId.current) return;
      setFiles((prev) => {
        const known = new Set(prev.map((f) => f.filename));
        return [...prev, ...res.files.filter((f) => !known.has(f.filename))];
      });
      setPage(res.page);
      setHasMore(res.hasNext);
      setTotal(res.total);
    } catch (error) {
      fail(error);
    } finally {
      if (id === requestId.current) setStatus('idle');
    }
  }, [hasMore, page, pageSize, search, type, sort, tag, fail]);

  const sentinel = useInView(loadMore, hasMore && status === 'idle');

  useEffect(() => {
    registerRoutes({
      uploaded: (names, results) => {
        reload(names);
        refreshStats();
        setUploadRound((value) => value + 1);
        if (prefs.tags.length) refreshTags();
        const twins = results.filter((result) => result.duplicateOf).length;
        if (!twins) {
          toast(tn(names.length, 'Datei hochgeladen', '{count} Dateien hochgeladen'), { variant: 'success', duration: 2600 });
          return;
        }
        toast(
          names.length === 1
            ? t('Datei hochgeladen. Die gleiche Datei hattest du schon einmal hochgeladen.')
            : tn(
                twins,
                '{total} Dateien hochgeladen, eine davon hattest du schon.',
                '{total} Dateien hochgeladen, {count} davon hattest du schon.',
                {
                  total: names.length,
                }
              ),
          { variant: 'info', duration: 7000, action: { label: t('Duplikate'), onClick: () => setDuplicatesOpen(true) } }
        );
      },
      folders: (contents) => setFolderSource({ kind: 'folders', contents }),
      archive: (file) => setFolderSource({ kind: 'zip', file }),
    });
  }, [registerRoutes, reload, refreshStats, refreshTags, prefs.tags.length, toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('aktion');
    const shared = params.get('teilen');
    if (!action && !shared) return;
    params.delete('aktion');
    params.delete('teilen');
    params.delete('quelle');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    if (action === 'hochladen') pick();
    if (action === 'text' && boot.options.texts) setTextOpen(true);
    if (action === 'link' && boot.options.links) {
      setLinkInitial('');
      setLinkOpen(true);
    }
    if (shared === 'fehler')
      toast(t('Das Teilen hat nicht geklappt. Öffne MoeShare einmal im Browser und versuche es erneut.'), { variant: 'error' });
    if (shared === '1') {
      takeSharedItems().then(({ files: sharedFiles, text }) => {
        if (sharedFiles.length) {
          enqueue(sharedFiles);
          return;
        }
        const url = sharedUrl(text);
        if (url && boot.options.links && text.trim() === url) {
          setLinkInitial(url);
          setLinkOpen(true);
        } else if (text && boot.options.texts) {
          setTextInitial(text);
          setTextOpen(true);
        } else if (url && boot.options.links) {
          setLinkInitial(url);
          setLinkOpen(true);
        } else {
          toast(t('Es wurde nichts geteilt, das sich hochladen lässt.'), { variant: 'info' });
        }
      });
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectMode(false);
    anchorIndex.current = null;
  }, []);

  const toggleSelect = useCallback(
    (file: FileItem, shiftKey: boolean) => {
      const index = files.findIndex((f) => f.filename === file.filename);
      setSelected((prev) => {
        const next = new Set(prev);
        if (shiftKey && anchorIndex.current !== null && index >= 0) {
          const [from, to] = [Math.min(anchorIndex.current, index), Math.max(anchorIndex.current, index)];
          for (let i = from; i <= to; i++) next.add(files[i].filename);
        } else if (next.has(file.filename)) {
          next.delete(file.filename);
        } else {
          next.add(file.filename);
        }
        return next;
      });
      anchorIndex.current = index;
    },
    [files]
  );

  const allSelected = files.length > 0 && files.every((f) => selected.has(f.filename));
  const selectedFiles = useMemo(() => files.filter((f) => selected.has(f.filename)), [files, selected]);

  const restoreFiles = useCallback(
    async (ids: number[]) => {
      try {
        const res = await bulkFiles({ action: 'restore', ids });
        toast(tn(res.count, 'Datei wiederhergestellt', '{count} Dateien wiederhergestellt'), { variant: 'success' });
        reload();
        refreshStats();
        setTrashVersion((value) => value + 1);
      } catch (error) {
        fail(error);
      }
    },
    [toast, reload, refreshStats, fail]
  );

  const deleteFiles = useCallback(
    async (list: FileItem[]) => {
      if (!list.length) return false;
      const single = list.length === 1;
      if (!trashOn) {
        const ok = await confirm({
          title: single ? t('Datei löschen?') : t('{count} Dateien löschen?', { count: formatNumber(list.length) }),
          message: single
            ? t('„{name}“ wird endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.', { name: displayName(list[0]) })
            : t('Die {count} Dateien werden endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.', {
                count: formatNumber(list.length),
              }),
          confirmLabel: t('Löschen'),
        });
        if (!ok) return false;
      }

      const names = new Set(list.map((f) => f.filename));
      setFiles((prev) => prev.filter((f) => !names.has(f.filename)));
      setTotal((n) => Math.max(0, n - list.length));
      setSelected((prev) => {
        const next = new Set(prev);
        names.forEach((name) => next.delete(name));
        return next;
      });

      const ids = list.map((file) => file.id);
      try {
        let count = 0;
        let trashed = false;
        for (let index = 0; index < ids.length; index += 500) {
          const res = await bulkFiles({ action: 'delete', ids: ids.slice(index, index + 500) });
          count += res.count;
          trashed = trashed || res.trashed;
        }
        if (count < list.length) reload();
        if (trashed) {
          toast(
            single
              ? t('„{name}“ liegt jetzt im Papierkorb', { name: displayName(list[0]) })
              : tn(count, '1 Datei in den Papierkorb gelegt', '{count} Dateien in den Papierkorb gelegt'),
            { variant: 'success', duration: 8000, action: { label: t('Rückgängig'), onClick: () => restoreFiles(ids) } }
          );
          setTrashVersion((value) => value + 1);
        } else if (count) {
          toast(tn(count, 'Datei gelöscht', '{count} Dateien gelöscht'), { variant: 'success' });
        }
      } catch (error) {
        fail(error);
        reload();
      }
      refreshStats();
      if (!single) clearSelection();
      return true;
    },
    [confirm, toast, fail, reload, refreshStats, clearSelection, restoreFiles, trashOn]
  );

  useEffect(() => {
    const match = /^#loeschen=(.+)$/.exec(window.location.hash);
    if (!match) return;
    const filename = decodeURIComponent(match[1]);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    (async () => {
      let file = files.find((f) => f.filename === filename);
      if (!file) {
        try {
          const res = await listFiles({ page: 1, limit: 5, search: filename, type: '', sort: 'newest' });
          file = res.files.find((f) => f.filename === filename);
        } catch {}
      }
      if (file) deleteFiles([file]);
      else toast(t('Diese Datei gibt es nicht (mehr) oder sie gehört einem anderen Konto.'), { variant: 'error' });
    })();
  }, []);

  const openViewer = useCallback(
    (file: FileItem, frame?: HTMLElement | null) => {
      const index = files.findIndex((f) => f.filename === file.filename);
      if (index < 0) return;
      const el = frame ?? frames.current.get(file.filename) ?? null;
      const rect = el?.getBoundingClientRect() ?? null;
      const onScreen = rect && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      setHidden(file.filename);
      setViewer({ index, origin: onScreen ? rect : null, openedWith: file.filename });
    },
    [files]
  );

  useEffect(() => {
    if (viewerIndex === null) return;
    if (!files.length) {
      setViewer(null);
      setHidden(null);
    } else if (viewerIndex >= files.length) {
      setViewer((v) => (v ? { ...v, index: files.length - 1 } : v));
    }
  }, [files.length, viewerIndex]);

  const tileHandlers = useMemo(
    () => ({
      onOpen: (file: FileItem, frame: HTMLElement | null) => openViewer(file, frame),
      onToggleSelect: toggleSelect,
      onMenu: (file: FileItem, anchor: HTMLElement | { x: number; y: number }) => setMenu({ file, anchor }),
      register: (filename: string, el: HTMLElement | null) => {
        if (el) frames.current.set(filename, el);
        else frames.current.delete(filename);
      },
    }),
    [openViewer, toggleSelect]
  );

  const frameFor = useCallback((filename: string) => frames.current.get(filename) ?? null, []);
  const onHide = useCallback((filename: string | null) => setHidden(filename), []);
  const onViewerClosed = useCallback(() => setViewer(null), []);
  const onViewerIndex = useCallback((index: number) => setViewer((v) => (v ? { ...v, index } : v)), []);

  useHotkey('/', (event) => {
    if (overlay) return;
    event.preventDefault();
    searchRef.current?.focus();
  });
  useHotkey('u', () => !overlay && section === 'files' && pick());
  useHotkey('Escape', () => !overlay && selecting && clearSelection(), { enabled: selecting });
  useEffect(() => {
    if (!selecting) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !overlay) {
        const el = event.target as HTMLElement;
        if (['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
        event.preventDefault();
        setSelected(new Set(files.map((f) => f.filename)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, files, overlay]);

  const counts: TypeCounts = {
    all: stats.files,
    image: stats.images,
    video: stats.videos,
    audio: stats.audio,
    text: stats.texts || 0,
    file: Math.max(0, stats.files - stats.images - stats.videos - stats.audio - (stats.texts || 0)),
  };

  const replaceFile = useCallback((updated: FileItem) => {
    setFiles((prev) => prev.map((file) => (file.id === updated.id ? updated : file)));
  }, []);

  const toggleWarning = useCallback(
    async (file: FileItem) => {
      try {
        const { file: updated } = await updateFile(file.id, { warning: hasWarning(file) ? null : '' });
        replaceFile(updated);
        toast(hasWarning(updated) ? t('Inhaltswarnung gesetzt') : t('Inhaltswarnung entfernt'), { variant: 'success' });
      } catch (error) {
        fail(error);
      }
    },
    [replaceFile, toast, fail]
  );

  const clipDone = useCallback(
    (result: ClipResult) => {
      if (result.kind === 'version') {
        replaceFile(result.file);
        toast(t('Video ersetzt'), { variant: 'success' });
      } else {
        reload([result.file.filename]);
        toast(result.file.isGif ? t('GIF gespeichert') : t('Ausschnitt gespeichert'), {
          variant: 'success',
          action: { label: t('Öffnen'), onClick: () => window.open(result.file.urls.view, '_blank', 'noopener') },
        });
      }
      refreshStats();
    },
    [replaceFile, reload, refreshStats, toast]
  );

  const runBulk = useCallback(
    async (action: string, extra: { tags?: string[]; expires?: string; password?: string; warning?: string } = {}) => {
      const ids = selectedFiles.map((file) => file.id);
      if (!ids.length) return;
      try {
        const res = await bulkFiles({ action, ids, ...extra });
        toast(
          action === 'list'
            ? tn(res.count, '1 Datei erscheint jetzt im Profil', '{count} Dateien erscheinen jetzt im Profil')
            : action === 'unlist'
              ? tn(res.count, '1 Datei aus dem Profil genommen', '{count} Dateien aus dem Profil genommen')
              : action === 'warn'
                ? tn(res.count, '1 Datei hat jetzt eine Inhaltswarnung', '{count} Dateien haben jetzt eine Inhaltswarnung')
                : action === 'unwarn'
                  ? tn(res.count, 'Inhaltswarnung bei 1 Datei entfernt', 'Inhaltswarnung bei {count} Dateien entfernt')
                  : tn(res.count, '1 Datei geändert', '{count} Dateien geändert'),
          { variant: 'success' }
        );
        reload();
        if (action === 'tag' || action === 'untag') refreshTags();
      } catch (error) {
        fail(error);
      }
    },
    [selectedFiles, toast, reload, refreshTags, fail]
  );

  const scrolledDown = useScrollTrigger({ threshold: 120 });
  const showEmpty = status !== 'reload' && files.length === 0;

  const topBar = (
    <AnimatePresence mode="wait" initial={false}>
      {selecting ? (
        <m.div
          key="selection"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: ease.emphasizedDecelerate }}
          style={{ width: '100%', maxWidth: 860 }}
        >
          <SelectionBar
            count={selected.size}
            allSelected={allSelected}
            links={selectedFiles.map((f) => f.urls.view).join('\n')}
            onClear={clearSelection}
            onSelectAll={() => (allSelected ? setSelected(new Set()) : setSelected(new Set(files.map((f) => f.filename))))}
            onDelete={() => deleteFiles(selectedFiles)}
            onAlbum={boot.options.albums ? () => setAlbumPicker(selectedFiles.map((f) => f.id)) : undefined}
            onBulk={setBulk}
            onQuick={(action: QuickAction) => runBulk(action)}
            zipHref={boot.options.zip ? zipUrl(selectedFiles.map((f) => f.id)) : undefined}
            trash={trashOn}
            profiles={boot.options.profiles}
          />
        </m.div>
      ) : (
        <m.div
          key="search"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2, ease: ease.emphasizedDecelerate }}
          style={{ width: '100%', maxWidth: 720 }}
        >
          <SearchField
            ref={searchRef}
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (section !== 'files') goSection('files');
            }}
            placeholder={boot.options.contentSearch ? t('Dateien und Texte durchsuchen') : t('Dateien durchsuchen')}
            shortcut="/"
            busy={status === 'reload' && !!query}
          />
        </m.div>
      )}
    </AnimatePresence>
  );

  return (
    <AppShell
      site={boot.site}
      user={boot.user}
      active="dashboard"
      topBar={topBar}
      railAction={<RailUpload />}
      mobileAction={<UploadFab compact={scrolledDown} />}
      accountSummary={tn(stats.files, '1 Datei, {size} belegt', '{count} Dateien, {size} belegt', { size: formatBytes(totalBytes(stats)) })}
      contextual={selecting}
    >
      {keyframes}
      <Box component="section" aria-labelledby="greeting" sx={{ pt: { xs: 1, md: 1.5 }, pb: { xs: 2.5, md: 3.5 }, maxWidth: 880 }}>
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: ease.emphasizedDecelerate }}
        >
          <Typography id="greeting" variant="h1" sx={{ fontSize: { xs: '1.875rem', sm: '2.25rem', md: '2.5rem' } }}>
            {boot.greeting}, {boot.user.username}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', mt: 0.75 }}>
            {summaryText(stats, quotaBytes)}
          </Typography>
        </m.div>
        {(stats.files > 0 || (stats.trash?.bytes ?? 0) > 0) && (
          <Box sx={{ mt: 2.5 }}>
            <StorageMeter
              breakdown={stats.storageBreakdown}
              capacity={quotaBytes}
              trash={stats.trash?.bytes ?? 0}
              saved={stats.savedBytes ?? 0}
            />
          </Box>
        )}
      </Box>

      {(boot.options.albums || boot.options.links || boot.options.stats || trashOn) && (
        <Box sx={{ mb: 2.5, mt: -1 }}>
          <ScrollTabs value={section} onChange={(next) => goSection(next)} label={t('Bereiche')}>
            <Tab value="files" label={t('Dateien')} />
            {boot.options.albums && <Tab value="albums" label={t('Alben')} />}
            {boot.options.links && <Tab value="links" label={t('Links')} />}
            {boot.options.stats && <Tab value="stats" label={t('Statistik')} />}
            {trashOn && (
              <Tab
                value="trash"
                label={
                  stats.trash?.files ? (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      {t('Papierkorb')}
                      <Box
                        component="span"
                        aria-label={tn(stats.trash.files, '1 Datei', '{count} Dateien')}
                        sx={{
                          minWidth: 20,
                          px: 0.75,
                          borderRadius: '10px',
                          bgcolor: c.surfaceContainerHighest,
                          fontSize: '0.75rem',
                          lineHeight: '20px',
                        }}
                      >
                        {formatNumber(stats.trash.files)}
                      </Box>
                    </Box>
                  ) : (
                    t('Papierkorb')
                  )
                }
              />
            )}
          </ScrollTabs>
        </Box>
      )}

      {section === 'albums' && (
        <AlbumsView openId={albumOpen} onOpen={(id) => goSection('albums', id)} info={boot.options} refreshKey={uploadRound} />
      )}
      {section === 'links' && <LinksView info={boot.options} version={linksVersion} />}
      {section === 'stats' && <InsightsView onOpen={openStats} />}
      {section === 'trash' && (
        <TrashView
          key={trashVersion}
          onChanged={() => {
            reload();
            refreshStats();
          }}
        />
      )}

      {section === 'files' && (
        <>
          <ResumeNotice />
          {(stats.files > 0 || filtered || files.length > 0) && (
            <FilterBar
              type={type}
              onType={setType}
              sort={sort}
              onSort={setSort}
              counts={counts}
              onUrl={boot.urlFetch ? () => setUrlOpen(true) : undefined}
              onText={boot.options.texts ? () => setTextOpen(true) : undefined}
              onFolder={pickFolder}
              duplicates={stats.duplicates || 0}
              onDuplicates={() => setDuplicatesOpen(true)}
              onOptions={() => setOptionsOpen(true)}
              optionsActive={prefsActive(prefs)}
              tags={tags}
              tag={tag}
              onTag={setTag}
              selecting={selecting}
              onSelectMode={() => (selecting ? clearSelection() : setSelectMode(true))}
            />
          )}

          {prefsActive(prefs) && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5, mt: -1 }}>
              {t('Für neue Uploads: {options}', { options: describePrefs(prefs, albums) })}
            </Typography>
          )}

          {search && status !== 'reload' && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }} aria-live="polite">
              {total === 0 ? t('Keine Treffer') : tn(total, '1 Treffer für „{query}“', '{count} Treffer für „{query}“', { query: search })}
            </Typography>
          )}

          {showEmpty ? (
            <EmptyState
              filtered={filtered}
              query={search}
              onReset={() => {
                setQuery('');
                setType('');
                setTag('');
              }}
              onPick={pick}
              onUrl={boot.urlFetch ? () => setUrlOpen(true) : undefined}
              onText={boot.options.texts ? () => setTextOpen(true) : undefined}
            />
          ) : (
            <Gallery
              files={files}
              selected={selected}
              selecting={selecting}
              hiddenFilename={hidden}
              fresh={fresh}
              cascade={cascade}
              dimmed={status === 'reload'}
              loadingMore={status === 'more'}
              {...tileHandlers}
            />
          )}
          <Box ref={sentinel} sx={{ height: '1px' }} />
        </>
      )}

      <FileMenu
        file={menu?.file ?? null}
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        onPreview={(file) => openViewer(file)}
        onSelect={(file) => toggleSelect(file, false)}
        onDelete={(file) => deleteFiles([file])}
        onEdit={(file) => setEditing(file)}
        onAlbum={boot.options.albums ? (file) => setAlbumPicker([file.id]) : undefined}
        onStats={boot.options.stats ? openStats : undefined}
        onImageEdit={menu && canEditImage(menu.file) ? (file) => setImageEdit(file) : undefined}
        onClip={menu && boot.options.clips && menu.file.type === 'video' ? (file) => setClipFile(file) : undefined}
        onVersions={(file) => setVersionsFile(file)}
        onWarning={toggleWarning}
        trash={trashOn}
      />

      <Viewer
        files={files}
        state={viewer}
        frameFor={frameFor}
        onIndexChange={onViewerIndex}
        onClosed={onViewerClosed}
        onDelete={(file) => deleteFiles([file])}
        onHide={onHide}
        hasMore={hasMore}
        onNeedMore={loadMore}
        statsEnabled={boot.options.stats}
        canEdit={canEditImage}
        onImageEdit={(file) => setImageEdit(file)}
        onVersions={(file) => setVersionsFile(file)}
        onClip={boot.options.clips ? (file) => setClipFile(file) : undefined}
        onWarning={toggleWarning}
        trash={trashOn}
        paused={!!imageEdit || !!versionsFile || !!clipFile}
      />

      <VersionsDialog
        file={versionsFile}
        info={boot.options}
        onClose={() => setVersionsFile(null)}
        onChanged={(updated) => {
          replaceFile(updated);
          refreshStats();
        }}
      />

      <ClipDialog file={clipFile} versions={boot.options.versions} onClose={() => setClipFile(null)} onDone={clipDone} />

      <DuplicatesDialog open={duplicatesOpen} onClose={() => setDuplicatesOpen(false)} onDelete={deleteFiles} />

      <FolderImportDialog
        source={folderSource}
        onClose={() => setFolderSource(null)}
        onDone={(created, failed) => {
          if (failed)
            toast(tn(failed, '1 Datei ließ sich nicht entpacken.', '{count} Dateien ließen sich nicht entpacken.'), { variant: 'error' });
          if (!created.length) return;
          toast(
            created.length === 1
              ? t('Album „{album}“ angelegt, die Dateien werden hochgeladen', { album: created[0].title })
              : tn(
                  created.length,
                  '1 Album angelegt, die Dateien werden hochgeladen',
                  '{count} Alben angelegt, die Dateien werden hochgeladen'
                ),
            {
              variant: 'success',
              duration: 8000,
              action: {
                label: created.length === 1 ? t('Öffnen') : t('Alben'),
                onClick: () => goSection('albums', created.length === 1 ? created[0].id : null),
              },
            }
          );
        }}
      />

      <ImageEditor
        file={imageEdit}
        onClose={() => setImageEdit(null)}
        onSaveCopy={(file) => enqueue([file])}
        onReplaced={(updated) => {
          replaceFile(updated);
          refreshStats();
          toast(t('Bild gespeichert'), { variant: 'success' });
        }}
      />

      <StatsDialog target={statsTarget} onClose={() => setStatsTarget(null)} />

      <UploadOptionsDialog
        open={optionsOpen}
        value={prefs}
        info={boot.options}
        tags={tags}
        albums={albums}
        onClose={() => setOptionsOpen(false)}
        onChange={setPrefs}
      />

      <TextDialog
        open={textOpen}
        info={boot.options}
        tags={tags}
        initialText={textInitial}
        onClose={() => {
          setTextOpen(false);
          setTextInitial('');
        }}
        onDone={(result) => {
          toast(t('Text gespeichert'), {
            variant: 'success',
            action: { label: t('Öffnen'), onClick: () => window.open(result.view, '_blank', 'noopener') },
          });
          reload([result.filename]);
          refreshStats();
          refreshTags();
        }}
      />

      <LinkDialog
        open={linkOpen}
        info={boot.options}
        initialUrl={linkInitial}
        onClose={() => setLinkOpen(false)}
        onCreated={() => setLinksVersion((value) => value + 1)}
      />

      <EditFileDialog
        file={editing}
        info={boot.options}
        tags={tags}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setFiles((prev) => prev.map((file) => (file.id === updated.id ? updated : file)));
          refreshTags();
          toast(t('Änderungen gespeichert'), { variant: 'success' });
        }}
      />

      <AlbumPickerDialog
        open={!!albumPicker}
        fileIds={albumPicker || []}
        onClose={() => setAlbumPicker(null)}
        onDone={() => {
          if (selecting) clearSelection();
        }}
      />

      <BulkDialog
        action={bulk}
        count={selectedFiles.length}
        tags={tags}
        maxExpiry={boot.options.maxExpiry}
        onClose={() => setBulk(null)}
        onSubmit={(action, extra) => runBulk(action, extra)}
      />

      <UrlUploadDialog
        open={urlOpen}
        onClose={() => setUrlOpen(false)}
        options={toUploadOptions(prefs)}
        onDone={() => {
          toast(t('Datei von der URL hochgeladen'), { variant: 'success' });
          reload();
          refreshStats();
        }}
      />
    </AppShell>
  );
}

export function DashboardPage() {
  const boot = readBoot<DashboardBoot>();
  const routes = useRef<UploadRoutes>({ uploaded: () => {}, folders: () => {}, archive: () => {} });
  const registerRoutes = useCallback((next: UploadRoutes) => {
    routes.current = next;
  }, []);
  return (
    <ConfirmProvider>
      <UploadProvider
        maxBytes={boot.maxUploadBytes}
        chunked={boot.options.chunked}
        chunkSize={boot.options.chunkSize}
        albums={boot.options.albums}
        onUploaded={(names, results) => routes.current.uploaded(names, results)}
        onFolders={(contents) => routes.current.folders(contents)}
        onArchive={(file) => routes.current.archive(file)}
      >
        <Dashboard boot={boot} registerRoutes={registerRoutes} />
      </UploadProvider>
    </ConfirmProvider>
  );
}
