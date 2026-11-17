import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileRenameOutlineRounded from '@mui/icons-material/DriveFileRenameOutlineRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import SellOutlined from '@mui/icons-material/SellOutlined';
import type { TagCount } from '../../lib/types';
import { ApiError, deleteTag, errorMessage, fetchTags, renameTag } from '../../lib/api';
import { t, tn } from '../../lib/i18n';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { GrowTransition } from '../../components/transitions';
import { c, radius } from '../../theme/tokens';

export const normalizeTag = (raw: string) =>
  raw
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 32);

function TagRow({
  entry,
  tags,
  busy,
  onRename,
  onDelete,
}: {
  entry: TagCount;
  tags: TagCount[];
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(entry.tag);
  const [error, setError] = useState('');
  const target = normalizeTag(name);
  const merge = target && target !== entry.tag ? tags.find((other) => other.tag === target) : undefined;

  const save = async () => {
    if (!target) {
      setError(t('Ein Tag braucht mindestens einen Buchstaben oder eine Ziffer.'));
      return;
    }
    if (target === entry.tag) {
      setEditing(false);
      return;
    }
    setError('');
    if (await onRename(name)) setEditing(false);
  };

  if (editing) {
    return (
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        sx={{ display: 'grid', gap: 1, px: 1.5, py: 1.25, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHigh }}
      >
        <TextField
          autoFocus
          size="small"
          label={t('Neuer Name für #{tag}', { tag: entry.tag })}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setEditing(false);
              setName(entry.tag);
            }
          }}
          error={Boolean(error)}
          helperText={
            error ||
            (merge
              ? t('#{tag} gibt es schon ({count}). Beide werden zusammengeführt.', {
                  tag: merge.tag,
                  count: tn(merge.files, '1 Datei', '{count} Dateien'),
                })
              : target && target !== name.trim().toLowerCase()
                ? t('Wird zu #{tag}', { tag: target })
                : ' ')
          }
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SellOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
            size="small"
            onClick={() => {
              setEditing(false);
              setName(entry.tag);
              setError('');
            }}
            disabled={busy}
          >
            {t('Abbrechen')}
          </Button>
          <Button size="small" type="submit" variant="contained" disabled={busy || !target}>
            {merge ? t('Zusammenführen') : t('Umbenennen')}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: 1.5,
        pr: 0.5,
        py: 0.5,
        borderRadius: `${radius.md}px`,
        '&:hover': { bgcolor: c.surfaceContainerHigh },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        #{entry.tag}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {tn(entry.files, '1 Datei', '{count} Dateien')}
      </Typography>
      <Tooltip title={t('Umbenennen')}>
        <IconButton
          size="small"
          aria-label={t('#{tag} umbenennen', { tag: entry.tag })}
          onClick={() => {
            setName(entry.tag);
            setEditing(true);
          }}
          disabled={busy}
        >
          <DriveFileRenameOutlineRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('Löschen')}>
        <IconButton size="small" aria-label={t('#{tag} löschen', { tag: entry.tag })} onClick={onDelete} disabled={busy}>
          <DeleteOutlineRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export function TagManagerDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: (tags: TagCount[], change: { from: string; to: string | null }) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tags, setTags] = useState<TagCount[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTags(null);
    fetchTags()
      .then((result) => setTags(result.tags))
      .catch((failure) => {
        setTags([]);
        toast(errorMessage(failure), { variant: 'error' });
      });
  }, [open, toast]);

  const shown = useMemo(() => {
    const needle = normalizeTag(query);
    const list = [...(tags || [])].sort((a, b) => a.tag.localeCompare(b.tag));
    return needle ? list.filter((entry) => entry.tag.includes(needle)) : list;
  }, [tags, query]);

  const rename = async (entry: TagCount, name: string) => {
    setBusy(true);
    try {
      const result = await renameTag(entry.tag, name);
      setTags(result.tags);
      onChanged(result.tags, { from: entry.tag, to: result.tag });
      toast(
        result.merged
          ? t('#{from} und #{to} zusammengeführt', { from: entry.tag, to: result.tag })
          : t('#{from} heißt jetzt #{to}', { from: entry.tag, to: result.tag }),
        { variant: 'success' }
      );
      return true;
    } catch (failure) {
      toast(failure instanceof ApiError ? failure.message : errorMessage(failure), { variant: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: TagCount) => {
    const ok = await confirm({
      title: t('#{tag} löschen?', { tag: entry.tag }),
      message: tn(
        entry.files,
        'Der Tag verschwindet von einer Datei. Die Datei selbst bleibt. Smarte Alben und Teilen-Regeln mit diesem Tag finden danach nichts mehr.',
        'Der Tag verschwindet von {count} Dateien. Die Dateien selbst bleiben. Smarte Alben und Teilen-Regeln mit diesem Tag finden danach nichts mehr.'
      ),
      confirmLabel: t('Löschen'),
      icon: <DeleteOutlineRounded />,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await deleteTag(entry.tag);
      setTags(result.tags);
      onChanged(result.tags, { from: entry.tag, to: null });
      toast(t('#{tag} gelöscht', { tag: entry.tag }), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slots={{ transition: GrowTransition }} aria-labelledby="tags-title">
      <DialogTitle id="tags-title">{t('Tags verwalten')}</DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 2 } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5, px: 0.5 }}>
          {t('Benennst du einen Tag wie einen vorhandenen, werden beide zusammengeführt. Smarte Alben und Teilen-Regeln ziehen mit.')}
        </Typography>
        {tags && tags.length > 8 && (
          <TextField
            size="small"
            fullWidth
            placeholder={t('Tags durchsuchen')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{
              htmlInput: { 'aria-label': t('Tags durchsuchen') },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 1 }}
          />
        )}
        {tags === null ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : shown.length ? (
          <Box sx={{ display: 'grid', gap: 0.25 }}>
            {shown.map((entry) => (
              <TagRow
                key={entry.tag}
                entry={entry}
                tags={tags}
                busy={busy}
                onRename={(name) => rename(entry, name)}
                onDelete={() => remove(entry)}
              />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
            {tags.length ? t('Kein Tag passt zur Suche.') : t('Du hast noch keine Tags vergeben.')}
          </Typography>
        )}
        {tags && tags.length > 0 && (
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5, px: 0.5 }}>
            {tn(tags.length, 'Insgesamt 1 Tag', 'Insgesamt {count} Tags')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Fertig')}</Button>
      </DialogActions>
    </Dialog>
  );
}
