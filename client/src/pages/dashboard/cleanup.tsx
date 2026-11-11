import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CleaningServicesOutlined from '@mui/icons-material/CleaningServicesOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import type { FileItem } from '../../lib/types';
import { bulkFiles, errorMessage, fetchCleanup, type CleanupKind, type CleanupResponse } from '../../lib/api';
import { formatBytes, formatDateTime, formatNumber, relativeMs } from '../../lib/format';
import { siteName } from '../../lib/boot';
import { t, tn } from '../../lib/i18n';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { FileThumb } from '../../components/FileThumb';
import { displayName } from './MediaTile';
import { c, ease, radius } from '../../theme/tokens';

const KINDS: CleanupKind[] = ['large', 'unseen', 'stale'];
const EXPIRIES = ['1d', '7d', '30d'] as const;
const expiryText = (value: (typeof EXPIRIES)[number]) =>
  value === '1d' ? t('In einem Tag') : value === '7d' ? t('In einer Woche') : t('In 30 Tagen');

const kindLabel = (kind: CleanupKind) =>
  kind === 'large' ? t('Groß') : kind === 'unseen' ? t('Nie aufgerufen') : t('Lange nicht aufgerufen');

function kindHint(kind: CleanupKind, stats: boolean) {
  if (kind === 'large') return t('Die größten Dateien zuerst. Hier lässt sich am meisten Platz schaffen.');
  if (kind === 'unseen') return t('Älter als zwei Wochen und noch kein einziges Mal aufgerufen, auch nicht über den Direktlink.');
  return stats
    ? t('Seit einem halben Jahr nicht mehr aufgerufen, die ältesten zuerst.')
    : t('Älter als ein halbes Jahr. Die Statistik ist aus, deshalb weiß {name} nicht, wann eine Datei zuletzt aufgerufen wurde.', {
        name: siteName(),
      });
}

function detail(file: FileItem, kind: CleanupKind) {
  const parts = kind === 'large' ? [] : [formatBytes(file.sizeBytes)];
  if (file.createdAt) parts.push(t('hochgeladen {when}', { when: relativeMs(file.createdAt) }));
  if (kind !== 'unseen') parts.push(tn(file.views, '1 Aufruf', '{count} Aufrufe'));
  if (file.expiresAt) parts.push(t('läuft ab {when}', { when: relativeMs(file.expiresAt) }));
  return parts.join(', ');
}

