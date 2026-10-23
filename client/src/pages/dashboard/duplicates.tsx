import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import FileCopyOutlined from '@mui/icons-material/FileCopyOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { ApiError, fetchDuplicates } from '../../lib/api';
import type { DuplicateReport, FileItem } from '../../lib/types';
import { formatBytes, relativeFromServer } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { fileIcon } from '../../components/FileIcons';
import { GrowTransition } from '../../components/transitions';
import { displayName, hasWarning } from './MediaTile';
import { c, radius } from '../../theme/tokens';

function Preview({ file }: { file: FileItem }) {
  const [failed, setFailed] = useState(false);
  const visual = (file.type === 'image' || file.type === 'video') && !failed && !hasWarning(file);
  return (
    <Box
      sx={{
        width: 48,
        height: 48,
        flexShrink: 0,
        borderRadius: `${radius.sm}px`,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        bgcolor: c.surfaceContainerHighest,
        color: c.onSurfaceVariant,
        '& svg': { fontSize: 22 },
      }}
    >
      {visual ? (
        <Box
          component="img"
          src={file.urls.preview}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        fileIcon(file.filename, file.type)
      )}
    </Box>
  );
}

const oldestOf = (files: FileItem[]) => files.reduce((oldest, file) => (file.id < oldest.id ? file : oldest), files[0]);

export function DuplicatesDialog({
  open,
  onClose,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  onDelete: (files: FileItem[]) => Promise<boolean>;
}) {
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    fetchDuplicates()
      .then((next) => {
        setReport(next);
        setSelected(new Set());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('Die Duplikate konnten nicht geladen werden.')));
  }, []);

  useEffect(() => {
    if (!open) return;
    setReport(null);
    load();
  }, [open, load]);

  const byId = useMemo(
    () => new Map((report?.groups || []).flatMap((group) => group.files.map((file) => [file.id, file] as const))),
    [report]
  );

  const keepOldest = () => {
    if (!report) return;
    const next = new Set<number>();
    for (const group of report.groups) {
      const oldest = oldestOf(group.files);
      group.files.forEach((file) => file.id !== oldest.id && next.add(file.id));
    }
    setSelected(next);
  };

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async () => {
    const list = [...selected].map((id) => byId.get(id)).filter((file): file is FileItem => !!file);
    if (!list.length) return;
    setBusy(true);
    try {
      if (await onDelete(list)) load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="duplicates-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <FileCopyOutlined sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="duplicates-title" sx={{ textAlign: 'center' }}>
        {t('Doppelte Dateien')}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Typography variant="body2" sx={{ color: c.error, textAlign: 'center' }}>
            {error}
          </Typography>
        ) : !report ? (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Skeleton variant="text" width="80%" sx={{ mx: 'auto' }} />
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={64} />
            ))}
          </Box>
        ) : report.groups.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
            {t('Keine doppelten Dateien. Neue Uploads werden beim Hochladen geprüft.')}
          </Typography>
        ) : (
          <>
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2 }}>
              {tn(report.files, 'Eine Datei hast du mehrfach hochgeladen.', '{count} Dateien hast du mehrfach hochgeladen.')}{' '}
              {report.redundantBytes > report.savedBytes
                ? t('Löschen würde {size} freigeben.', { size: formatBytes(report.redundantBytes - report.savedBytes) })
                : t('Die Kopien belegen keinen zusätzlichen Platz, weil gleiche Dateien nur einmal gespeichert werden.')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mb: 2 }}>
              <Button variant="tonal" onClick={keepOldest} disabled={busy}>
                {t('Nur die älteste behalten')}
              </Button>
              {selected.size > 0 && (
                <Button onClick={() => setSelected(new Set())} disabled={busy}>
                  {t('Auswahl aufheben')}
                </Button>
              )}
            </Box>
            <Box sx={{ display: 'grid', gap: 2 }}>
              {report.groups.map((group) => {
                const oldest = oldestOf(group.files);
                return (
                  <Box key={group.sha256} sx={{ borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainer, p: 1 }}>
                    <Typography variant="caption" component="p" sx={{ color: 'text.secondary', px: 1, pt: 0.5, pb: 1 }}>
                      {tn(group.files.length, '1-mal vorhanden, je {size}', '{count}-mal vorhanden, je {size}', {
                        size: formatBytes(group.sizeBytes),
                      })}
                    </Typography>
                    {group.files.map((file) => {
                      const checked = selected.has(file.id);
                      return (
                        <Box
                          key={file.id}
                          component="label"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            pr: 1,
                            py: 0.5,
                            borderRadius: `${radius.sm}px`,
                            cursor: 'pointer',
                            bgcolor: checked ? c.errorContainer : 'transparent',
                            color: checked ? c.onErrorContainer : 'inherit',
                            transition: 'background-color 160ms',
                          }}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={() => toggle(file.id)}
                            disabled={busy}
                            slotProps={{ input: { 'aria-label': t('{name} löschen', { name: displayName(file) }) } }}
                          />
                          <Preview file={file} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }} title={displayName(file)}>
                              {displayName(file)}
                            </Typography>
                            <Typography variant="caption" component="p" noWrap sx={{ opacity: 0.8 }}>
                              {t('hochgeladen {when}', { when: relativeFromServer(file.date) })},{' '}
                              {tn(file.views, '1 Aufruf', '{count} Aufrufe')}
                            </Typography>
                          </Box>
                          {file.id === oldest.id && <Chip size="small" label={t('Älteste')} sx={{ height: 22, fontSize: '0.6875rem' }} />}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Schließen')}
        </Button>
        {report && report.groups.length > 0 && (
          <Button
            variant="contained"
            color="error"
            onClick={remove}
            disabled={busy || selected.size === 0}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineRounded />}
          >
            {selected.size ? tn(selected.size, '1 Datei löschen', '{count} Dateien löschen') : t('Löschen')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
