import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import {
  ApiError,
  deleteVersion,
  fetchVersions,
  restoreVersion,
  uploadResumable,
  uploadVersion,
  type VersionUploadResponse,
} from '../../lib/api';
import type { FileItem, FileVersion, UploadOptionsInfo } from '../../lib/types';
import { formatBytes, formatNumber, relativeMs } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { fileIcon } from '../../components/FileIcons';
import { GrowTransition } from '../../components/transitions';
import { displayName } from './MediaTile';
import { c, radius } from '../../theme/tokens';

interface VersionData {
  file: FileItem;
  versions: FileVersion[];
  enabled: boolean;
  keep: number;
}

const NOTE_LABELS: Record<string, () => string> = {
  original: () => t('Original'),
  edited: () => t('Bearbeitet'),
  trimmed: () => t('Gekürzt'),
};

function Thumb({ src, name, type }: { src: string | null; name: string; type: FileVersion['type'] }) {
  const [failed, setFailed] = useState(false);
  return (
    <Box
      sx={{
        width: 56,
        height: 56,
        flexShrink: 0,
        borderRadius: `${radius.sm}px`,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        bgcolor: c.surfaceContainerHighest,
        color: c.onSurfaceVariant,
        '& svg': { fontSize: 24 },
      }}
    >
      {src && !failed ? (
        <Box
          component="img"
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        fileIcon(name, type)
      )}
    </Box>
  );
}

function details(size: number, width: number, height: number) {
  return [formatBytes(size), width && height ? `${formatNumber(width)} × ${formatNumber(height)}` : ''].filter(Boolean).join(', ');
}

