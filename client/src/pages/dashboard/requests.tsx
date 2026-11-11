import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MoveToInboxRounded from '@mui/icons-material/MoveToInboxRounded';
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded';
import PlayCircleOutlineRounded from '@mui/icons-material/PlayCircleOutlineRounded';
import type { Album, ExpiryChoice, FileItem, RequestState, RequestTypes, UploadRequest, UploadRequestInput } from '../../lib/types';
import {
  ApiError,
  createUploadRequest,
  deleteUploadRequest,
  errorMessage,
  fetchUploadRequest,
  fetchUploadRequests,
  listAlbums,
  updateUploadRequest,
} from '../../lib/api';
import { formatBytes, formatDate, relativeMs } from '../../lib/format';
import { CopyIconButton } from '../../components/CopyButton';
import { QrDialog } from '../../components/QrDialog';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { ExpirySelect } from '../../components/ShareOptions';
import { PasswordField } from '../../components/PasswordField';
import { FileThumb } from '../../components/FileThumb';
import { c, ease, fonts, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

const MB = 1024 * 1024;

const TYPE_LABELS: Record<RequestTypes, string> = {
  any: t('Alle Dateien'),
  images: t('Nur Bilder'),
  videos: t('Nur Videos'),
  media: t('Bilder, Videos und Audio'),
  documents: t('Dokumente und Archive'),
};

const STATE: Record<RequestState, { label: string; bg: string; fg: string }> = {
  open: { label: t('Offen'), bg: c.successContainer, fg: c.onSuccessContainer },
  full: { label: t('Voll'), bg: c.warningContainer, fg: c.onWarningContainer },
  expired: { label: t('Abgelaufen'), bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
  closed: { label: t('Geschlossen'), bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
};

const toMb = (bytes: number | null) => (bytes ? String(Math.round((bytes / MB) * 10) / 10) : '');
const fromMb = (value: string) => {
  const number = Number(value.replace(',', '.'));
  return value.trim() && Number.isFinite(number) && number > 0 ? Math.round(number * MB) : null;
};

function RequestDialog({
  item,
  open,
  albums,
  onClose,
  onSaved,
}: {
  item: UploadRequest | null;
  open: boolean;
  albums: Album[];
  onClose: () => void;
  onSaved: (request: UploadRequest, created: boolean) => void;
}) {
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [title, setTitle] = useState(item?.title || '');
  const [message, setMessage] = useState(item?.message || '');
  const [password, setPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [expires, setExpires] = useState<ExpiryChoice | ''>(item ? '' : '7d');
  const [maxFiles, setMaxFiles] = useState(item?.maxFiles ? String(item.maxFiles) : '');
  const [maxBytes, setMaxBytes] = useState(toMb(item?.maxBytes ?? null));
  const [fileBytes, setFileBytes] = useState(toMb(item?.fileBytes ?? null));
  const [types, setTypes] = useState<RequestTypes>(item?.types || 'any');
  const [albumId, setAlbumId] = useState<number | ''>(item?.albumId || '');
  const [askName, setAskName] = useState(item ? item.askName : true);
  const [notify, setNotify] = useState(item ? item.notify : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    setField('');
    const data: UploadRequestInput = {
      title,
      message,
      maxFiles: maxFiles.trim() ? Number(maxFiles) : null,
      maxBytes: fromMb(maxBytes),
      fileBytes: fromMb(fileBytes),
      types,
      albumId: albumId === '' ? null : albumId,
      askName,
      notify,
    };
    if (expires) data.expires = expires;
    if (password) data.password = password;
    else if (removePassword) data.password = null;
    try {
      const result = item ? await updateUploadRequest(item.id, data) : await createUploadRequest(data);
      onSaved(result.request, !item);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setField(failure instanceof ApiError ? failure.field : '');
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (name: string) => (field === name ? error : '');

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={phone} scroll="paper">
      <DialogTitle>{item ? t('Anfrage bearbeiten') : t('Neue Datei-Anfrage')}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 2.5, pt: 0.5 }}>
          {error && !field && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('Titel')}
            placeholder={t('Fotos vom Sommerfest')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            autoFocus
            error={!!fieldError('title')}
            helperText={fieldError('title') || t('Steht groß auf der Seite, die du verschickst.')}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label={t('Nachricht')}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            multiline
            minRows={2}
            error={!!fieldError('message')}
            helperText={fieldError('message') || t('Optional. Zum Beispiel, welche Dateien du brauchst.')}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <ExpirySelect
              value={expires}
              onChange={setExpires}
              label={t('Offen für')}
              includeDefault={
                item
                  ? item.expiresAt
                    ? t('Wie bisher, bis {date}', { date: formatDate(new Date(item.expiresAt)) })
                    : t('Wie bisher, ohne Ende')
                  : undefined
              }
            />
            <TextField
              select
              size="small"
              label={t('Erlaubte Dateien')}
              value={types}
              onChange={(event) => setTypes(event.target.value as RequestTypes)}
            >
              {(Object.keys(TYPE_LABELS) as RequestTypes[]).map((key) => (
                <MenuItem key={key} value={key}>
                  {TYPE_LABELS[key]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              label={t('Höchstens Dateien')}
              value={maxFiles}
              onChange={(event) => setMaxFiles(event.target.value)}
              error={!!fieldError('maxFiles')}
              helperText={fieldError('maxFiles') || t('Leer: beliebig viele')}
              slotProps={{ htmlInput: { min: 1, max: 1000 } }}
            />
            <TextField
              size="small"
              type="number"
              label={t('Höchstens MB pro Datei')}
              value={fileBytes}
              onChange={(event) => setFileBytes(event.target.value)}
              error={!!fieldError('fileBytes')}
              helperText={fieldError('fileBytes') || t('Leer: dein normales Limit')}
              slotProps={{ htmlInput: { min: 0.1, step: 'any' } }}
            />
            <TextField
              size="small"
              type="number"
              label={t('Höchstens MB insgesamt')}
              value={maxBytes}
              onChange={(event) => setMaxBytes(event.target.value)}
              error={!!fieldError('maxBytes')}
              helperText={fieldError('maxBytes') || t('Leer: bis dein Speicher voll ist')}
              slotProps={{ htmlInput: { min: 0.1, step: 'any' } }}
            />
            <TextField
              select
              size="small"
              label={t('In Album legen')}
              value={albumId}
              onChange={(event) => setAlbumId(event.target.value === '' ? '' : Number(event.target.value))}
              error={!!fieldError('albumId')}
              helperText={fieldError('albumId') || ' '}
              disabled={!albums.length}
            >
              <MenuItem value="">{t('Kein Album')}</MenuItem>
              {albums.map((album) => (
                <MenuItem key={album.id} value={album.id}>
                  {album.title}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box>
            <PasswordField
              label={item?.password ? t('Neues Passwort') : t('Passwort')}
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (value) setRemovePassword(false);
              }}
              autoComplete="new-password"
              error={!!fieldError('password')}
              helperText={fieldError('password') || t('Optional. Nur wer es kennt, kann hochladen.')}
            />
            {item?.password && !password && (
              <FormControlLabel
                control={<Switch checked={removePassword} onChange={(event) => setRemovePassword(event.target.checked)} />}
                label={t('Passwort entfernen')}
              />
            )}
          </Box>
          <Box sx={{ display: 'grid' }}>
            <FormControlLabel
              control={<Switch checked={askName} onChange={(event) => setAskName(event.target.checked)} />}
              label={t('Nach dem Namen fragen')}
            />
            <FormControlLabel
              control={<Switch checked={notify} onChange={(event) => setNotify(event.target.checked)} />}
              label={t('Mich bei neuen Dateien benachrichtigen')}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || !title.trim()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {item ? t('Speichern') : t('Anfrage erstellen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RequestFiles({ item, onClose }: { item: UploadRequest; onClose: () => void }) {
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [files, setFiles] = useState<Array<FileItem & { uploader: string | null }> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUploadRequest(item.id)
      .then((result) => setFiles(result.files))
      .catch((failure) => setError(errorMessage(failure)));
  }, [item.id]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} scroll="paper">
      <DialogTitle>{t('Dateien für „{title}“', { title: item.title })}</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 2 } }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!files && !error && (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={64} />
            ))}
          </Box>
        )}
        {files && !files.length && (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 1, py: 2 }}>
            {t('Noch ist nichts angekommen.')}
          </Typography>
        )}
        {files && files.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
            {files.map((file) => (
              <Box
                component="li"
                key={file.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1,
                  borderRadius: `${radius.md}px`,
                  '&:hover': { bgcolor: c.surfaceContainerHigh },
                }}
              >
                <FileThumb file={file} size={48} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Link
                    href={file.urls.view}
                    target="_blank"
                    rel="noopener"
                    underline="hover"
                    sx={{ fontWeight: 600, display: 'block' }}
                    noWrap
                  >
                    {file.originalName || file.filename}
                  </Link>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {[
                      file.uploader ? t('von {name}', { name: file.uploader }) : t('ohne Namen'),
                      formatBytes(file.sizeBytes),
                      relativeMs(file.createdAt),
                    ].join(', ')}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Schließen')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function RequestCard({
  item,
  onEdit,
  onFiles,
  onToggle,
  onDelete,
  onQr,
  busy,
}: {
  item: UploadRequest;
  onEdit: () => void;
  onFiles: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onQr: () => void;
  busy: boolean;
}) {
  const state = STATE[item.state];
  const limits = [
    item.maxFiles ? tn(item.maxFiles, 'höchstens 1 Datei', 'höchstens {count} Dateien') : null,
    item.fileBytes ? t('je bis {size}', { size: formatBytes(item.fileBytes) }) : null,
    item.maxBytes ? t('zusammen bis {size}', { size: formatBytes(item.maxBytes) }) : null,
    item.types !== 'any' ? TYPE_LABELS[item.types] : null,
  ].filter(Boolean);
  return (
    <Box sx={{ borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h3" sx={{ fontSize: '1.0625rem' }}>
              {item.title}
            </Typography>
            <Chip size="small" label={state.label} sx={{ bgcolor: state.bg, color: state.fg, fontWeight: 700 }} />
            {item.password && (
              <Tooltip title={t('Mit Passwort')}>
                <LockOutlined fontSize="small" sx={{ color: 'text.secondary' }} aria-label={t('Mit Passwort')} />
              </Tooltip>
            )}
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {item.files
              ? t('{files} angekommen, zusammen {size}, zuletzt {when}', {
                  files: tn(item.files, '1 Datei', '{count} Dateien'),
                  size: formatBytes(item.bytes),
                  when: relativeMs(item.lastUploadAt),
                })
              : t('Noch keine Dateien')}
            {item.state === 'open' && item.expiresAt ? `. ${t('Offen bis {date}', { date: formatDate(new Date(item.expiresAt)) })}` : ''}
          </Typography>
          {limits.length > 0 && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.25 }}>
              {limits.join(', ')}
            </Typography>
          )}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: `${radius.full}px`,
          bgcolor: c.surfaceContainerHigh,
          minWidth: 0,
        }}
      >
        <Typography
          sx={{
            fontFamily: fonts.mono,
            fontSize: '0.8125rem',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.url}
        </Typography>
        <Tooltip title={t('QR-Code und Aushang')}>
          <IconButton size="small" onClick={onQr} aria-label={t('QR-Code')}>
            <QrCode2Rounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <CopyIconButton value={item.url} size="small" label={t('Link kopieren')} />
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="small" startIcon={<FolderOpenRounded />} onClick={onFiles} disabled={!item.files}>
          {t('Dateien ansehen')}
        </Button>
        <Button size="small" startIcon={<EditOutlined />} onClick={onEdit}>
          {t('Bearbeiten')}
        </Button>
        <Button
          size="small"
          startIcon={item.closedAt ? <PlayCircleOutlineRounded /> : <PauseCircleOutlineRounded />}
          onClick={onToggle}
          disabled={busy}
        >
          {item.closedAt ? t('Wieder öffnen') : t('Schließen')}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('Löschen')}>
          <IconButton size="small" onClick={onDelete} disabled={busy} aria-label={t('Anfrage löschen')}>
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export function RequestsView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<UploadRequest[] | null>(null);
  const [qr, setQr] = useState<UploadRequest | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [editing, setEditing] = useState<{ item: UploadRequest | null; key: number } | null>(null);
  const [viewing, setViewing] = useState<UploadRequest | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchUploadRequests();
      setItems(result.requests);
      setEnabled(result.enabled);
    } catch (failure) {
      setItems([]);
      toast(errorMessage(failure), { variant: 'error' });
    }
  }, [toast]);

  useEffect(() => {
    load();
    listAlbums()
      .then((result) => setAlbums(result.albums))
      .catch(() => {});
  }, [load]);

  const replace = (next: UploadRequest) => setItems((list) => (list ? list.map((entry) => (entry.id === next.id ? next : entry)) : list));

  const toggle = async (item: UploadRequest) => {
    setBusy(item.id);
    try {
      const result = await updateUploadRequest(item.id, { closed: !item.closedAt });
      replace(result.request);
      toast(result.request.closedAt ? t('Anfrage geschlossen') : t('Anfrage wieder offen'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: UploadRequest) => {
    const ok = await confirm({
      title: t('Anfrage löschen?'),
      message: t('Der Link funktioniert danach nicht mehr. Die Dateien, die schon angekommen sind, bleiben in deinem Konto.'),
      confirmLabel: t('Löschen'),
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      await deleteUploadRequest(item.id);
      setItems((list) => (list ? list.filter((entry) => entry.id !== item.id) : list));
      toast(t('Anfrage gelöscht'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 2.5, maxWidth: 880 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography variant="h6" component="h2">
            {t('Datei-Anfragen')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 620 }}>
            {t('Schick jemandem einen Link, über den er dir Dateien hochlädt, ganz ohne Konto. Alles landet in deinen Dateien.')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          onClick={() => setEditing({ item: null, key: Date.now() })}
          disabled={!enabled}
        >
          {t('Neue Anfrage')}
        </Button>
      </Box>

      {!enabled && <Alert severity="info">{t('Datei-Anfragen sind auf diesem Server gerade abgeschaltet.')}</Alert>}

      {!items && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {[0, 1].map((index) => (
            <Skeleton key={index} variant="rounded" height={150} sx={{ borderRadius: `${radius.lg}px` }} />
          ))}
        </Box>
      )}

      {items && !items.length && enabled && (
        <Box
          sx={{
            borderRadius: `${radius.lg}px`,
            border: `1px dashed ${c.outlineVariant}`,
            p: { xs: 3, sm: 4 },
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <MoveToInboxRounded sx={{ fontSize: 40, color: c.primary }} />
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontWeight: 700 }}>{t('Noch keine Anfrage')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Praktisch für Fotos von Freunden, Bewerbungsunterlagen oder Dateien von Kunden.')}
            </Typography>
          </Box>
        </Box>
      )}

      <AnimatePresence initial={false}>
        {(items || []).map((item) => (
          <m.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: ease.emphasizedDecelerate }}
          >
            <RequestCard
              item={item}
              busy={busy === item.id}
              onEdit={() => setEditing({ item, key: Date.now() })}
              onFiles={() => setViewing(item)}
              onToggle={() => toggle(item)}
              onDelete={() => remove(item)}
              onQr={() => setQr(item)}
            />
          </m.div>
        ))}
      </AnimatePresence>

      <QrDialog
        url={qr ? qr.url : null}
        title={qr ? qr.title : undefined}
        poster={qr ? { heading: qr.title, text: qr.message || t('Hier kannst du deine Dateien hochladen.') } : undefined}
        onClose={() => setQr(null)}
      />

      {editing && (
        <RequestDialog
          key={editing.key}
          item={editing.item}
          open
          albums={albums}
          onClose={() => setEditing(null)}
          onSaved={(request, created) => {
            if (created) {
              setItems((list) => [request, ...(list || [])]);
              toast(t('Anfrage erstellt. Kopiere den Link und schick ihn los.'), { variant: 'success' });
            } else {
              replace(request);
              toast(t('Anfrage gespeichert'), { variant: 'success' });
            }
          }}
        />
      )}
      {viewing && <RequestFiles item={viewing} onClose={() => setViewing(null)} />}
    </Box>
  );
}
