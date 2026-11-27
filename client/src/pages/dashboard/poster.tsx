import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import PhotoCameraBackOutlined from '@mui/icons-material/PhotoCameraBackOutlined';
import type { FileItem } from '../../lib/types';
import { choosePosterFrame, errorMessage, resetPoster, uploadPoster } from '../../lib/api';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const pad = (value: number) => String(value).padStart(2, '0');
const clock = (seconds: number) => {
  const total = Math.max(0, seconds);
  const whole = Math.floor(total);
  return `${Math.floor(whole / 60)}:${pad(whole % 60)}.${Math.floor((total - whole) * 10)}`;
};

export function PosterDialog({
  file,
  onClose,
  onSaved,
}: {
  file: FileItem | null;
  onClose: () => void;
  onSaved: (file: FileItem) => void;
}) {
  const toast = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [time, setTime] = useState(0);
  const [busy, setBusy] = useState<'frame' | 'image' | 'reset' | null>(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<FileItem | null>(file);

  useEffect(() => {
    setCurrent(file);
    setTime(0);
    setError('');
  }, [file]);

  const done = (updated: FileItem, message: string) => {
    setCurrent(updated);
    onSaved(updated);
    toast(message, { variant: 'success' });
  };

  const take = async () => {
    if (!current) return;
    setBusy('frame');
    setError('');
    try {
      const { file: updated } = await choosePosterFrame(current.id, video.current?.currentTime ?? time);
      done(updated, t('Vorschaubild gespeichert'));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const upload = async (image: File) => {
    if (!current) return;
    setBusy('image');
    setError('');
    try {
      const { file: updated } = await uploadPoster(current.id, image);
      done(updated, t('Eigenes Vorschaubild gespeichert'));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!current) return;
    setBusy('reset');
    setError('');
    try {
      const { file: updated } = await resetPoster(current.id);
      done(updated, t('Vorschaubild wieder automatisch'));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const chosen = current?.poster || null;
  const status = !chosen
    ? t('Gerade automatisch aus dem Video.')
    : chosen.custom
      ? t('Gerade ein eigenes Bild.')
      : chosen.at !== null
        ? t('Gerade das Bild bei {time}.', { time: clock(chosen.at / 1000) })
        : t('Gerade automatisch aus dem Video.');

  return (
    <Dialog
      open={Boolean(file)}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="poster-title"
      sx={{ zIndex: 1550 }}
    >
      <DialogTitle id="poster-title">{t('Vorschaubild wählen')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t(
            'Spul zu der Stelle, die als Vorschau in Kacheln, Einbettungen und Link-Vorschauen erscheinen soll. Oder nimm ein eigenes Bild.'
          )}
        </Typography>
        {current && (
          <Box
            component="video"
            ref={video}
            src={current.urls.playback || current.urls.direct}
            controls
            playsInline
            muted
            preload="metadata"
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onSeeked={(event) => setTime(event.currentTarget.currentTime)}
            sx={{ width: '100%', maxHeight: '48vh', borderRadius: `${radius.md}px`, bgcolor: '#000' }}
          />
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={busy === 'frame' ? <CircularProgress size={16} color="inherit" /> : <PhotoCameraBackOutlined />}
            onClick={take}
            disabled={Boolean(busy)}
          >
            {t('Bild bei {time} nehmen', { time: clock(time) })}
          </Button>
          <Button
            variant="tonal"
            startIcon={busy === 'image' ? <CircularProgress size={16} color="inherit" /> : <AddPhotoAlternateOutlined />}
            onClick={() => input.current?.click()}
            disabled={Boolean(busy)}
          >
            {t('Eigenes Bild')}
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = '';
              if (picked) void upload(picked);
            }}
          />
        </Box>
        {current && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: `${radius.md}px`,
              bgcolor: c.surfaceContainerHigh,
            }}
          >
            <Box
              component="img"
              src={current.urls.preview}
              alt={t('Aktuelles Vorschaubild')}
              sx={{ width: 96, height: 54, objectFit: 'cover', borderRadius: `${radius.xs}px`, bgcolor: '#000', flexShrink: 0 }}
            />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
              {status}
            </Typography>
            {chosen && (chosen.custom || chosen.at !== null) && (
              <Button
                size="small"
                startIcon={busy === 'reset' ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeOutlined />}
                onClick={reset}
                disabled={Boolean(busy)}
              >
                {t('Automatisch')}
              </Button>
            )}
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={Boolean(busy)}>
          {t('Fertig')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