export function VersionsDialog({
  file,
  info,
  onClose,
  onChanged,
}: {
  file: FileItem | null;
  info: UploadOptionsInfo;
  onClose: () => void;
  onChanged: (file: FileItem) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<VersionData | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [upload, setUpload] = useState<{ name: string; progress: number; abort: () => void } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const fileId = file?.id ?? null;

  const load = useCallback(() => {
    if (!fileId) return;
    fetchVersions(fileId)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('Die Versionen konnten nicht geladen werden.')));
  }, [fileId]);

  useEffect(() => {
    setData(null);
    setError('');
    setUpload(null);
    setDragging(false);
    load();
  }, [load]);

  const apply = (next: { file: FileItem; versions: FileVersion[] }) => {
    setData((current) => (current ? { ...current, file: next.file, versions: next.versions } : current));
    onChanged(next.file);
  };

  const send = (picked: File) => {
    if (!fileId || upload) return;
    setError('');
    const onProgress = (progress: number) => setUpload((current) => (current ? { ...current, progress } : current));
    const resumable = info.chunked && picked.size > info.chunkSize;
    const handle = resumable ? uploadResumable(picked, onProgress, {}, { fileId }) : uploadVersion(fileId, picked, onProgress);
    setUpload({ name: picked.name, progress: 0, abort: handle.abort });
    (handle.promise as Promise<VersionUploadResponse>)
      .then((result) => {
        onChanged(result.file);
        toast(data?.enabled === false ? t('Datei ersetzt') : t('Neue Fassung gespeichert'), { variant: 'success' });
        load();
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.code === 'aborted') return;
        setError(err instanceof ApiError ? err.message : t('Upload fehlgeschlagen.'));
      })
      .finally(() => setUpload(null));
  };

  const restore = async (version: FileVersion) => {
    if (!fileId) return;
    setBusy(version.id);
    try {
      apply(await restoreVersion(fileId, version.id));
      toast(t('Version {version} ist wieder aktuell', { version: version.version }), { variant: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (version: FileVersion) => {
    if (!fileId) return;
    const ok = await confirm({
      title: t('Version {version} löschen?', { version: version.version }),
      message: t('Diese Fassung wird endgültig gelöscht. Die aktuelle Datei bleibt, wie sie ist.'),
      confirmLabel: t('Löschen'),
    });
    if (!ok) return;
    setBusy(version.id);
    try {
      apply(await deleteVersion(fileId, version.id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const dragProps = {
    onDragEnter: (event: ReactDragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (Array.from(event.dataTransfer.types).includes('Files')) setDragging(true);
    },
    onDragOver: (event: ReactDragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onDragLeave: (event: ReactDragEvent) => {
      event.stopPropagation();
      if (event.currentTarget === event.target) setDragging(false);
    },
    onDrop: (event: ReactDragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const picked = event.dataTransfer.files?.[0];
      if (picked) send(picked);
    },
  };

  const current = data?.file ?? file;
  const enabled = data ? data.enabled : info.versions;
  const keep = data ? data.keep : info.versionsKeep;
  const closeDialog = () => {
    upload?.abort();
    onClose();
  };

  return (
    <Dialog
      open={!!file}
      onClose={upload ? undefined : closeDialog}
      maxWidth="sm"
      fullWidth
      sx={{ zIndex: 1450 }}
      slots={{ transition: GrowTransition }}
      aria-labelledby="versions-title"
      {...dragProps}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <HistoryRounded sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="versions-title" sx={{ textAlign: 'center', pb: 0.5 }}>
        {t('Versionen')}
      </DialogTitle>
      {current && (
        <Typography variant="body2" noWrap sx={{ textAlign: 'center', color: 'text.secondary', px: 3 }} title={displayName(current)}>
          {displayName(current)}
        </Typography>
      )}
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mt: 1, mb: 2.5 }}>
          {enabled
            ? tn(
                keep,
                'Eine neue Fassung ersetzt die Datei, alle Links bleiben gleich. Die letzte alte Fassung wird aufbewahrt.',
                'Eine neue Fassung ersetzt die Datei, alle Links bleiben gleich. Die letzten {count} alten Fassungen werden aufbewahrt.'
              )
            : t('Eine neue Fassung ersetzt die Datei, alle Links bleiben gleich. Alte Fassungen hebt dieser Server nicht auf.')}
        </Typography>

        <Box
          sx={{
            position: 'relative',
            borderRadius: `${radius.md}px`,
            border: `2px dashed ${dragging ? c.primary : c.outlineVariant}`,
            bgcolor: dragging ? c.primaryContainer : 'transparent',
            color: dragging ? c.onPrimaryContainer : 'inherit',
            px: 2,
            py: 2,
            transition: 'background-color 160ms, border-color 160ms',
          }}
        >
          {upload ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {upload.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                  <LinearProgress variant="determinate" value={upload.progress * 100} sx={{ flex: 1, height: 4 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 36, textAlign: 'right' }}>
                    {Math.round(upload.progress * 100)} %
                  </Typography>
                </Box>
              </Box>
              <Tooltip title={t('Abbrechen')}>
                <IconButton size="small" onClick={upload.abort} aria-label={t('Upload abbrechen')}>
                  <CloseRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <CloudUploadRounded sx={{ color: dragging ? 'inherit' : c.primary }} />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>
                {dragging ? t('Loslassen, um die neue Fassung hochzuladen') : t('Zieh die neue Fassung hierher oder wähle sie aus.')}
              </Typography>
              <Button variant="tonal" onClick={() => input.current?.click()} disabled={!data}>
                {enabled ? t('Neue Fassung hochladen') : t('Datei ersetzen')}
              </Button>
            </Box>
          )}
          <input
            ref={input}
            type="file"
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) send(picked);
              event.target.value = '';
            }}
          />
        </Box>

        {error && (
          <Typography variant="body2" sx={{ color: c.error, mt: 1.5 }}>
            {error}
          </Typography>
        )}

        {current && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('Aktuell')}
            </Typography>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: `${radius.md}px`, bgcolor: c.secondaryContainer }}
            >
              <Thumb
                src={current.type === 'image' || current.type === 'video' ? current.urls.preview : null}
                name={current.filename}
                type={current.type}
              />
              <Box sx={{ flex: 1, minWidth: 0, color: c.onSecondaryContainer }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {t('Version {version}', { version: current.version || 1 })}
                </Typography>
                <Typography variant="caption" component="p" noWrap>
                  {details(current.sizeBytes, current.width, current.height)}
                  {current.versionAt ? `, ${t('hochgeladen {when}', { when: relativeMs(current.versionAt) })}` : ''}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('Ältere Fassungen')}
          </Typography>
          {!data ? (
            <Box sx={{ display: 'grid', gap: 1 }}>
              {[0, 1].map((index) => (
                <Skeleton key={index} variant="rounded" height={72} />
              ))}
            </Box>
          ) : data.versions.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
              {enabled ? t('Noch keine. Sobald du eine neue Fassung hochlädst, erscheint die bisherige hier.') : t('Keine.')}
            </Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
              {data.versions.map((version) => (
                <Box
                  component="li"
                  key={version.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1,
                    borderRadius: `${radius.md}px`,
                    '&:hover': { bgcolor: c.surfaceContainerHigh },
                  }}
                >
                  <Thumb src={version.type === 'image' ? version.content : null} name={version.name} type={version.type} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {t('Version {version}', { version: version.version })}
                      </Typography>
                      {version.note && NOTE_LABELS[version.note] && (
                        <Chip size="small" label={NOTE_LABELS[version.note]()} sx={{ height: 22, fontSize: '0.6875rem' }} />
                      )}
                    </Box>
                    <Typography variant="caption" component="p" noWrap sx={{ color: 'text.secondary' }} title={version.name}>
                      {details(version.sizeBytes, version.width, version.height)},{' '}
                      {t('ersetzt {when}', { when: relativeMs(version.replacedAt) })}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>
                    <Tooltip title={t('Ansehen')}>
                      <IconButton
                        size="small"
                        component="a"
                        href={version.content}
                        target="_blank"
                        rel="noopener"
                        aria-label={t('Version {version} ansehen', { version: version.version })}
                      >
                        <OpenInNewRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('Herunterladen')}>
                      <IconButton
                        size="small"
                        component="a"
                        href={`${version.content}?download=1`}
                        aria-label={t('Version {version} herunterladen', { version: version.version })}
                      >
                        <DownloadRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('Wiederherstellen')}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => restore(version)}
                          disabled={busy !== null || !!upload}
                          aria-label={t('Version {version} wiederherstellen', { version: version.version })}
                        >
                          {busy === version.id ? <CircularProgress size={18} /> : <RestoreRounded fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('Löschen')}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => remove(version)}
                          disabled={busy !== null || !!upload}
                          aria-label={t('Version {version} löschen', { version: version.version })}
                          sx={{ color: c.error }}
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>{upload ? t('Abbrechen und schließen') : t('Schließen')}</Button>
      </DialogActions>
    </Dialog>
  );
}
