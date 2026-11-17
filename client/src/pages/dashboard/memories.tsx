import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseRounded from '@mui/icons-material/CloseRounded';
import EventRepeatRounded from '@mui/icons-material/EventRepeatRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import type { FileItem, MemoryGroup } from '../../lib/types';
import { fetchMemories } from '../../lib/api';
import { locale, t, tn } from '../../lib/i18n';
import { withSavedKey } from '../../lib/sealedKeys';
import { fileIcon } from '../../components/FileIcons';
import { Viewer, type ViewerState } from './Viewer';
import { displayName, hasWarning } from './MediaTile';
import { c, radius } from '../../theme/tokens';

const HIDDEN_KEY = 'moeshare.memories.hidden';

const noop = () => {};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function hiddenToday() {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === todayKey();
  } catch {
    return false;
  }
}

function hideToday() {
  try {
    window.localStorage.setItem(HIDDEN_KEY, todayKey());
  } catch {}
}

const agoLabel = (years: number) => tn(years, 'Vor 1 Jahr', 'Vor {count} Jahren');

interface ThumbProps {
  file: FileItem;
  hidden: boolean;
  onOpen: (file: FileItem, el: HTMLElement | null) => void;
  register: (filename: string, el: HTMLElement | null) => void;
}

function MemoryThumb({ file, hidden, onOpen, register }: ThumbProps) {
  const [broken, setBroken] = useState(false);
  const visual = (file.type === 'image' || file.type === 'video') && !broken;
  const name = displayName(file);
  return (
    <Tooltip title={name}>
      <ButtonBase
        ref={(el: HTMLButtonElement | null) => register(file.filename, el)}
        onClick={(event) => onOpen(file, event.currentTarget)}
        aria-label={t('{name} ansehen', { name })}
        sx={{
          position: 'relative',
          width: { xs: 68, sm: 80 },
          height: { xs: 68, sm: 80 },
          flexShrink: 0,
          borderRadius: `${radius.tile}px`,
          overflow: 'hidden',
          bgcolor: c.surfaceContainerHighest,
          color: c.onSurfaceVariant,
          visibility: hidden ? 'hidden' : 'visible',
          '&:focus-visible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
        }}
      >
        {visual ? (
          <Box
            component="img"
            src={file.urls.preview}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setBroken(true)}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              ...(hasWarning(file) ? { filter: 'blur(10px)', transform: 'scale(1.2)' } : {}),
            }}
          />
        ) : (
          <Box sx={{ display: 'grid', placeItems: 'center', '& svg': { fontSize: 28 } }}>{fileIcon(file.filename, file.type)}</Box>
        )}
        {file.type === 'video' && visual && (
          <Box
            sx={{
              position: 'absolute',
              right: 4,
              bottom: 4,
              width: 20,
              height: 20,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgb(0 0 0 / 0.55)',
              color: '#fff',
            }}
          >
            <PlayArrowRounded sx={{ fontSize: 16 }} />
          </Box>
        )}
      </ButtonBase>
    </Tooltip>
  );
}

interface MemoriesCardProps {
  visible: boolean;
  statsEnabled?: boolean;
  onDelete: (file: FileItem) => Promise<boolean>;
  onStar?: (file: FileItem) => Promise<FileItem | null>;
}

export function MemoriesCard({ visible, statsEnabled = false, onDelete, onStar }: MemoriesCardProps) {
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [dismissed, setDismissed] = useState(hiddenToday);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  const frames = useRef(new Map<string, HTMLElement>());
  const files = useMemo(() => groups.flatMap((group) => group.files), [groups]);
  const day = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date()), []);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (dismissed) return undefined;
    let cancelled = false;
    fetchMemories()
      .then((result) => {
        if (!cancelled) setGroups(result.memories.map((group) => ({ ...group, files: group.files.map(withSavedKey) })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  useEffect(() => {
    if (!viewer) return;
    if (!files.length) {
      setViewer(null);
      setHidden(null);
    } else if (viewer.index >= files.length) {
      setViewer((current) => (current ? { ...current, index: files.length - 1 } : current));
    }
  }, [files.length, viewer]);

  const register = useCallback((filename: string, el: HTMLElement | null) => {
    if (el) frames.current.set(filename, el);
    else frames.current.delete(filename);
  }, []);

  const open = useCallback(
    (file: FileItem, el: HTMLElement | null) => {
      const index = files.findIndex((item) => item.id === file.id);
      if (index < 0) return;
      setHidden(file.filename);
      setViewer({ index, origin: el ? el.getBoundingClientRect() : null, openedWith: file.filename });
    },
    [files]
  );

  const remove = useCallback((file: FileItem) => {
    setGroups((list) =>
      list
        .map((group) => ({ ...group, files: group.files.filter((item) => item.id !== file.id) }))
        .filter((group) => group.files.length > 0)
    );
  }, []);

  const replace = useCallback((file: FileItem) => {
    const next = withSavedKey(file);
    setGroups((list) => list.map((group) => ({ ...group, files: group.files.map((item) => (item.id === next.id ? next : item)) })));
  }, []);

  const frameFor = useCallback((filename: string) => frames.current.get(filename) ?? null, []);
  const onIndexChange = useCallback((index: number) => setViewer((current) => (current ? { ...current, index } : current)), []);
  const onClosed = useCallback(() => setViewer(null), []);

  const show = visible && !dismissed && groups.length > 0;

  return (
    <>
      <Collapse in={show} unmountOnExit>
        <Box
          component="section"
          aria-labelledby="memories-title"
          sx={{
            mb: 2,
            p: { xs: 1.5, sm: 2 },
            borderRadius: `${radius.lg}px`,
            bgcolor: c.surfaceContainerLow,
            border: `1px solid ${c.outlineVariant}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                bgcolor: c.tertiaryContainer,
                color: c.onTertiaryContainer,
              }}
            >
              <EventRepeatRounded fontSize="small" />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography id="memories-title" variant="subtitle1" component="h2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {t('An diesem Tag')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {tn(files.length, 'Eine Datei vom {day} aus einem früheren Jahr', '{count} Dateien vom {day} aus früheren Jahren', { day })}
              </Typography>
            </Box>
            <Tooltip title={t('Für heute ausblenden')}>
              <IconButton
                aria-label={t('Für heute ausblenden')}
                onClick={() => {
                  hideToday();
                  setDismissed(true);
                }}
              >
                <CloseRounded />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', gap: 2.5, overflowX: 'auto', pb: 0.5, scrollbarWidth: 'thin' }}>
            {groups.map((group) => (
              <Box key={group.years} role="group" aria-label={agoLabel(group.years)} sx={{ flexShrink: 0 }}>
                <Typography variant="caption" component="p" sx={{ mb: 0.75, display: 'flex', gap: 0.75 }}>
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {agoLabel(group.years)}
                  </Box>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {year - group.years}
                  </Box>
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  {group.files.map((file) => (
                    <MemoryThumb key={file.id} file={file} hidden={hidden === file.filename} onOpen={open} register={register} />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Collapse>

      <Viewer
        files={files}
        state={viewer}
        frameFor={frameFor}
        onIndexChange={onIndexChange}
        onClosed={onClosed}
        onDelete={async (file) => {
          if (await onDelete(file)) remove(file);
        }}
        onHide={setHidden}
        hasMore={false}
        onNeedMore={noop}
        statsEnabled={statsEnabled}
        onStar={
          onStar
            ? async (file) => {
                const next = await onStar(file);
                if (next) replace(next);
              }
            : undefined
        }
      />
    </>
  );
}
