import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import { errorMessage, fileContentUrl, profileIconFromFile, uploadProfileIcon, type AvatarCrop } from '../lib/api';
import type { FileItem, ProfileIcon } from '../lib/types';
import { formatBytes } from '../lib/format';
import { t } from '../lib/i18n';
import { ACCEPT, Cropper, UploadPicker, type Source } from './AvatarEditor';
import { GrowTransition } from './transitions';
import { c, radius } from '../theme/tokens';

export function IconUploadDialog({
  open,
  onClose,
  onSaved,
  maxBytes,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (icon: ProfileIcon) => void;
  maxBytes: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [picking, setPicking] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const crop = useRef<AvatarCrop>({ x: 0, y: 0, size: 0 });

  const reset = () => {
    setSource((previous) => {
      if (previous && previous.blob) URL.revokeObjectURL(previous.url);
      return null;
    });
    setPicking(false);
    setReady(false);
    setError('');
  };

  useEffect(() => () => reset(), []);

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('Das ist kein Bild. Nimm ein JPG, PNG, WebP, AVIF oder GIF.'));
      return;
    }
    if (file.size > maxBytes) {
      setError(t('Das Bild ist zu groß. Erlaubt sind bis zu {size}.', { size: formatBytes(maxBytes) }));
      return;
    }
    reset();
    setSource({ url: URL.createObjectURL(file), blob: file, name: file.name });
  };

  const pickUpload = (file: FileItem) => {
    reset();
    setSource({ url: fileContentUrl(file.id), fileId: file.id, name: file.title || file.originalName || file.filename });
  };

  const save = async () => {
    if (!source) return;
    setBusy(true);
    setError('');
    try {
      const result = source.blob
        ? await uploadProfileIcon(source.blob, crop.current)
        : await profileIconFromFile(source.fileId || 0, crop.current);
      onSaved(result.icon);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const onCrop = useCallback((next: AvatarCrop) => {
    crop.current = next;
  }, []);

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="xs"
      fullWidth
      slots={{ transition: GrowTransition }}
      slotProps={{ transition: { onExited: reset } }}
      aria-labelledby="icon-upload-title"
    >
      <DialogTitle id="icon-upload-title">{t('Eigenes Symbol')}</DialogTitle>
      <DialogContent
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer.files?.[0]);
        }}
      >
        {source ? (
          <Cropper
            key={source.url}
            source={source}
            onReady={() => setReady(true)}
            onFailed={() => {
              setReady(false);
              setError(t('Dieses Bild kann der Browser nicht anzeigen. Nimm ein JPG, PNG, WebP oder GIF.'));
            }}
            onChange={onCrop}
          />
        ) : picking ? (
          <UploadPicker onPick={pickUpload} pickLabel={(name) => t('{name} als Symbol nehmen', { name })} />
        ) : (
          <Box
            sx={{
              display: 'grid',
              justifyItems: 'center',
              gap: 2,
              py: 2,
              borderRadius: `${radius.lg}px`,
              outline: dragging ? `2px dashed ${c.primary}` : '2px dashed transparent',
              bgcolor: dragging ? c.primaryContainer : 'transparent',
              transition: 'background-color 160ms ease',
            }}
          >
            <Box
              sx={{
                width: 88,
                height: 88,
                borderRadius: `${radius.lg}px`,
                display: 'grid',
                placeItems: 'center',
                bgcolor: c.secondaryContainer,
                color: c.onSecondaryContainer,
                '& svg': { fontSize: 40 },
              }}
            >
              <AddPhotoAlternateOutlined />
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 320 }}>
              {t(
                'Wähle ein Bild oder zieh es hierher. Es wird quadratisch zugeschnitten und klein gespeichert, ideal sind Logos und Symbole.'
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="contained" startIcon={<PhotoCameraRounded />} onClick={() => input.current?.click()}>
                {t('Bild auswählen')}
              </Button>
              <Button variant="tonal" startIcon={<CollectionsOutlined />} onClick={() => setPicking(true)}>
                {t('Aus deinen Uploads')}
              </Button>
            </Box>
          </Box>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {error && (
          <Typography variant="body2" role="alert" sx={{ color: c.error, mt: 2, textAlign: 'center' }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {(source || picking) && (
          <Button startIcon={<ArrowBackRounded />} onClick={reset} disabled={busy} sx={{ mr: 'auto' }}>
            {t('Anderes Bild')}
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        {source && (
          <Button
            variant="contained"
            onClick={save}
            disabled={!ready || busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {t('Speichern')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
