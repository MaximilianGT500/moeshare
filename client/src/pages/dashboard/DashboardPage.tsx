import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Fab from '@mui/material/Fab';
import GlobalStyles from '@mui/material/GlobalStyles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import { readBoot } from '../../lib/boot';
import type { DashboardBoot, FileItem, UserStats } from '../../lib/types';
import { ApiError, deleteOwnFile, fetchUserStats, listFiles, type SortKey, type TypeFilter } from '../../lib/api';
import { formatBytes, formatNumber, plural, relativeFromServer } from '../../lib/format';
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
import { EmptyState, FileMenu, SelectionBar, UrlUploadDialog } from './parts';
import { UploadProvider, useUploads } from './uploads';
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
      ? `Dein Speicher ist noch leer. Dir stehen ${formatBytes(quotaBytes)} zur Verfügung.`
      : 'Dein Speicher ist noch leer.';
  const parts = [`${plural(stats.files, 'Datei', 'Dateien')} mit zusammen ${formatBytes(totalBytes(stats))}`];
  if (stats.views) parts.push(`${plural(stats.views, 'Aufruf', 'Aufrufe')}`);
  const latest = stats.latestUpload ? ` Zuletzt hochgeladen ${relativeFromServer(stats.latestUpload)}.` : '';
  return `${parts.join(', ')}.${latest}`;
}

function UploadFab({ compact }: { compact: boolean }) {
  const { pick, active } = useUploads();
  return (
    <Fab variant="extended" onClick={pick} aria-label="Dateien hochladen" sx={{ pl: compact ? 2 : 2.5, pr: compact ? 2 : 3 }}>
      <CloudUploadRounded />
      <Collapse orientation="horizontal" in={!compact} timeout={220}>
        <Box component="span" sx={{ whiteSpace: 'nowrap', display: 'inline-block', pl: 1 }}>
          {active ? `${active} läuft` : 'Hochladen'}
        </Box>
      </Collapse>
    </Fab>
  );
}

