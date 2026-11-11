import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import FolderZipRounded from '@mui/icons-material/FolderZipRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import type { FileType } from '../../lib/types';
import { fileIcon } from '../../components/FileIcons';
import { useDesign } from '../../lib/design';
import { formatBytes, formatDateTime, formatNumber } from '../../lib/format';
import { mix } from '../../lib/color';
import { t, tn } from '../../lib/i18n';
import { c, elevation, radius } from '../../theme/tokens';

interface ZipEntry {
  index: number;
  name: string;
  directory: boolean;
  size: number;
  packed: number;
  modified: number | null;
  encrypted: boolean;
  supported: boolean;
}

interface Listing {
  entries: ZipEntry[];
  total: number;
  truncated: boolean;
  comment: string;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  entry: ZipEntry | null;
  size: number;
  files: number;
}

interface Row {
  node: TreeNode;
  depth: number;
}

const PAGE = 800;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|mkv|avi)$/i;
const AUDIO = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus)$/i;

const typeOf = (name: string): FileType => (IMAGE.test(name) ? 'image' : VIDEO.test(name) ? 'video' : AUDIO.test(name) ? 'audio' : 'file');
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function buildTree(entries: ZipEntry[]) {
  const root: TreeNode = { name: '', path: '', children: new Map(), entry: null, size: 0, files: 0 };
  for (const entry of entries) {
    const parts = entry.name.split('/').filter((part) => part && part !== '.');
    let node = root;
    parts.forEach((part, index) => {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: parts.slice(0, index + 1).join('/'), children: new Map(), entry: null, size: 0, files: 0 };
        node.children.set(part, child);
      }
      if (index === parts.length - 1 && !entry.directory) child.entry = entry;
      node = child;
    });
  }
  const total = (node: TreeNode): void => {
    for (const child of node.children.values()) total(child);
    if (node.entry) {
      node.size = node.entry.size;
      node.files = 1;
    }
    for (const child of node.children.values()) {
      node.size += child.size;
      node.files += child.files;
    }
  };
  total(root);
  return root;
}

const isFolder = (node: TreeNode) => !node.entry || node.children.size > 0;

function sorted(node: TreeNode) {
  return [...node.children.values()].sort((a, b) => {
    const folder = Number(isFolder(b)) - Number(isFolder(a));
    return folder || collator.compare(a.name, b.name);
  });
}

function folderPaths(node: TreeNode, into: string[] = []) {
  for (const child of node.children.values()) {
    if (isFolder(child)) {
      into.push(child.path);
      folderPaths(child, into);
    }
  }
  return into;
}

