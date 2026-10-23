import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DriveFolderUploadOutlined from '@mui/icons-material/DriveFolderUploadOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import { ApiError, createAlbum } from '../../lib/api';
import type { Album, AlbumVisibility } from '../../lib/types';
import { formatBytes, formatNumber } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { pathOf, type DropContents } from '../../lib/folders';
import { commonFolder, extractEntry, listZip, type ZipEntry } from '../../lib/unzip';
import { GrowTransition } from '../../components/transitions';
import { useUploads } from './uploads';
import { c, radius } from '../../theme/tokens';

export type FolderSource = { kind: 'folders'; contents: DropContents } | { kind: 'zip'; file: File };

const ALBUM_LIMIT = 500;
const BATCH_FILES = 12;
const BATCH_BYTES = 48 * 1024 * 1024;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface Group {
  key: string;
  name: string;
  count: number;
  bytes: number;
}

function slices<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

const partTitle = (title: string, index: number, total: number) => (total > 1 ? `${title} (${index + 1})` : title);
const baseName = (name: string) => name.replace(/\.zip$/i, '').trim() || name;

function GroupRow({
  group,
  value,
  onChange,
  disabled,
}: {
  group: Group;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const parts = Math.ceil(group.count / ALBUM_LIMIT);
  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      <TextField
        label={t('Name des Albums')}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 110 } }}
        error={!value.trim()}
        helperText={
          parts > 1
            ? t('{count} Dateien, {size}. Wird auf {parts} Alben verteilt, weil ein Album höchstens {limit} Dateien fasst.', {
                count: formatNumber(group.count),
                size: formatBytes(group.bytes),
                parts,
                limit: ALBUM_LIMIT,
              })
            : tn(group.count, '1 Datei, {size}', '{count} Dateien, {size}', { size: formatBytes(group.bytes) })
        }
      />
    </Box>
  );
}

