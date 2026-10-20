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
import type { FileItem } from '../../lib/types';
import { ApiError, uploadFromUrl } from '../../lib/api';
import { formatNumber } from '../../lib/format';
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
}: {
  file: FileItem | null;
  anchor: HTMLElement | { x: number; y: number } | null;
  onClose: () => void;
  onPreview: (file: FileItem) => void;
  onSelect: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
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
          Vorschau
        </MenuItem>,
        <MenuItem key="page" component="a" href={file.urls.view} target="_blank" rel="noopener" onClick={onClose}>
          <ListItemIcon>
            <OpenInNewRounded />
          </ListItemIcon>
          Ansichtsseite öffnen
        </MenuItem>,
        <MenuItem key="download" component="a" href={file.urls.download} onClick={onClose}>
          <ListItemIcon>
            <DownloadRounded />
          </ListItemIcon>
          Herunterladen
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
          Auswählen
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
          Löschen
        </MenuItem>,
      ]}
    </Menu>
  );
}

export function SelectionBar({
  count,
  allSelected,
  links,
  onClear,
  onSelectAll,
  onDelete,
}: {
  count: number;
  allSelected: boolean;
  links: string;
  onClear: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
}) {
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
      <Tooltip title="Auswahl beenden (Esc)">
        <IconButton aria-label="Auswahl beenden" onClick={onClear} sx={{ color: 'inherit' }}>
          <CloseRounded />
        </IconButton>
      </Tooltip>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap aria-live="polite">
        {count === 0 ? 'Dateien auswählen' : `${formatNumber(count)} ausgewählt`}
      </Typography>
      <Tooltip title={allSelected ? 'Auswahl aufheben' : 'Alle geladenen auswählen'}>
        <IconButton aria-label={allSelected ? 'Auswahl aufheben' : 'Alle auswählen'} onClick={onSelectAll} sx={{ color: 'inherit' }}>
          {allSelected ? <RemoveDoneRounded /> : <DoneAllRounded />}
        </IconButton>
      </Tooltip>
      <CopyTextButton
        value={links}
        disabled={count === 0}
        message={count === 1 ? 'Link kopiert' : `${formatNumber(count)} Links kopiert`}
        icon={<LinkRounded fontSize="inherit" />}
        sx={{ color: 'inherit', display: { xs: 'none', sm: 'inline-flex' } }}
      >
        Links kopieren
      </CopyTextButton>
      <Button
        variant="contained"
        color="error"
        disabled={count === 0}
        onClick={onDelete}
        startIcon={<DeleteOutlineRounded />}
        sx={{ ml: 0.5 }}
      >
        Löschen
      </Button>
    </Box>
  );
}

export function UrlUploadDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = url.trim();
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      setError('Gib eine vollständige Adresse ein, die mit http:// oder https:// beginnt.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await uploadFromUrl(value);
      setUrl('');
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Die Datei konnte nicht geladen werden.');
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
        Von URL hochladen
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2.5 }}>
          Der Server lädt die Datei herunter und speichert sie wie einen normalen Upload.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          label="Adresse der Datei"
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
          Abbrechen
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || !url.trim()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CloudUploadRounded />}
        >
          {busy ? 'Wird geladen' : 'Hochladen'}
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
}: {
  filtered: boolean;
  query: string;
  onReset: () => void;
  onPick: () => void;
  onUrl?: () => void;
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
        {filtered ? 'Nichts gefunden' : 'Noch keine Dateien'}
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1, maxWidth: 480, mx: 'auto' }}>
        {filtered
          ? query
            ? `Keine Datei passt zu „${query}“. Prüfe die Schreibweise oder setze die Filter zurück.`
            : 'In dieser Kategorie liegt noch nichts.'
          : 'Zieh Dateien hierher, füge einen Screenshot mit Strg+V ein oder lade über ShareX hoch.'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 3, flexWrap: 'wrap' }}>
        {filtered ? (
          <Button variant="tonal" onClick={onReset}>
            Filter zurücksetzen
          </Button>
        ) : (
          <>
            <Button variant="contained" startIcon={<CloudUploadRounded />} onClick={onPick}>
              Dateien auswählen
            </Button>
            {onUrl && (
              <Button variant="tonal" startIcon={<AddLinkRounded />} onClick={onUrl}>
                Von URL
              </Button>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
