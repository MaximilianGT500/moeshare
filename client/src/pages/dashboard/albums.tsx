import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type CSSProperties } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PublicRounded from '@mui/icons-material/PublicRounded';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import WallpaperRounded from '@mui/icons-material/WallpaperRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import PersonAddAlt1Outlined from '@mui/icons-material/PersonAddAlt1Outlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import {
  ApiError,
  addAlbumMember,
  addToAlbum,
  albumZipUrl,
  createAlbum,
  deleteAlbum,
  fetchAlbum,
  leaveAlbum,
  listAlbums,
  removeAlbumMember,
  removeFromAlbum,
  reorderAlbum,
  updateAlbum,
} from '../../lib/api';
import type { Album, AlbumVisibility, FileItem, UploadOptionsInfo } from '../../lib/types';
import { relativeMs } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { meaningfulColor, mix } from '../../lib/color';
import { CopyTextButton } from '../../components/CopyButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { PasswordField } from '../../components/PasswordField';
import { GrowTransition } from '../../components/transitions';
import { StatsDialog, type StatsTarget } from '../../components/StatsView';
import { fileIcon } from '../../components/FileIcons';
import { UserAvatar } from '../../components/UserAvatar';
import { displayName, hasWarning } from './MediaTile';
import { useUploads } from './uploads';
import { c, css, radius } from '../../theme/tokens';