function RailUpload() {
  const { pick, active } = useUploads();
  return (
    <Tooltip title="Hochladen (U)" placement="right">
      <Fab onClick={pick} aria-label="Dateien hochladen" sx={{ width: 56, height: 56 }}>
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

interface DashboardProps {
  boot: DashboardBoot;
  registerUploadHandler: (fn: (names: string[]) => void) => void;
}

function Dashboard({ boot, registerUploadHandler }: DashboardProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { pick } = useUploads();
  const pageSize = boot.files.limit || 40;
  useNow(60000);

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
  const filtered = !!search || type !== '';

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
          action: { label: 'Anmelden', onClick: () => window.location.assign('/login') },
        });
      } else {
        toast(error instanceof Error ? error.message : 'Etwas ist schiefgelaufen.', { variant: 'error' });
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
        const res = await listFiles({ page: 1, limit: pageSize, search, type, sort });
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
    [pageSize, search, type, sort, fail]
  );

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    reload();
  }, [search, type, sort]);

  const loadMore = useCallback(async () => {
    if (statusRef.current !== 'idle' || !hasMore) return;
    const id = requestId.current;
    setStatus('more');
    try {
      const res = await listFiles({ page: page + 1, limit: pageSize, search, type, sort });
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
  }, [hasMore, page, pageSize, search, type, sort, fail]);

  const sentinel = useInView(loadMore, hasMore && status === 'idle');

  useEffect(() => {
    registerUploadHandler((names) => {
      reload(names);
      refreshStats();
      toast(names.length === 1 ? 'Datei hochgeladen' : `${names.length} Dateien hochgeladen`, { variant: 'success', duration: 2600 });
    });
  }, [registerUploadHandler, reload, refreshStats, toast]);

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

  const deleteFiles = useCallback(
    async (list: FileItem[]) => {
      if (!list.length) return false;
      const single = list.length === 1;
      const ok = await confirm({
        title: single ? 'Datei löschen?' : `${formatNumber(list.length)} Dateien löschen?`,
        message: single
          ? `„${list[0].filename}“ wird endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.`
          : `Die ${formatNumber(list.length)} Dateien werden endgültig gelöscht. Geteilte Links funktionieren danach nicht mehr.`,
        confirmLabel: 'Löschen',
      });
      if (!ok) return false;

      const names = new Set(list.map((f) => f.filename));
      setFiles((prev) => prev.filter((f) => !names.has(f.filename)));
      setTotal((n) => Math.max(0, n - list.length));
      setSelected((prev) => {
        const next = new Set(prev);
        names.forEach((name) => next.delete(name));
        return next;
      });

      let failed = 0;
      const queue = [...list];
      const worker = async () => {
        while (queue.length) {
          const file = queue.shift()!;
          try {
            await deleteOwnFile(file.filename);
          } catch (error) {
            failed += 1;
            if (error instanceof ApiError && error.sessionExpired) fail(error);
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      const deleted = list.length - failed;
      if (deleted) toast(deleted === 1 ? 'Datei gelöscht' : `${formatNumber(deleted)} Dateien gelöscht`, { variant: 'success' });
      if (failed) {
        toast(`${formatNumber(failed)} ${failed === 1 ? 'Datei konnte' : 'Dateien konnten'} nicht gelöscht werden.`, { variant: 'error' });
        reload();
      }
      refreshStats();
      if (!single) clearSelection();
      return true;
    },
    [confirm, toast, fail, reload, refreshStats, clearSelection]
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
      else toast('Diese Datei gibt es nicht (mehr) oder sie gehört einem anderen Konto.', { variant: 'error' });
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
    if (viewerIndex !== null) return;
    event.preventDefault();
    searchRef.current?.focus();
  });
  useHotkey('u', () => viewerIndex === null && pick());
  useHotkey('Escape', () => viewerIndex === null && selecting && clearSelection(), { enabled: selecting });
  useEffect(() => {
    if (!selecting) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && viewerIndex === null) {
        const el = event.target as HTMLElement;
        if (['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
        event.preventDefault();
        setSelected(new Set(files.map((f) => f.filename)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, files, viewerIndex]);

  const counts: TypeCounts = {
    all: stats.files,
    image: stats.images,
    video: stats.videos,
    audio: stats.audio,
    file: Math.max(0, stats.files - stats.images - stats.videos - stats.audio),
  };

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
            onChange={setQuery}
            placeholder="Dateien durchsuchen"
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
      accountSummary={`${plural(stats.files, 'Datei', 'Dateien')}, ${formatBytes(totalBytes(stats))} belegt`}
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
        {stats.files > 0 && (
          <Box sx={{ mt: 2.5 }}>
            <StorageMeter breakdown={stats.storageBreakdown} capacity={quotaBytes} />
          </Box>
        )}
      </Box>

      {(stats.files > 0 || filtered || files.length > 0) && (
        <FilterBar
          type={type}
          onType={setType}
          sort={sort}
          onSort={setSort}
          counts={counts}
          onUrl={boot.urlFetch ? () => setUrlOpen(true) : undefined}
          selecting={selecting}
          onSelectMode={() => (selecting ? clearSelection() : setSelectMode(true))}
        />
      )}

      {search && status !== 'reload' && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }} aria-live="polite">
          {total === 0 ? 'Keine Treffer' : `${plural(total, 'Treffer', 'Treffer')} für „${search}“`}
        </Typography>
      )}

      {showEmpty ? (
        <EmptyState
          filtered={filtered}
          query={search}
          onReset={() => {
            setQuery('');
            setType('');
          }}
          onPick={pick}
          onUrl={boot.urlFetch ? () => setUrlOpen(true) : undefined}
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

      <FileMenu
        file={menu?.file ?? null}
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        onPreview={(file) => openViewer(file)}
        onSelect={(file) => toggleSelect(file, false)}
        onDelete={(file) => deleteFiles([file])}
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
      />

      <UrlUploadDialog
        open={urlOpen}
        onClose={() => setUrlOpen(false)}
        onDone={() => {
          toast('Datei von der URL hochgeladen', { variant: 'success' });
          reload();
          refreshStats();
        }}
      />
    </AppShell>
  );
}

export function DashboardPage() {
  const boot = readBoot<DashboardBoot>();
  const handler = useRef<(names: string[]) => void>(() => {});
  const registerUploadHandler = useCallback((fn: (names: string[]) => void) => {
    handler.current = fn;
  }, []);
  return (
    <ConfirmProvider>
      <UploadProvider maxBytes={boot.maxUploadBytes} onUploaded={(names) => handler.current(names)}>
        <Dashboard boot={boot} registerUploadHandler={registerUploadHandler} />
      </UploadProvider>
    </ConfirmProvider>
  );
}
