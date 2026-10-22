import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteForeverRounded from '@mui/icons-material/DeleteForeverRounded';
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded';
import RestoreFromTrashRounded from '@mui/icons-material/RestoreFromTrashRounded';
import AutoDeleteOutlined from '@mui/icons-material/AutoDeleteOutlined';
import type { FileItem, TrashSummary } from '../../lib/types';
import { emptyTrash, errorMessage, listTrash, purgeFile, restoreFile } from '../../lib/api';
import { formatBytes, formatDateTime, relativeMs } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { FileThumb } from '../../components/FileThumb';
import { displayName } from './MediaTile';
import { c, ease, radius } from '../../theme/tokens';

function PurgeHint({ at }: { at: number }) {
  const days = Math.ceil((at - Date.now()) / 86400000);
  return (
    <Typography variant="caption" component="p" sx={{ color: days <= 3 ? c.error : 'text.secondary' }} title={formatDateTime(new Date(at))}>
      {days <= 0 ? t('Wird gleich endgültig gelöscht') : tn(days, 'Noch 1 Tag im Papierkorb', 'Noch {count} Tage im Papierkorb')}
    </Typography>
  );
}

export function TrashView({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [summary, setSummary] = useState<TrashSummary | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState<number | 'all' | 'more' | null>(null);

  const load = useCallback(
    async (next = 1) => {
      try {
        const result = await listTrash(next);
        setFiles((current) => (next === 1 || !current ? result.files : [...current, ...result.files]));
        setSummary(result.summary);
        setPage(result.page);
        setHasNext(result.hasNext);
      } catch (failure) {
        toast(errorMessage(failure), { variant: 'error' });
      }
    },
    [toast]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const drop = (id: number) => setFiles((current) => (current ? current.filter((file) => file.id !== id) : current));

  const restore = async (file: FileItem) => {
    setBusy(file.id);
    try {
      await restoreFile(file.id);
      drop(file.id);
      setSummary((current) => (current ? { ...current, files: current.files - 1, bytes: current.bytes - file.sizeBytes } : current));
      toast(t('„{name}“ ist wiederhergestellt', { name: displayName(file) }), { variant: 'success' });
      onChanged();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const purge = async (file: FileItem) => {
    const ok = await confirm({
      title: t('Endgültig löschen?'),
      message: t('„{name}“ wird sofort gelöscht und lässt sich nicht wiederherstellen.', { name: displayName(file) }),
      confirmLabel: t('Endgültig löschen'),
    });
    if (!ok) return;
    setBusy(file.id);
    try {
      const result = await purgeFile(file.id);
      drop(file.id);
      setSummary(result.summary);
      onChanged();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const empty = async () => {
    if (!summary) return;
    const ok = await confirm({
      title: t('Papierkorb leeren?'),
      message: tn(
        summary.files,
        'Die Datei im Papierkorb wird endgültig gelöscht.',
        'Alle {count} Dateien im Papierkorb werden endgültig gelöscht.'
      ),
      confirmLabel: t('Leeren'),
      icon: <DeleteSweepRounded />,
    });
    if (!ok) return;
    setBusy('all');
    try {
      const result = await emptyTrash();
      setFiles([]);
      setSummary(result.summary);
      setHasNext(false);
      toast(tn(result.count, '1 Datei endgültig gelöscht', '{count} Dateien endgültig gelöscht'), { variant: 'success' });
      onChanged();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (!files || !summary) {
    return (
      <Box sx={{ display: 'grid', gap: 1 }}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} variant="rounded" height={76} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 980 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          p: { xs: 2, sm: 2.5 },
          mb: 2.5,
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerLow,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, flex: 1, minWidth: 0 }}>
          <AutoDeleteOutlined sx={{ color: c.onSurfaceVariant, mt: 0.25 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {summary.files
                ? tn(summary.files, '1 Datei, {size}', '{count} Dateien, {size}', { size: formatBytes(summary.bytes) })
                : t('Der Papierkorb ist leer')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {tn(
                summary.days,
                'Gelöschte Dateien bleiben 1 Tag hier und zählen weiter zu deinem Speicher.',
                'Gelöschte Dateien bleiben {count} Tage hier und zählen weiter zu deinem Speicher.'
              )}
            </Typography>
          </Box>
        </Box>
        {summary.files > 0 && (
          <Button
            color="error"
            variant="outlined"
            onClick={empty}
            disabled={busy !== null}
            startIcon={busy === 'all' ? <CircularProgress size={16} color="inherit" /> : <DeleteSweepRounded />}
          >
            {t('Papierkorb leeren')}
          </Button>
        )}
      </Box>

      {!summary.enabled && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {t('Der Papierkorb ist auf diesem Server abgeschaltet. Was du jetzt löschst, ist sofort weg.')}
        </Alert>
      )}

      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
        <AnimatePresence initial={false}>
          {files.map((file) => (
            <m.li
              key={file.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
              transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 1.25,
                  pr: 1,
                  borderRadius: `${radius.md}px`,
                  bgcolor: c.surfaceContainerLow,
                }}
              >
                <FileThumb file={file} muted />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" noWrap sx={{ fontWeight: 600 }} title={displayName(file)}>
                    {displayName(file)}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                    {formatBytes(file.sizeBytes)}
                    {file.deletedAt && (
                      <span
                        title={formatDateTime(new Date(file.deletedAt))}
                      >{`, ${t('gelöscht {when}', { when: relativeMs(file.deletedAt) })}`}</span>
                    )}
                  </Typography>
                  {file.purgeAt && <PurgeHint at={file.purgeAt} />}
                </Box>
                <Button
                  variant="tonal"
                  onClick={() => restore(file)}
                  disabled={busy !== null}
                  startIcon={busy === file.id ? <CircularProgress size={16} color="inherit" /> : <RestoreFromTrashRounded />}
                  sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  {t('Wiederherstellen')}
                </Button>
                <IconButton
                  aria-label={t('Wiederherstellen')}
                  onClick={() => restore(file)}
                  disabled={busy !== null}
                  sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
                >
                  <RestoreFromTrashRounded />
                </IconButton>
                <Tooltip title={t('Endgültig löschen')}>
                  <span>
                    <IconButton
                      aria-label={t('Endgültig löschen')}
                      onClick={() => purge(file)}
                      disabled={busy !== null}
                      sx={{ color: c.error }}
                    >
                      <DeleteForeverRounded />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </m.li>
          ))}
        </AnimatePresence>
      </Box>

      {!files.length && (
        <Box sx={{ textAlign: 'center', py: { xs: 8, md: 10 }, color: 'text.secondary' }}>
          <RestoreFromTrashRounded sx={{ fontSize: 48, opacity: 0.6 }} />
          <Typography variant="h6" sx={{ mt: 1.5, color: 'text.primary' }}>
            {t('Hier liegt nichts')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {t('Gelöschte Dateien landen erst hier und lassen sich wiederherstellen.')}
          </Typography>
        </Box>
      )}

      {hasNext && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Button
            variant="tonal"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('more');
              await load(page + 1);
              setBusy(null);
            }}
          >
            {t('Mehr laden')}
          </Button>
        </Box>
      )}
    </Box>
  );
}