export function AlbumEditorDialog({
  open,
  album,
  fileIds = [],
  onClose,
  onSaved,
}: {
  open: boolean;
  album: Album | null;
  fileIds?: number[];
  onClose: () => void;
  onSaved: (album: Album) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<AlbumVisibility>('link');
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(album?.title || '');
    setDescription(album?.description || '');
    setVisibility(album?.visibility || 'link');
    setPasswordEnabled(Boolean(album?.password));
    setPassword('');
    setError('');
  }, [open, album]);

  const save = async () => {
    if (!title.trim()) {
      setError(t('Gib dem Album einen Namen.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = {
        title: title.trim(),
        description,
        visibility,
        ...(passwordEnabled ? (password ? { password } : {}) : album?.password ? { password: null } : {}),
      };
      const result = album
        ? await updateAlbum(album.id, data)
        : await createAlbum({ ...data, password: passwordEnabled ? password : undefined, fileIds });
      onSaved(result.album);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Das Album konnte nicht gespeichert werden.'));
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
      aria-labelledby="album-editor-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <CollectionsOutlined sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="album-editor-title" sx={{ textAlign: 'center' }}>
        {album ? t('Album bearbeiten') : t('Neues Album')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
          <TextField
            autoFocus
            label={t('Name')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            error={!!error && !title.trim()}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label={t('Beschreibung (optional)')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            maxRows={6}
          />
          <RadioGroup value={visibility} onChange={(event) => setVisibility(event.target.value as AlbumVisibility)}>
            <FormControlLabel
              value="link"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('Mit Link teilen')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('Alle, die den Link kennen, sehen das Album.')}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="public"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('Öffentlich')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('Wie „Mit Link teilen“ und zusätzlich auf deiner Profilseite zu sehen.')}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="private"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('Privat')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('Nur du siehst das Album.')}
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
          {visibility !== 'private' && (
            <>
              <FormControlLabel
                control={<Switch checked={passwordEnabled} onChange={(event) => setPasswordEnabled(event.target.checked)} />}
                label={t('Mit Passwort schützen')}
              />
              {passwordEnabled && (
                <PasswordField
                  label={album?.password ? t('Neues Passwort (leer lassen = unverändert)') : t('Passwort')}
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                />
              )}
            </>
          )}
          {error && (
            <Typography variant="body2" sx={{ color: c.error }}>
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={busy || (passwordEnabled && visibility !== 'private' && !album?.password && !password)}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {album ? t('Speichern') : t('Album anlegen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function AlbumPickerDialog({
  open,
  fileIds,
  onClose,
  onDone,
}: {
  open: boolean;
  fileIds: number[];
  onClose: () => void;
  onDone: (album: Album) => void;
}) {
  const toast = useToast();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAlbums(null);
    listAlbums()
      .then((res) => setAlbums(res.albums))
      .catch(() => setAlbums([]));
  }, [open]);

  const pick = async (album: Album) => {
    setBusy(album.id);
    try {
      const result = await addToAlbum(album.id, fileIds);
      toast(tn(fileIds.length, '1 Datei in „{album}“ gelegt', '{count} Dateien in „{album}“ gelegt', { album: album.title }), {
        variant: 'success',
      });
      onDone(result.album);
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dialog
        open={open && !creating}
        onClose={onClose}
        maxWidth="xs"
        fullWidth
        slots={{ transition: GrowTransition }}
        aria-labelledby="album-picker-title"
      >
        <DialogTitle id="album-picker-title">
          {tn(fileIds.length, '1 Datei zu einem Album hinzufügen', '{count} Dateien zu einem Album hinzufügen')}
        </DialogTitle>
        <DialogContent sx={{ px: 1 }}>
          {albums === null ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <List>
              <ListItemButton onClick={() => setCreating(true)}>
                <ListItemIcon>
                  <AddRounded />
                </ListItemIcon>
                <ListItemText primary={t('Neues Album')} />
              </ListItemButton>
              {albums.map((album) => (
                <ListItemButton key={album.id} onClick={() => pick(album)} disabled={busy !== null}>
                  <ListItemIcon>{busy === album.id ? <CircularProgress size={20} /> : <CollectionsOutlined />}</ListItemIcon>
                  <ListItemText primary={album.title} secondary={tn(album.files, '1 Datei', '{count} Dateien')} />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Abbrechen')}</Button>
        </DialogActions>
      </Dialog>
      <AlbumEditorDialog
        open={open && creating}
        album={null}
        fileIds={fileIds}
        onClose={() => setCreating(false)}
        onSaved={(album) => {
          setCreating(false);
          toast(t('Album „{album}“ angelegt', { album: album.title }), { variant: 'success' });
          onDone(album);
          onClose();
        }}
      />
    </>
  );
}

function AlbumCover({ album, size = 'large' }: { album: Album; size?: 'large' | 'small' }) {
  const [failed, setFailed] = useState(false);
  const cover = album.cover;
  const color = cover ? meaningfulColor(cover.color) : null;
  return (
    <Box
      sx={{
        position: 'relative',
        aspectRatio: size === 'large' ? '4 / 3' : '1 / 1',
        borderRadius: `${radius.md}px`,
        overflow: 'hidden',
        bgcolor: color ? mix(color, 30) : c.surfaceContainerHigh,
        display: 'grid',
        placeItems: 'center',
        color: c.onSurfaceVariant,
      }}
    >
      {cover && cover.url && !failed ? (
        <Box
          component="img"
          src={cover.url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <CollectionsOutlined sx={{ fontSize: 44, opacity: 0.6 }} />
      )}
    </Box>
  );
}

function VisibilityIcon({ album }: { album: Album }) {
  if (album.visibility === 'private') {
    return (
      <Tooltip title={t('Privat')}>
        <VisibilityOffOutlined fontSize="small" />
      </Tooltip>
    );
  }
  if (album.password) {
    return (
      <Tooltip title={t('Mit Passwort geteilt')}>
        <LockOutlined fontSize="small" />
      </Tooltip>
    );
  }
  if (album.visibility === 'public') {
    return (
      <Tooltip title={t('Öffentlich, auch im Profil')}>
        <PublicRounded fontSize="small" />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={t('Mit Link geteilt')}>
      <LinkRounded fontSize="small" />
    </Tooltip>
  );
}

interface DragProps {
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  style: CSSProperties;
}

function AlbumThumb({
  file,
  isCover,
  onRemove,
  onCover,
  dragProps,
  contributor,
}: {
  file: FileItem;
  isCover: boolean;
  onRemove?: () => void;
  onCover?: () => void;
  dragProps?: DragProps;
  contributor?: string;
}) {
  const [failed, setFailed] = useState(false);
  const visual = (file.type === 'image' || file.type === 'video') && !failed;
  const veiled = visual && hasWarning(file);
  return (
    <Box
      {...dragProps}
      sx={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: `${radius.tile}px`,
        overflow: 'hidden',
        bgcolor: meaningfulColor(file.color) ? mix(file.color, 30) : c.surfaceContainerHigh,
        outline: isCover ? `3px solid ${c.primary}` : 'none',
        outlineOffset: -3,
        '&:hover .album-actions, &:focus-within .album-actions': { opacity: 1 },
      }}
    >
      {visual ? (
        <Box
          component="img"
          src={file.urls.preview}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            ...(veiled ? { filter: 'blur(16px)', transform: 'scale(1.15)' } : {}),
          }}
        />
      ) : (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: c.onSurfaceVariant,
            p: 1,
            textAlign: 'center',
          }}
        >
          <Box sx={{ '& svg': { fontSize: 32 } }}>{fileIcon(file.filename, file.type)}</Box>
          <Typography variant="caption" noWrap sx={{ maxWidth: '100%' }}>
            {displayName(file)}
          </Typography>
        </Box>
      )}
      <Box
        className="album-actions"
        sx={{
          position: 'absolute',
          insetInline: 0,
          top: 0,
          display: 'flex',
          justifyContent: 'space-between',
          p: 0.5,
          opacity: { xs: 1, md: 0 },
          transition: `opacity 160ms ${css.standard}`,
        }}
      >
        {dragProps?.draggable && (
          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              placeItems: 'center',
              width: 30,
              height: 30,
              borderRadius: '50%',
              bgcolor: 'rgb(12 10 16 / 0.5)',
              color: '#fff',
              cursor: 'grab',
            }}
          >
            <DragIndicatorRounded fontSize="small" />
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
          {onCover && (
            <Tooltip title={t('Als Titelbild')}>
              <IconButton
                size="small"
                onClick={onCover}
                aria-label={t('Als Titelbild')}
                sx={{ bgcolor: 'rgb(12 10 16 / 0.5)', color: '#fff', '&:hover': { bgcolor: 'rgb(12 10 16 / 0.7)' } }}
              >
                <WallpaperRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onRemove && (
            <Tooltip title={t('Aus dem Album entfernen')}>
              <IconButton
                size="small"
                onClick={onRemove}
                aria-label={t('Aus dem Album entfernen')}
                sx={{ bgcolor: 'rgb(12 10 16 / 0.5)', color: '#fff', '&:hover': { bgcolor: 'rgb(12 10 16 / 0.7)' } }}
              >
                <RemoveCircleOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      {contributor && (
        <Box
          sx={{
            position: 'absolute',
            left: 6,
            bottom: 6,
            maxWidth: 'calc(100% - 12px)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            pl: 0.25,
            pr: 1,
            py: 0.25,
            borderRadius: `${radius.full}px`,
            bgcolor: 'rgb(12 10 16 / 0.55)',
            color: '#fff',
            fontSize: '0.6875rem',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          <UserAvatar name={contributor} size={18} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contributor}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function MembersPanel({ album, onChange }: { album: Album; onChange: (album: Album) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const owner = album.role !== 'member';
  const members = album.memberList || [];

  const add = async () => {
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    try {
      const { album: updated } = await addAlbumMember(album.id, value);
      onChange(updated);
      setName('');
      toast(t('{name} kann jetzt Dateien zu „{album}“ hinzufügen', { name: value, album: album.title }), { variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number, username: string) => {
    const ok = await confirm({
      title: t('{name} aus dem Album nehmen?', { name: username }),
      message: t('Die Dateien, die {name} hinzugefügt hat, verschwinden aus dem Album. Sie bleiben aber im Konto von {name}.', {
        name: username,
      }),
      confirmLabel: t('Entfernen'),
    });
    if (!ok) return;
    try {
      const { album: updated } = await removeAlbumMember(album.id, id);
      onChange(updated);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    }
  };

  if (!owner && !members.length) return null;

  return (
    <Box sx={{ mb: 3, p: 2, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainer }}>
      <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <GroupOutlined fontSize="small" />
        {t('Gemeinsames Album')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 1.5, maxWidth: 640 }}>
        {owner
          ? t(
              'Wen du einlädst, kann eigene Dateien hinzufügen und die eigenen wieder herausnehmen. Bearbeiten, sortieren und löschen kannst nur du.'
            )
          : t('{owner} hat dich eingeladen. Du kannst eigene Dateien hinzufügen und deine wieder herausnehmen.', {
              owner: album.owner || '',
            })}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {!owner && album.owner && (
          <Chip avatar={<UserAvatar name={album.owner} size={24} />} label={t('{name} (Besitzer)', { name: album.owner })} />
        )}
        {members.map((member) => (
          <Chip
            key={member.id}
            avatar={<UserAvatar name={member.username} size={24} />}
            label={member.username}
            onDelete={owner ? () => remove(member.id, member.username) : undefined}
            deleteIcon={<CloseRounded />}
          />
        ))}
        {owner && members.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Noch niemand eingeladen.')}
          </Typography>
        )}
      </Box>
      {owner && (
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
          sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}
        >
          <TextField
            size="small"
            label={t('Benutzername')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError('');
            }}
            error={!!error}
            helperText={error || undefined}
            disabled={busy}
            sx={{ flex: '1 1 220px', maxWidth: 360 }}
            slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false, maxLength: 64 } }}
          />
          <Button
            type="submit"
            variant="tonal"
            disabled={busy || !name.trim()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PersonAddAlt1Outlined />}
            sx={{ height: 40 }}
          >
            {t('Einladen')}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function AlbumDetail({
  albumId,
  info,
  refreshKey,
  onBack,
  onChanged,
}: {
  albumId: number;
  info?: UploadOptionsInfo;
  refreshKey: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { enqueue } = useUploads();
  const [album, setAlbum] = useState<Album | null>(null);
  const [statsTarget, setStatsTarget] = useState<StatsTarget | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetchAlbum(albumId)
      .then((res) => setAlbum(res.album))
      .catch((err) => {
        toast(err instanceof ApiError ? err.message : t('Das Album konnte nicht geladen werden.'), { variant: 'error' });
        onBack();
      });
  }, [albumId, toast, onBack]);

  useEffect(load, [load, refreshKey]);

  if (!album) {
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Skeleton variant="text" width={240} height={48} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1.5 }}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} variant="rounded" sx={{ aspectRatio: '1 / 1', height: 'auto' }} />
          ))}
        </Box>
      </Box>
    );
  }

  const items = album.items || [];
  const owner = album.role !== 'member';
  const shared = (album.members ?? album.memberList?.length ?? 0) > 0 || !owner;

  const remove = async (file: FileItem) => {
    try {
      const res = await removeFromAlbum(album.id, [file.id]);
      setAlbum(res.album);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    }
  };

  const setCover = async (file: FileItem) => {
    try {
      const res = await updateAlbum(album.id, { coverFileId: file.id });
      setAlbum(res.album);
      toast(t('Titelbild geändert'), { variant: 'success' });
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    }
  };

  const move = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setAlbum({ ...album, items: next });
    try {
      const res = await reorderAlbum(
        album.id,
        next.map((file) => file.id)
      );
      setAlbum(res.album);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Die Reihenfolge konnte nicht gespeichert werden.'), { variant: 'error' });
      load();
    }
  };

  const remove_ = async () => {
    const ok = await confirm({
      title: t('Album löschen?'),
      message: shared
        ? t('„{album}“ wird für alle gelöscht, mit denen du es teilst. Die Dateien darin bleiben erhalten.', { album: album.title })
        : t('„{album}“ wird gelöscht. Die Dateien darin bleiben erhalten.', { album: album.title }),
      confirmLabel: t('Löschen'),
    });
    if (!ok) return;
    try {
      await deleteAlbum(album.id);
      toast(t('Album gelöscht'), { variant: 'success' });
      onChanged();
      onBack();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: t('Album verlassen?'),
      message: t('Deine Dateien verschwinden aus „{album}“, bleiben aber in deinem Konto.', { album: album.title }),
      confirmLabel: t('Verlassen'),
    });
    if (!ok) return;
    try {
      await leaveAlbum(album.id);
      toast(t('Du bist nicht mehr dabei'), { variant: 'success' });
      onChanged();
      onBack();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das hat nicht geklappt.'), { variant: 'error' });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Tooltip title={t('Zurück zu allen Alben')}>
          <IconButton onClick={onBack} aria-label={t('Zurück zu allen Alben')} sx={{ mt: 0.25 }}>
            <ArrowBackRounded />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h4" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {album.title}
            <Box component="span" sx={{ color: 'text.secondary', display: 'inline-flex' }}>
              <VisibilityIcon album={album} />
            </Box>
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {[
              tn(items.length, '1 Datei', '{count} Dateien'),
              t('geändert {when}', { when: relativeMs(album.updatedAt) }),
              !owner && album.owner ? t('von {name}', { name: album.owner }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
          {album.description && (
            <Typography variant="body1" sx={{ mt: 1, maxWidth: 720, whiteSpace: 'pre-line' }}>
              {album.description}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {album.visibility !== 'private' && (
            <>
              <CopyTextButton value={album.url} message={t('Albumlink kopiert')} variant="tonal">
                {t('Link kopieren')}
              </CopyTextButton>
              <Button component="a" href={album.url} target="_blank" rel="noopener" startIcon={<OpenInNewRounded />}>
                {t('Ansehen')}
              </Button>
            </>
          )}
          <Button startIcon={<CloudUploadRounded />} onClick={() => picker.current?.click()}>
            {t('Hochladen')}
          </Button>
          {owner && (
            <Button startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
              {t('Bearbeiten')}
            </Button>
          )}
          {info?.stats && album.visibility !== 'private' && (
            <Button startIcon={<BarChartRounded />} onClick={() => setStatsTarget({ kind: 'album', id: album.id, title: album.title })}>
              {t('Statistik')}
            </Button>
          )}
          {info?.zip && items.length > 0 && (
            <Button component="a" href={albumZipUrl(album.id)} download startIcon={<FolderZipOutlined />}>
              {t('ZIP')}
            </Button>
          )}
          {owner ? (
            <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={remove_}>
              {t('Löschen')}
            </Button>
          ) : (
            <Button color="error" startIcon={<LogoutRounded />} onClick={leave}>
              {t('Verlassen')}
            </Button>
          )}
        </Box>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const picked = Array.from(event.target.files || []);
            event.target.value = '';
            if (picked.length) enqueue(picked, { album: album.id });
          }}
        />
      </Box>

      <MembersPanel album={album} onChange={(updated) => setAlbum(updated)} />

      {album.blocked && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('Die Moderation hat dieses Album gesperrt. Besucher sehen es nicht mehr.')}
          {album.blocked.reason ? ` ${t('Grund: {reason}', { reason: album.blocked.reason })}` : ''}
        </Alert>
      )}

      {items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <CollectionsOutlined sx={{ fontSize: 48, opacity: 0.6 }} />
          <Typography variant="body1" sx={{ mt: 1.5 }}>
            {t('Noch leer. Lade Dateien direkt hier hoch oder wähle im Bereich „Dateien“ welche aus und lege sie in dieses Album.')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(auto-fill, minmax(160px, 1fr))' }, gap: 1.5 }}>
          {items.map((file, index) => (
            <AlbumThumb
              key={file.id}
              file={file}
              isCover={album.coverFileId === file.id}
              onRemove={owner || file.mine ? () => remove(file) : undefined}
              onCover={owner ? () => setCover(file) : undefined}
              contributor={shared && file.username !== album.owner ? file.username : undefined}
              dragProps={
                owner
                  ? {
                      draggable: true,
                      onDragStart: () => setDragging(index),
                      onDragOver: (event: ReactDragEvent<HTMLDivElement>) => event.preventDefault(),
                      onDrop: () => {
                        if (dragging !== null) move(dragging, index);
                        setDragging(null);
                      },
                      onDragEnd: () => setDragging(null),
                      style: { opacity: dragging === index ? 0.4 : 1 },
                    }
                  : undefined
              }
            />
          ))}
        </Box>
      )}

      <StatsDialog target={statsTarget} onClose={() => setStatsTarget(null)} />
      <AlbumEditorDialog
        open={editing}
        album={album}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setAlbum({ ...album, ...saved });
          onChanged();
        }}
      />
    </Box>
  );
}

export function AlbumsView({
  openId,
  onOpen,
  info,
  refreshKey = 0,
}: {
  openId: number | null;
  onOpen: (id: number | null) => void;
  info?: UploadOptionsInfo;
  refreshKey?: number;
}) {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    listAlbums()
      .then((res) => setAlbums(res.albums))
      .catch((err) => {
        setAlbums([]);
        toast(err instanceof ApiError ? err.message : t('Die Alben konnten nicht geladen werden.'), { variant: 'error' });
      });
  }, [toast]);

  useEffect(load, [load, refreshKey]);

  if (openId) return <AlbumDetail albumId={openId} info={info} refreshKey={refreshKey} onBack={() => onOpen(null)} onChanged={load} />;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {albums ? tn(albums.length, '1 Album', '{count} Alben') : ' '}
        </Typography>
        <Button variant="tonal" startIcon={<AddRounded />} onClick={() => setCreating(true)}>
          {t('Neues Album')}
        </Button>
      </Box>
      {albums === null ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} variant="rounded" sx={{ aspectRatio: '4 / 3', height: 'auto' }} />
          ))}
        </Box>
      ) : albums.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: { xs: 8, md: 12 } }}>
          <Box
            sx={{
              width: 112,
              height: 112,
              mx: 'auto',
              borderRadius: '36px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: c.primaryContainer,
              color: c.onPrimaryContainer,
            }}
          >
            <CollectionsOutlined sx={{ fontSize: 52 }} />
          </Box>
          <Typography variant="h4" component="h2" sx={{ mt: 3 }}>
            {t('Noch keine Alben')}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1, maxWidth: 480, mx: 'auto' }}>
            {t('Fasse Dateien zu Alben zusammen und teile sie mit einem einzigen Link.')}
          </Typography>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)} sx={{ mt: 3 }}>
            {t('Album anlegen')}
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(auto-fill, minmax(220px, 1fr))' }, gap: 2 }}>
          {albums.map((album) => (
            <ButtonBase
              key={album.id}
              onClick={() => onOpen(album.id)}
              sx={{
                display: 'block',
                textAlign: 'left',
                borderRadius: `${radius.md}px`,
                '&:hover img': { transform: 'scale(1.03)' },
                '& img': { transition: `transform 500ms ${css.decelerate}` },
              }}
            >
              <AlbumCover album={album} />
              <Box sx={{ px: 0.5, pt: 1 }}>
                <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {album.title}
                  </Box>
                  <Box component="span" sx={{ color: 'text.secondary', display: 'inline-flex', flexShrink: 0 }}>
                    <VisibilityIcon album={album} />
                  </Box>
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Box component="span" sx={{ flexShrink: 0 }}>
                    {tn(album.files, '1 Datei', '{count} Dateien')}
                  </Box>
                  {album.role === 'member' && album.owner ? (
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t('von {name}', { name: album.owner })}
                    </Box>
                  ) : album.members ? (
                    <Tooltip title={tn(album.members, 'Mit 1 Person geteilt', 'Mit {count} Personen geteilt')}>
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                        <GroupOutlined sx={{ fontSize: 16 }} />
                        {album.members}
                      </Box>
                    </Tooltip>
                  ) : null}
                </Typography>
              </Box>
            </ButtonBase>
          ))}
        </Box>
      )}
      <AlbumEditorDialog
        open={creating}
        album={null}
        onClose={() => setCreating(false)}
        onSaved={(album) => {
          load();
          onOpen(album.id);
        }}
      />
    </Box>
  );
}