export function FolderImportDialog({
  source,
  onClose,
  onDone,
}: {
  source: FolderSource | null;
  onClose: () => void;
  onDone: (albums: Album[], failed: number) => void;
}) {
  const { enqueue } = useUploads();
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<AlbumVisibility>('link');
  const [zip, setZip] = useState<{ entries: ZipEntry[]; skipped: number } | null>(null);
  const [zipError, setZipError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const stop = useRef(false);

  useEffect(() => {
    if (!source) return;
    stop.current = false;
    setBusy(false);
    setProgress(null);
    setError('');
    setZip(null);
    setZipError('');
    setVisibility('link');
    if (source.kind === 'folders') {
      setTitles(Object.fromEntries(source.contents.folders.map((folder, index) => [`${index}`, folder.name.slice(0, 110)])));
      return;
    }
    setTitles({ zip: baseName(source.file.name).slice(0, 110) });
    let alive = true;
    listZip(source.file)
      .then((listing) => {
        if (!alive) return;
        setZip(listing);
        const folder = commonFolder(listing.entries);
        if (folder) setTitles({ zip: folder.slice(0, 110) });
      })
      .catch(() => alive && setZipError(t('Das Archiv lässt sich nicht lesen. Es ist beschädigt oder kein ZIP-Archiv.')));
    return () => {
      alive = false;
    };
  }, [source]);

  const groups = useMemo<Group[]>(() => {
    if (!source) return [];
    if (source.kind === 'folders') {
      return source.contents.folders.map((folder, index) => ({
        key: `${index}`,
        name: folder.name,
        count: folder.files.length,
        bytes: folder.files.reduce((sum, file) => sum + file.size, 0),
      }));
    }
    if (!zip) return [];
    return [
      { key: 'zip', name: source.file.name, count: zip.entries.length, bytes: zip.entries.reduce((sum, entry) => sum + entry.size, 0) },
    ];
  }, [source, zip]);

  const loose = source?.kind === 'folders' ? source.contents.loose : [];
  const valid = groups.length > 0 && groups.every((group) => (titles[group.key] || '').trim());

  const close = () => {
    stop.current = true;
    onClose();
  };

  const createAlbums = async (title: string, count: number) => {
    const total = Math.ceil(count / ALBUM_LIMIT);
    const created: Album[] = [];
    for (let index = 0; index < total; index++) {
      const { album } = await createAlbum({ title: partTitle(title, index, total), visibility });
      created.push(album);
    }
    return created;
  };

  const importFolders = async (contents: DropContents) => {
    const created: Album[] = [];
    for (const [index, folder] of contents.folders.entries()) {
      const files = [...folder.files].sort((a, b) => collator.compare(pathOf(a), pathOf(b)));
      const albums = await createAlbums(titles[`${index}`].trim(), files.length);
      slices(files, ALBUM_LIMIT).forEach((part, slot) => enqueue(part, { album: albums[slot].id }));
      created.push(...albums);
    }
    if (contents.loose.length) enqueue(contents.loose);
    return { created, failed: 0 };
  };

  const importZip = async (file: File, entries: ZipEntry[]) => {
    const sorted = [...entries].sort((a, b) => collator.compare(a.path, b.path));
    const albums = await createAlbums(titles.zip.trim(), sorted.length);
    let done = 0;
    let failed = 0;
    setProgress({ done, total: sorted.length });
    for (const [slot, part] of slices(sorted, ALBUM_LIMIT).entries()) {
      let batch: File[] = [];
      let bytes = 0;
      const flush = () => {
        if (batch.length) enqueue(batch, { album: albums[slot].id });
        batch = [];
        bytes = 0;
      };
      for (const entry of part) {
        if (stop.current) break;
        try {
          const extracted = await extractEntry(file, entry);
          batch.push(extracted);
          bytes += extracted.size;
        } catch {
          failed += 1;
        }
        done += 1;
        setProgress({ done, total: sorted.length });
        if (batch.length >= BATCH_FILES || bytes >= BATCH_BYTES) flush();
      }
      flush();
    }
    return { created: albums, failed };
  };

  const start = async () => {
    if (!source || !valid) return;
    setBusy(true);
    setError('');
    try {
      const result = source.kind === 'folders' ? await importFolders(source.contents) : await importZip(source.file, zip!.entries);
      onDone(result.created, result.failed);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Das Album konnte nicht angelegt werden.'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const plain = () => {
    if (!source) return;
    if (source.kind === 'zip') enqueue([source.file]);
    else enqueue([...source.contents.loose, ...source.contents.folders.flatMap((folder) => folder.files)]);
    onClose();
  };

  const isZip = source?.kind === 'zip';
  const folderCount = source?.kind === 'folders' ? source.contents.folders.length : 0;
  const albumCount = groups.reduce((sum, group) => sum + Math.max(1, Math.ceil(group.count / ALBUM_LIMIT)), 0);
  const loading = isZip && !zip && !zipError;

  return (
    <Dialog
      open={!!source}
      onClose={busy ? undefined : close}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="folder-import-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        {isZip ? <FolderZipOutlined sx={{ fontSize: 28 }} /> : <DriveFolderUploadOutlined sx={{ fontSize: 28 }} />}
      </Box>
      <DialogTitle id="folder-import-title" sx={{ textAlign: 'center' }}>
        {isZip
          ? t('ZIP-Archiv als Album hochladen?')
          : tn(folderCount, 'Ordner als Album hochladen?', '{count} Ordner als Alben hochladen?')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2.5 }}>
          {isZip
            ? t('MoeShare entpackt das Archiv in deinem Browser und legt die Dateien in ein neues Album.')
            : tn(
                folderCount,
                'Die Dateien aus dem Ordner landen in einem neuen Album. Unterordner werden mit aufgenommen.',
                'Jeder Ordner wird ein eigenes Album. Unterordner werden mit aufgenommen.'
              )}
        </Typography>

        {loading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
            <CircularProgress size={28} aria-label={t('Archiv wird gelesen')} />
          </Box>
        )}

        {zipError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {zipError}
          </Alert>
        )}

        {isZip && zip && zip.entries.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('Im Archiv liegen keine Dateien, die sich entpacken lassen.')}
          </Alert>
        )}

        {groups.length > 0 && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                maxHeight: 320,
                overflowY: 'auto',
                pt: 1,
                mx: -0.5,
                px: 0.5,
              }}
            >
              {groups.map((group) => (
                <Box key={group.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      mt: 0.5,
                      flexShrink: 0,
                      borderRadius: `${radius.sm}px`,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: c.secondaryContainer,
                      color: c.onSecondaryContainer,
                    }}
                  >
                    {isZip ? <FolderZipOutlined fontSize="small" /> : <FolderOutlined fontSize="small" />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <GroupRow
                      group={group}
                      value={titles[group.key] || ''}
                      disabled={busy}
                      onChange={(value) => setTitles((current) => ({ ...current, [group.key]: value }))}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
            <TextField
              select
              label={t('Sichtbarkeit')}
              value={visibility}
              disabled={busy}
              onChange={(event) => setVisibility(event.target.value as AlbumVisibility)}
              helperText={
                visibility === 'private'
                  ? t('Nur du siehst das Album.')
                  : visibility === 'public'
                    ? t('Wie „Mit Link teilen“ und zusätzlich auf deiner Profilseite zu sehen.')
                    : t('Alle, die den Link kennen, sehen das Album.')
              }
            >
              <MenuItem value="link">{t('Mit Link teilen')}</MenuItem>
              <MenuItem value="public">{t('Öffentlich')}</MenuItem>
              <MenuItem value="private">{t('Privat')}</MenuItem>
            </TextField>
            {loose.length > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {tn(
                  loose.length,
                  'Dazu kommt 1 einzelne Datei, die ohne Album hochgeladen wird.',
                  'Dazu kommen {count} einzelne Dateien, die ohne Album hochgeladen werden.'
                )}
              </Typography>
            )}
            {isZip && zip && zip.skipped > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {tn(
                  zip.skipped,
                  '1 Eintrag wird übersprungen, weil er versteckt, leer, verschlüsselt oder ungewöhnlich gepackt ist.',
                  '{count} Einträge werden übersprungen, weil sie versteckt, leer, verschlüsselt oder ungewöhnlich gepackt sind.'
                )}
              </Typography>
            )}
          </Box>
        )}

        {progress && (
          <Box sx={{ mt: 2.5 }} aria-live="polite">
            <LinearProgress variant="determinate" value={(progress.done / Math.max(1, progress.total)) * 100} />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
              {t('Entpackt: {done} von {total}', { done: formatNumber(progress.done), total: formatNumber(progress.total) })}
            </Typography>
          </Box>
        )}

        {error && (
          <Typography variant="body2" sx={{ color: c.error, mt: 2 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={close}>{busy && progress ? t('Entpacken stoppen') : t('Abbrechen')}</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={plain} disabled={busy}>
          {isZip ? t('Als ZIP-Datei hochladen') : t('Ohne Album hochladen')}
        </Button>
        <Button
          variant="contained"
          onClick={start}
          disabled={busy || !valid}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isZip ? t('Entpacken und hochladen') : tn(albumCount, 'Album anlegen und hochladen', '{count} Alben anlegen und hochladen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