export function CleanupView({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState<CleanupKind>('large');
  const [data, setData] = useState<CleanupResponse | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<'delete' | 'expire' | 'more' | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  const load = useCallback(
    async (next: CleanupKind, page = 1) => {
      try {
        const result = await fetchCleanup(next, page);
        setData(result);
        setFiles((current) =>
          page === 1 ? result.files : [...current, ...result.files.filter((file) => !current.some((item) => item.id === file.id))]
        );
      } catch (failure) {
        toast(errorMessage(failure), { variant: 'error' });
      }
    },
    [toast]
  );

  useEffect(() => {
    setData(null);
    setFiles([]);
    setSelected(new Set());
    load(kind, 1);
  }, [kind, load]);

  const chosen = useMemo(() => files.filter((file) => selected.has(file.id)), [files, selected]);
  const chosenBytes = chosen.reduce((sum, file) => sum + file.sizeBytes, 0);
  const allChosen = files.length > 0 && chosen.length === files.length;

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async () => {
    if (!chosen.length || !data) return;
    const ok = await confirm({
      title: data.trash
        ? tn(chosen.length, 'In den Papierkorb legen?', '{count} Dateien in den Papierkorb legen?')
        : tn(chosen.length, 'Endgültig löschen?', '{count} Dateien endgültig löschen?'),
      message: data.trash
        ? t('Zusammen {size}. Aus dem Papierkorb holst du sie bei Bedarf zurück.', { size: formatBytes(chosenBytes) })
        : t('Zusammen {size}. Der Papierkorb ist abgeschaltet, gelöschte Dateien sind sofort weg.', { size: formatBytes(chosenBytes) }),
      confirmLabel: data.trash ? t('In den Papierkorb') : t('Endgültig löschen'),
      icon: <DeleteOutlineRounded />,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      const result = await bulkFiles({ action: 'delete', ids: chosen.map((file) => file.id) });
      toast(
        result.trashed
          ? tn(result.count, '1 Datei liegt jetzt im Papierkorb', '{count} Dateien liegen jetzt im Papierkorb')
          : tn(result.count, '1 Datei gelöscht', '{count} Dateien gelöscht'),
        { variant: 'success' }
      );
      setSelected(new Set());
      await load(kind, 1);
      onChanged();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const expire = async (expires: (typeof EXPIRIES)[number]) => {
    setMenu(null);
    if (!chosen.length) return;
    setBusy('expire');
    try {
      const result = await bulkFiles({ action: 'expire', ids: chosen.map((file) => file.id), expires });
      toast(tn(result.count, 'Ablaufdatum für 1 Datei gesetzt', 'Ablaufdatum für {count} Dateien gesetzt'), { variant: 'success' });
      setSelected(new Set());
      await load(kind, 1);
      onChanged();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const more = async () => {
    if (!data) return;
    setBusy('more');
    await load(kind, data.page + 1);
    setBusy(null);
  };

  return (
    <Box sx={{ maxWidth: 980 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          onChange={(_event, next: CleanupKind | null) => next && setKind(next)}
          aria-label={t('Was aufräumen?')}
        >
          {KINDS.map((key) => (
            <ToggleButton key={key} value={key}>
              {kindLabel(key)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          p: { xs: 2, sm: 2.5 },
          mb: 2,
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerLow,
        }}
      >
        <CleaningServicesOutlined sx={{ color: c.onSurfaceVariant, mt: 0.25 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {data
              ? data.summary.count
                ? tn(data.summary.count, '1 Datei, {size}', '{count} Dateien, zusammen {size}', { size: formatBytes(data.summary.bytes) })
                : t('Hier gibt es nichts aufzuräumen')
              : kindLabel(kind)}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 640 }}>
            {kindHint(kind, data ? data.stats : true)}
          </Typography>
        </Box>
      </Box>

      {files.length > 0 && (
        <Box
          sx={{
            position: 'sticky',
            top: { xs: 8, md: 12 },
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            pl: 0.5,
            pr: 1,
            py: 0.75,
            mb: 1,
            borderRadius: `${radius.md}px`,
            bgcolor: chosen.length ? c.secondaryContainer : c.surface,
            color: chosen.length ? c.onSecondaryContainer : 'inherit',
            transition: 'background-color 160ms',
          }}
        >
          <Checkbox
            checked={allChosen}
            indeterminate={chosen.length > 0 && !allChosen}
            onChange={() => setSelected(allChosen ? new Set() : new Set(files.map((file) => file.id)))}
            slotProps={{ input: { 'aria-label': t('Alle angezeigten auswählen') } }}
          />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 160, fontWeight: chosen.length ? 700 : 400 }}>
            {chosen.length
              ? tn(chosen.length, '1 ausgewählt, {size}', '{count} ausgewählt, {size}', { size: formatBytes(chosenBytes) })
              : t('Alle angezeigten auswählen')}
          </Typography>
          <Button
            size="small"
            onClick={(event) => setMenu(event.currentTarget)}
            disabled={!chosen.length || busy !== null}
            startIcon={busy === 'expire' ? <CircularProgress size={14} color="inherit" /> : <TimerOutlined />}
            endIcon={<ExpandMoreRounded />}
          >
            {t('Ablaufen lassen')}
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={remove}
            disabled={!chosen.length || busy !== null}
            startIcon={busy === 'delete' ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineRounded />}
          >
            {data?.trash ? t('In den Papierkorb') : t('Löschen')}
          </Button>
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            {EXPIRIES.map((value) => (
              <MenuItem key={value} onClick={() => expire(value)}>
                <ListItemIcon>
                  <TimerOutlined fontSize="small" />
                </ListItemIcon>
                {expiryText(value)}
              </MenuItem>
            ))}
          </Menu>
        </Box>
      )}

      {!data ? (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={72} />
          ))}
        </Box>
      ) : files.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: { xs: 7, md: 9 }, color: 'text.secondary' }}>
          <TaskAltRounded sx={{ fontSize: 48, color: c.primary }} />
          <Typography variant="h6" sx={{ mt: 1.5, color: 'text.primary' }}>
            {t('Alles aufgeräumt')}
          </Typography>
          <Typography variant="body2">{t('Schau später wieder vorbei.')}</Typography>
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
          <AnimatePresence initial={false}>
            {files.map((file) => {
              const checked = selected.has(file.id);
              return (
                <m.li
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
                  transition={{ duration: 0.26, ease: ease.emphasizedDecelerate }}
                >
                  <Box
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('a, button, input')) return;
                      toggle(file.id);
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1,
                      pl: 0.5,
                      borderRadius: `${radius.md}px`,
                      bgcolor: checked ? c.secondaryContainer : c.surfaceContainerLow,
                      cursor: 'pointer',
                      transition: 'background-color 160ms',
                      '&:hover': { bgcolor: checked ? c.secondaryContainer : c.surfaceContainer },
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => toggle(file.id)}
                      slotProps={{ input: { 'aria-label': t('{name} auswählen', { name: displayName(file) }) } }}
                    />
                    <FileThumb file={file} size={48} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link
                        href={file.urls.view}
                        target="_blank"
                        rel="noopener"
                        underline="hover"
                        color="inherit"
                        noWrap
                        sx={{ display: 'block', fontWeight: 600 }}
                        title={displayName(file)}
                      >
                        {displayName(file)}
                      </Link>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary' }}
                        noWrap
                        title={file.createdAt ? formatDateTime(new Date(file.createdAt)) : undefined}
                      >
                        {detail(file, kind)}
                      </Typography>
                    </Box>
                    {kind === 'large' && (
                      <Typography variant="subtitle2" sx={{ pr: { xs: 0.5, sm: 1.5 }, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {formatBytes(file.sizeBytes)}
                      </Typography>
                    )}
                  </Box>
                </m.li>
              );
            })}
          </AnimatePresence>
        </Box>
      )}

      {data?.hasNext && files.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button
            onClick={more}
            disabled={busy !== null}
            startIcon={busy === 'more' ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {t('{count} weitere zeigen', { count: formatNumber(Math.min(50, data.summary.count - files.length)) })}
          </Button>
        </Box>
      )}
    </Box>
  );
}
