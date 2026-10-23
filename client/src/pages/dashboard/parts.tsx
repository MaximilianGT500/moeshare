import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import RemoveDoneRounded from '@mui/icons-material/RemoveDoneRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import AddLinkRounded from '@mui/icons-material/AddLinkRounded';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import SellOutlined from '@mui/icons-material/SellOutlined';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined';
import NoteAddOutlined from '@mui/icons-material/NoteAddOutlined';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import CropRotateRounded from '@mui/icons-material/CropRotateRounded';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import AccountBoxOutlined from '@mui/icons-material/AccountBoxOutlined';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import type { ExpiryChoice, FileItem, TagCount } from '../../lib/types';
import { ApiError, uploadFromUrl, type UploadOptions } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { ExpirySelect, TagInput, WarningLabelInput } from '../../components/ShareOptions';
import { PasswordField } from '../../components/PasswordField';
import { ShareMenuItems } from '../../components/ShareList';
import { CopyTextButton } from '../../components/CopyButton';
import { GrowTransition } from '../../components/transitions';
import { c, radius } from '../../theme/tokens';

export function FileMenu({
  file,
  anchor,
  onClose,
  onPreview,
  onSelect,
  onDelete,
  onEdit,
  onAlbum,
  onStats,
  onImageEdit,
  onClip,
  onVersions,
  onWarning,
  trash = false,
}: {
  file: FileItem | null;
  anchor: HTMLElement | { x: number; y: number } | null;
  onClose: () => void;
  onPreview: (file: FileItem) => void;
  onSelect: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
  onEdit?: (file: FileItem) => void;
  onAlbum?: (file: FileItem) => void;
  onStats?: (file: FileItem) => void;
  onImageEdit?: (file: FileItem) => void;
  onClip?: (file: FileItem) => void;
  onVersions?: (file: FileItem) => void;
  onWarning?: (file: FileItem) => void;
  trash?: boolean;
}) {
  const open = !!file && !!anchor;
  const isPoint = !!anchor && !(anchor instanceof HTMLElement);
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorEl={!isPoint ? (anchor as HTMLElement | null) : null}
      anchorReference={isPoint ? 'anchorPosition' : 'anchorEl'}
      anchorPosition={isPoint ? { top: (anchor as { y: number }).y, left: (anchor as { x: number }).x } : undefined}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={isPoint ? { vertical: 'top', horizontal: 'left' } : { vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 300 } } }}
    >
      {file && [
        <MenuItem
          key="preview"
          onClick={() => {
            onClose();
            onPreview(file);
          }}
        >
          <ListItemIcon>
            <OpenInFullRounded />
          </ListItemIcon>
          {t('Vorschau')}
        </MenuItem>,
        ...(onEdit
          ? [
              <MenuItem
                key="edit"
                onClick={() => {
                  onClose();
                  onEdit(file);
                }}
              >
                <ListItemIcon>
                  <EditOutlined />
                </ListItemIcon>
                {t('Bearbeiten')}
              </MenuItem>,
            ]
          : []),
        ...(onImageEdit
          ? [
              <MenuItem
                key="image"
                onClick={() => {
                  onClose();
                  onImageEdit(file);
                }}
              >
                <ListItemIcon>
                  <CropRotateRounded />
                </ListItemIcon>
                {t('Bild bearbeiten')}
              </MenuItem>,
            ]
          : []),
        ...(onClip
          ? [
              <MenuItem
                key="clip"
                onClick={() => {
                  onClose();
                  onClip(file);
                }}
              >
                <ListItemIcon>
                  <ContentCutRounded />
                </ListItemIcon>
                {t('Kürzen oder GIF machen')}
              </MenuItem>,
            ]
          : []),
        ...(onVersions
          ? [
              <MenuItem
                key="versions"
                onClick={() => {
                  onClose();
                  onVersions(file);
                }}
              >
                <ListItemIcon>
                  <HistoryRounded />
                </ListItemIcon>
                {file.versions ? t('Versionen ({count})', { count: file.versions + 1 }) : t('Versionen')}
              </MenuItem>,
            ]
          : []),
        ...(onAlbum
          ? [
              <MenuItem
                key="album"
                onClick={() => {
                  onClose();
                  onAlbum(file);
                }}
              >
                <ListItemIcon>
                  <CollectionsOutlined />
                </ListItemIcon>
                {t('Zu einem Album hinzufügen')}
              </MenuItem>,
            ]
          : []),
        ...(onStats
          ? [
              <MenuItem
                key="stats"
                onClick={() => {
                  onClose();
                  onStats(file);
                }}
              >
                <ListItemIcon>
                  <BarChartRounded />
                </ListItemIcon>
                {t('Statistik')}
              </MenuItem>,
            ]
          : []),
        ...(onWarning
          ? [
              <MenuItem
                key="warning"
                onClick={() => {
                  onClose();
                  onWarning(file);
                }}
              >
                <ListItemIcon>
                  <WarningAmberRounded />
                </ListItemIcon>
                {typeof file.warning === 'string' ? t('Inhaltswarnung entfernen') : t('Inhaltswarnung setzen')}
              </MenuItem>,
            ]
          : []),
        <MenuItem key="page" component="a" href={file.urls.view} target="_blank" rel="noopener" onClick={onClose}>
          <ListItemIcon>
            <OpenInNewRounded />
          </ListItemIcon>
          {t('Ansichtsseite öffnen')}
        </MenuItem>,
        <MenuItem key="download" component="a" href={file.urls.download} onClick={onClose}>
          <ListItemIcon>
            <DownloadRounded />
          </ListItemIcon>
          {t('Herunterladen')}
        </MenuItem>,
        <MenuItem
          key="select"
          onClick={() => {
            onClose();
            onSelect(file);
          }}
        >
          <ListItemIcon>
            <CheckCircleOutlineRounded />
          </ListItemIcon>
          {t('Auswählen')}
        </MenuItem>,
        <Divider key="d1" />,
        <ShareMenuItems key="share" file={file} onDone={onClose} />,
        <Divider key="d2" />,
        <MenuItem
          key="delete"
          onClick={() => {
            onClose();
            onDelete(file);
          }}
          sx={{ color: c.error }}
        >
          <ListItemIcon sx={{ color: c.error }}>
            <DeleteOutlineRounded />
          </ListItemIcon>
          {trash ? t('In den Papierkorb') : t('Löschen')}
        </MenuItem>,
      ]}
    </Menu>
  );
}