function visibleRows(root: TreeNode, open: Set<string>) {
  const rows: Row[] = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const child of sorted(node)) {
      rows.push({ node: child, depth });
      if (isFolder(child) && open.has(child.path)) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

function initialOpen(root: TreeNode, count: number) {
  if (count <= 40) return new Set(folderPaths(root));
  const open = new Set<string>();
  let node = root;
  while (node.children.size === 1) {
    const [only] = node.children.values();
    if (!isFolder(only)) break;
    open.add(only.path);
    node = only;
  }
  return open;
}

export function ZipStage({ listUrl, size }: { listUrl: string; size: number }) {
  const { r } = useDesign();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    fetch(listUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.error) || t('Das Archiv ließ sich nicht lesen.'));
        return data as Listing;
      })
      .then((data) => {
        if (!alive) return;
        setListing(data);
        setOpen(initialOpen(buildTree(data.entries), data.entries.length));
      })
      .catch((failure: Error) => alive && setError(failure.message));
    return () => {
      alive = false;
    };
  }, [listUrl]);

  const root = useMemo(() => (listing ? buildTree(listing.entries) : null), [listing]);
  const rows = useMemo(() => (root ? visibleRows(root, open) : []), [root, open]);
  const folders = useMemo(() => (root ? folderPaths(root) : []), [root]);
  const packed = listing ? listing.entries.reduce((sum, entry) => sum + (entry.packed || 0), 0) : 0;
  const allOpen = folders.length > 0 && folders.every((path) => open.has(path));

  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <Box
      sx={{
        width: 'min(1000px, 100%)',
        mx: 'auto',
        borderRadius: `${r(radius.xl)}px`,
        bgcolor: mix(c.surfaceContainerLow, 94),
        backdropFilter: 'blur(20px)',
        boxShadow: elevation[3],
        overflow: 'hidden',
        textAlign: 'left',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.25,
          borderBottom: `1px solid ${c.outlineVariant}`,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', color: c.primary, '& svg': { fontSize: 22 } }} aria-hidden>
          <FolderZipRounded />
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {t('ZIP-Archiv')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {root
            ? t('{files} · {size} entpackt · {packed} gepackt', {
                files: tn(root.files, 'Eine Datei', '{count} Dateien'),
                size: formatBytes(root.size),
                packed: formatBytes(packed || size),
              })
            : formatBytes(size)}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {folders.length > 0 && (
          <Button
            size="small"
            startIcon={allOpen ? <UnfoldLessRounded /> : <UnfoldMoreRounded />}
            onClick={() => setOpen(allOpen ? new Set() : new Set(folders))}
          >
            {allOpen ? t('Alle zuklappen') : t('Alle aufklappen')}
          </Button>
        )}
      </Box>
      {error ? (
        <Box sx={{ px: 3, py: 6, textAlign: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t('Der Inhalt lässt sich nicht anzeigen')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {error}
          </Typography>
        </Box>
      ) : !listing ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Box
          role="tree"
          aria-label={t('Inhalt des Archivs')}
          sx={{ maxHeight: { xs: '70vh', md: 'min(76vh, calc(100dvh - 260px))' }, overflow: 'auto', py: 0.5 }}
        >
          {rows.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, py: 4, textAlign: 'center' }}>
              {t('Das Archiv ist leer.')}
            </Typography>
          )}
          {rows.slice(0, limit).map(({ node, depth }) => {
            const folder = isFolder(node);
            const expanded = folder && open.has(node.path);
            const entry = node.entry;
            const blocked = !folder && entry !== null && !entry.supported;
            const content = (
              <>
                <Box sx={{ width: 20, display: 'flex', color: c.onSurfaceVariant, flexShrink: 0 }} aria-hidden>
                  {folder && (
                    <ChevronRightRounded
                      sx={{ fontSize: 20, transition: 'transform 160ms', transform: expanded ? 'rotate(90deg)' : 'none' }}
                    />
                  )}
                </Box>
                <Box
                  aria-hidden
                  sx={{ display: 'flex', color: folder ? c.primary : c.onSurfaceVariant, flexShrink: 0, '& svg': { fontSize: 20 } }}
                >
                  {folder ? expanded ? <FolderOpenRounded /> : <FolderRounded /> : fileIcon(node.name, typeOf(node.name))}
                </Box>
                <Typography
                  variant="body2"
                  sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {node.name}
                </Typography>
                {folder ? (
                  <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                    {tn(node.files, 'Eine Datei', '{count} Dateien')}
                  </Typography>
                ) : (
                  entry?.modified && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
                      {formatDateTime(new Date(entry.modified))}
                    </Typography>
                  )
                )}
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', flexShrink: 0, width: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatBytes(node.size)}
                </Typography>
                <Box sx={{ width: 24, display: 'flex', justifyContent: 'center', flexShrink: 0, color: c.onSurfaceVariant }} aria-hidden>
                  {blocked ? (
                    <LockOutlined sx={{ fontSize: 18 }} />
                  ) : !folder ? (
                    <DownloadRounded className="ms-zip-download" sx={{ fontSize: 18, opacity: 0 }} />
                  ) : null}
                </Box>
              </>
            );
            const rowSx = {
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              minHeight: 40,
              pl: `${12 + depth * 20}px`,
              pr: 1.5,
              textAlign: 'left',
              justifyContent: 'flex-start',
              borderRadius: 0,
              '&:hover, &:focus-visible': { bgcolor: mix(c.primary, 8) },
              '&:hover .ms-zip-download, &:focus-visible .ms-zip-download': { opacity: 1 },
            };
            if (folder) {
              return (
                <ButtonBase
                  key={node.path}
                  role="treeitem"
                  aria-expanded={expanded}
                  aria-level={depth + 1}
                  onClick={() => toggle(node.path)}
                  sx={rowSx}
                >
                  {content}
                </ButtonBase>
              );
            }
            if (blocked || !entry) {
              return (
                <Tooltip
                  key={node.path}
                  title={
                    entry?.encrypted
                      ? t('Verschlüsselt. Lade das ganze Archiv herunter, um die Datei zu entpacken.')
                      : t('Lässt sich hier nicht einzeln entpacken. Lade das ganze Archiv herunter.')
                  }
                  placement="top-start"
                >
                  <Box role="treeitem" aria-level={depth + 1} aria-disabled sx={{ ...rowSx, opacity: 0.6, '&:hover': {} }}>
                    {content}
                  </Box>
                </Tooltip>
              );
            }
            return (
              <ButtonBase
                key={node.path}
                role="treeitem"
                aria-level={depth + 1}
                component="a"
                href={`${listUrl}/${entry.index}`}
                download={node.name}
                title={t('{name} herunterladen', { name: node.name })}
                sx={rowSx}
              >
                {content}
              </ButtonBase>
            );
          })}
          {rows.length > limit && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
              <Button onClick={() => setLimit((current) => current + PAGE)}>
                {t('{count} weitere zeigen', { count: formatNumber(Math.min(PAGE, rows.length - limit)) })}
              </Button>
            </Box>
          )}
          {listing.truncated && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', px: 2, py: 1.5, textAlign: 'center' }}>
              {t('Das Archiv enthält {total} Einträge, die Vorschau zeigt die ersten {shown}.', {
                total: formatNumber(listing.total),
                shown: formatNumber(listing.entries.length),
              })}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