export type BulkAction = 'tag' | 'untag' | 'expire' | 'protect' | 'unprotect' | 'warn';
export type QuickAction = 'list' | 'unlist' | 'unwarn';

export function SelectionBar({
  count,
  allSelected,
  links,
  onClear,
  onSelectAll,
  onDelete,
  onAlbum,
  onBulk,
  onQuick,
  zipHref,
  trash = false,
  profiles = false,
}: {
  count: number;
  allSelected: boolean;
  links: string;
  onClear: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  onAlbum?: () => void;
  onBulk?: (action: BulkAction) => void;
  onQuick?: (action: QuickAction) => void;
  zipHref?: string;
  trash?: boolean;
  profiles?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const bulk = (action: BulkAction) => {
    setAnchor(null);
    onBulk?.(action);
  };
  const quick = (action: QuickAction) => {
    setAnchor(null);
    onQuick?.(action);
  };
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        height: { xs: 48, md: 56 },
        pl: 0.5,
        pr: 1,
        borderRadius: `${radius.full}px`,
        bgcolor: c.secondaryContainer,
        color: c.onSecondaryContainer,
      }}
    >
      <Tooltip title={t('Auswahl beenden (Esc)')}>
        <IconButton aria-label={t('Auswahl beenden')} onClick={onClear} sx={{ color: 'inherit' }}>
          <CloseRounded />
        </IconButton>
      </Tooltip>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap aria-live="polite">
        {count === 0 ? t('Dateien auswählen') : t('{count} ausgewählt', { count: formatNumber(count) })}
      </Typography>
      <Tooltip title={allSelected ? t('Auswahl aufheben') : t('Alle geladenen auswählen')}>
        <IconButton aria-label={allSelected ? t('Auswahl aufheben') : t('Alle auswählen')} onClick={onSelectAll} sx={{ color: 'inherit' }}>
          {allSelected ? <RemoveDoneRounded /> : <DoneAllRounded />}
        </IconButton>
      </Tooltip>
      <CopyTextButton
        value={links}
        disabled={count === 0}
        message={tn(count, 'Link kopiert', '{count} Links kopiert')}
        icon={<LinkRounded fontSize="inherit" />}
        sx={{ color: 'inherit', display: { xs: 'none', sm: 'inline-flex' } }}
      >
        {t('Links kopieren')}
      </CopyTextButton>
      {onAlbum && (
        <Tooltip title={t('Zu einem Album hinzufügen')}>
          <span>
            <IconButton aria-label={t('Zu einem Album hinzufügen')} onClick={onAlbum} disabled={count === 0} sx={{ color: 'inherit' }}>
              <CollectionsOutlined />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {zipHref !== undefined && (
        <Tooltip title={t('Als ZIP herunterladen')}>
          <span>
            <IconButton
              component="a"
              href={count === 0 ? undefined : zipHref}
              download
              aria-label={t('Als ZIP herunterladen')}
              disabled={count === 0}
              sx={{ color: 'inherit' }}
            >
              <FolderZipOutlined />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {onBulk && (
        <>
          <Tooltip title={t('Weitere Aktionen')}>
            <span>
              <IconButton
                aria-label={t('Weitere Aktionen')}
                aria-haspopup="menu"
                disabled={count === 0}
                onClick={(event) => setAnchor(event.currentTarget)}
                sx={{ color: 'inherit' }}
              >
                <MoreVertRounded />
              </IconButton>
            </span>
          </Tooltip>
          <Menu
            anchorEl={anchor}
            open={!!anchor}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={() => bulk('tag')}>
              <ListItemIcon>
                <SellOutlined />
              </ListItemIcon>
              {t('Tags hinzufügen')}
            </MenuItem>
            <MenuItem onClick={() => bulk('untag')}>
              <ListItemIcon>
                <SellOutlined />
              </ListItemIcon>
              {t('Tags entfernen')}
            </MenuItem>
            <MenuItem onClick={() => bulk('expire')}>
              <ListItemIcon>
                <TimerOutlined />
              </ListItemIcon>
              {t('Ablauf festlegen')}
            </MenuItem>
            <MenuItem onClick={() => bulk('protect')}>
              <ListItemIcon>
                <LockOutlined />
              </ListItemIcon>
              {t('Mit Passwort schützen')}
            </MenuItem>
            <MenuItem onClick={() => bulk('unprotect')}>
              <ListItemIcon>
                <LockOpenOutlined />
              </ListItemIcon>
              {t('Schutz entfernen')}
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => bulk('warn')}>
              <ListItemIcon>
                <WarningAmberRounded />
              </ListItemIcon>
              {t('Inhaltswarnung setzen')}
            </MenuItem>
            {onQuick && (
              <MenuItem onClick={() => quick('unwarn')}>
                <ListItemIcon>
                  <WarningAmberRounded />
                </ListItemIcon>
                {t('Inhaltswarnung entfernen')}
              </MenuItem>
            )}
            {onQuick && profiles && <Divider />}
            {onQuick && profiles && (
              <MenuItem onClick={() => quick('list')}>
                <ListItemIcon>
                  <AccountBoxOutlined />
                </ListItemIcon>
                {t('Im Profil zeigen')}
              </MenuItem>
            )}
            {onQuick && profiles && (
              <MenuItem onClick={() => quick('unlist')}>
                <ListItemIcon>
                  <AccountBoxOutlined />
                </ListItemIcon>
                {t('Aus dem Profil nehmen')}
              </MenuItem>
            )}
          </Menu>
        </>
      )}
      <Button
        variant="contained"
        color="error"
        disabled={count === 0}
        onClick={onDelete}
        startIcon={<DeleteOutlineRounded />}
        sx={{ ml: 0.5 }}
        aria-label={trash ? t('In den Papierkorb') : undefined}
      >
        {t('Löschen')}
      </Button>
    </Box>
  );
}

export function BulkDialog({
  action,
  count,
  tags,
  maxExpiry,
  onClose,
  onSubmit,
}: {
  action: BulkAction | null;
  count: number;
  tags: TagCount[];
  maxExpiry: ExpiryChoice;
  onClose: () => void;
  onSubmit: (action: BulkAction, extra: { tags?: string[]; expires?: string; password?: string; warning?: string }) => Promise<void>;
}) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [expires, setExpires] = useState<ExpiryChoice | ''>('7d');
  const [password, setPassword] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  if (!action) return null;

  const titles: Record<BulkAction, string> = {
    tag: t('Tags hinzufügen'),
    untag: t('Tags entfernen'),
    expire: t('Ablauf festlegen'),
    protect: t('Mit Passwort schützen'),
    unprotect: t('Schutz entfernen'),
    warn: t('Inhaltswarnung setzen'),
  };
  const valid =
    action === 'tag' || action === 'untag'
      ? selectedTags.length > 0
      : action === 'expire'
        ? !!expires
        : action === 'protect'
          ? !!password
          : true;

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(action, {
        tags: action === 'tag' || action === 'untag' ? selectedTags : undefined,
        expires: action === 'expire' ? expires || 'never' : undefined,
        password: action === 'protect' ? password : undefined,
        warning: action === 'warn' ? warning.trim() : undefined,
      });
      setSelectedTags([]);
      setPassword('');
      setWarning('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="bulk-title"
    >
      <DialogTitle id="bulk-title">{titles[action]}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {tn(count, 'Gilt für 1 ausgewählte Datei.', 'Gilt für {count} ausgewählte Dateien.')}
          {action === 'unprotect' ? ` ${t('Passwort und Einmal-Abruf werden entfernt.')}` : ''}
          {action === 'warn' ? ` ${t('Bilder und Videos erscheinen unscharf, bis jemand bewusst draufklickt.')}` : ''}
        </Typography>
        {(action === 'tag' || action === 'untag') && <TagInput value={selectedTags} onChange={setSelectedTags} suggestions={tags} />}
        {action === 'expire' && <ExpirySelect value={expires} onChange={setExpires} max={maxExpiry} label={t('Löschen nach')} />}
        {action === 'protect' && (
          <PasswordField label={t('Passwort')} value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
        )}
        {action === 'warn' && <WarningLabelInput value={warning} onChange={setWarning} autoFocus />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!valid || busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t('Übernehmen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function UrlUploadDialog({
  open,
  options = {},
  onClose,
  onDone,
}: {
  open: boolean;
  options?: UploadOptions;
  onClose: () => void;
  onDone: () => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = url.trim();
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      setError(t('Gib eine vollständige Adresse ein, die mit http:// oder https:// beginnt.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await uploadFromUrl(value, options);
      setUrl('');
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Die Datei konnte nicht geladen werden.'));
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
      aria-labelledby="url-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <AddLinkRounded sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="url-title" sx={{ textAlign: 'center' }}>
        {t('Von URL hochladen')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2.5 }}>
          {t('Der Server lädt die Datei herunter und speichert sie wie einen normalen Upload.')}
        </Typography>
        <TextField
          autoFocus
          fullWidth
          label={t('Adresse der Datei')}
          placeholder="https://beispiel.de/bild.png"
          value={url}
          error={!!error}
          helperText={error || ' '}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          slotProps={{ htmlInput: { inputMode: 'url', spellCheck: false, autoComplete: 'off' } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || !url.trim()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CloudUploadRounded />}
        >
          {busy ? t('Wird geladen') : t('Hochladen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function EmptyState({
  filtered,
  query,
  onReset,
  onPick,
  onUrl,
  onText,
}: {
  filtered: boolean;
  query: string;
  onReset: () => void;
  onPick: () => void;
  onUrl?: () => void;
  onText?: () => void;
}) {
  return (
    <Box sx={{ textAlign: 'center', py: { xs: 8, md: 12 }, px: 2 }}>
      <Box
        sx={{
          width: 112,
          height: 112,
          mx: 'auto',
          borderRadius: '36px',
          display: 'grid',
          placeItems: 'center',
          bgcolor: filtered ? c.surfaceContainerHigh : c.primaryContainer,
          color: filtered ? c.onSurfaceVariant : c.onPrimaryContainer,
          '& svg': { fontSize: 52 },
        }}
      >
        {filtered ? <SearchOffRounded /> : <CloudUploadRounded />}
      </Box>
      <Typography variant="h4" component="h2" sx={{ mt: 3 }}>
        {filtered ? t('Nichts gefunden') : t('Noch keine Dateien')}
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1, maxWidth: 480, mx: 'auto' }}>
        {filtered
          ? query
            ? t('Keine Datei passt zu „{query}“. Prüfe die Schreibweise oder setze die Filter zurück.', { query })
            : t('In dieser Kategorie liegt noch nichts.')
          : t('Zieh Dateien hierher, füge einen Screenshot mit Strg+V ein oder lade über ShareX hoch.')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 3, flexWrap: 'wrap' }}>
        {filtered ? (
          <Button variant="tonal" onClick={onReset}>
            {t('Filter zurücksetzen')}
          </Button>
        ) : (
          <>
            <Button variant="contained" startIcon={<CloudUploadRounded />} onClick={onPick}>
              {t('Dateien auswählen')}
            </Button>
            {onText && (
              <Button variant="tonal" startIcon={<NoteAddOutlined />} onClick={onText}>
                {t('Text schreiben')}
              </Button>
            )}
            {onUrl && (
              <Button variant="tonal" startIcon={<AddLinkRounded />} onClick={onUrl}>
                {t('Von URL')}
              </Button>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
