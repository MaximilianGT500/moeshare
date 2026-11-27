import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { readBoot } from '../../lib/boot';
import type { PhoneBoot, PublicPhone } from '../../lib/types';
import { ApiError, errorMessage, fetchPublicPhone, uploadFromPhone } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import { AmbientBackdrop } from '../../components/Ambient';
import { BrandMark } from '../../components/BrandMark';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { mix } from '../../lib/color';
import { c, ease, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

type ItemState = 'waiting' | 'uploading' | 'done' | 'error';

interface QueueItem {
  id: number;
  file: File;
  state: ItemState;
  progress: number;
  error: string;
}

const codeFromPath = () => decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '');

function minutesLeft(expiresAt: number | null, now: number) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((expiresAt - now) / 60000));
}

function QueueRow({ item, onRetry, onRemove }: { item: QueueItem; onRetry: () => void; onRemove: () => void }) {
  return (
    <m.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: ease.emphasizedDecelerate }}
      style={{ listStyle: 'none' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
        <Box sx={{ display: 'flex', color: item.state === 'done' ? c.success : item.state === 'error' ? c.error : c.onSurfaceVariant }}>
          {item.state === 'done' ? (
            <CheckCircleRounded />
          ) : item.state === 'error' ? (
            <ErrorOutlineRounded />
          ) : item.state === 'uploading' ? (
            <CircularProgress size={22} variant="determinate" value={Math.max(4, item.progress * 100)} />
          ) : (
            <CloudUploadRounded />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {item.file.name}
          </Typography>
          {item.state === 'uploading' ? (
            <LinearProgress
              variant="determinate"
              value={item.progress * 100}
              sx={{ mt: 0.75, height: 4, borderRadius: `${radius.full}px` }}
            />
          ) : (
            <Typography variant="caption" sx={{ color: item.state === 'error' ? c.error : 'text.secondary' }}>
              {item.state === 'error'
                ? item.error
                : item.state === 'done'
                  ? t('Am Rechner angekommen, {size}', { size: formatBytes(item.file.size) })
                  : formatBytes(item.file.size)}
            </Typography>
          )}
        </Box>
        {item.state === 'error' && (
          <Tooltip title={t('Erneut versuchen')}>
            <IconButton onClick={onRetry} aria-label={t('Erneut versuchen')}>
              <ReplayRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {(item.state === 'waiting' || item.state === 'error') && (
          <Tooltip title={t('Entfernen')}>
            <IconButton onClick={onRemove} aria-label={t('Entfernen')}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </m.li>
  );
}

function PickButton({
  icon,
  label,
  hint,
  onClick,
  primary = false,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 2,
        width: '100%',
        minHeight: 76,
        px: 2.5,
        py: 2,
        textAlign: 'left',
        borderRadius: `${radius.lg}px`,
        bgcolor: primary ? c.primary : mix(c.surfaceContainerHighest, 85),
        color: primary ? c.onPrimary : c.onSurface,
        transition: 'transform 120ms, background-color 150ms',
        '&:active': { transform: 'scale(0.985)' },
        '&.Mui-focusVisible': { outline: `3px solid ${c.primary}`, outlineOffset: 3 },
      }}
    >
      <Box sx={{ display: 'flex', fontSize: 30, '& svg': { fontSize: 'inherit' } }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.3 }}>{label}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {hint}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

function Closed({ found }: { found: boolean }) {
  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 1.5, py: 3 }}>
      <Box
        aria-hidden
        sx={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.secondaryContainer,
          color: c.onSecondaryContainer,
        }}
      >
        <QrCode2Rounded sx={{ fontSize: 34 }} />
      </Box>
      <Typography variant="h6" component="p">
        {found ? t('Dieser Link ist abgelaufen') : t('Diesen Link gibt es nicht')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 340 }}>
        {t('Lass dir am Rechner im Dashboard unter „Vom Handy hochladen“ einen neuen QR-Code zeigen und scanne ihn noch einmal.')}
      </Typography>
    </Box>
  );
}

export function PhonePage() {
  const boot = readBoot<PhoneBoot>();
  const { site } = boot;
  const code = useRef(codeFromPath()).current;
  const [info, setInfo] = useState<PublicPhone>(boot.phone);
  const [now, setNow] = useState(() => Date.now());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const counter = useRef(0);
  const running = useRef(false);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  queueRef.current = queue;

  const left = minutesLeft(info.expiresAt, now);
  const open = info.open && left > 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    const refresh = () => {
      setNow(Date.now());
      if (document.visibilityState === 'visible')
        fetchPublicPhone(code)
          .then((result) => setInfo(result.phone))
          .catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [code]);

  const patch = (id: number, next: Partial<QueueItem>) => {
    queueRef.current = queueRef.current.map((item) => (item.id === id ? { ...item, ...next } : item));
    setQueue(queueRef.current);
  };

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = queueRef.current.find((item) => item.state === 'waiting');
        if (!next) break;
        patch(next.id, { state: 'uploading', progress: 0 });
        try {
          await uploadFromPhone(code, next.file, (progress) => patch(next.id, { progress })).promise;
          patch(next.id, { state: 'done', progress: 1 });
          setInfo((current) => ({ ...current, uploads: current.uploads + 1 }));
        } catch (failure) {
          const message = errorMessage(failure);
          patch(next.id, { state: 'error', error: message });
          if (failure instanceof ApiError && (failure.status === 410 || failure.status === 404)) {
            queueRef.current = queueRef.current.map((item) =>
              item.state === 'waiting' ? { ...item, state: 'error', error: message } : item
            );
            setQueue(queueRef.current);
            setInfo((current) => ({ ...current, open: false, found: failure.status !== 404 && current.found }));
            break;
          }
        }
      }
    } finally {
      running.current = false;
    }
  }, [code]);

  const add = (files: FileList | File[]) => {
    const items: QueueItem[] = Array.from(files).map((file) => {
      counter.current += 1;
      return { id: counter.current, file, state: 'waiting', progress: 0, error: '' };
    });
    queueRef.current = [...queueRef.current, ...items];
    setQueue(queueRef.current);
    window.setTimeout(run, 0);
  };

  const done = queue.filter((item) => item.state === 'done').length;
  const busy = queue.some((item) => item.state === 'uploading' || item.state === 'waiting');
  const remaining = Math.max(0, info.max - info.uploads);

  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AmbientBackdrop src={site.favicon || null} color={c.primary} strength={0.45} />
      <Box component="header" sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5, px: 2, height: 60 }}>
        <BrandMark src={site.favicon} title={site.title} size={32} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1, minWidth: 0 }} noWrap>
          {site.title}
        </Typography>
        <ThemeToggleButton />
      </Box>
      <Box component="main" sx={{ position: 'relative', zIndex: 1, flex: 1, px: 2, pt: { xs: 1, sm: 5 }, pb: 6 }}>
        <m.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: ease.emphasizedDecelerate }}
          style={{ maxWidth: 520, margin: '0 auto' }}
          aria-labelledby="phone-title"
        >
          <Box
            sx={{
              p: { xs: 2.5, sm: 3.5 },
              borderRadius: `${radius.xl}px`,
              bgcolor: mix(c.surfaceContainerLow, 90),
              border: `1px solid ${mix(c.outlineVariant, 60)}`,
            }}
          >
            {!info.found || !open ? (
              <Closed found={info.found} />
            ) : (
              <>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('Für {username}', { username: info.username || '' })}
                </Typography>
                <Typography id="phone-title" variant="h4" component="h1" sx={{ mt: 0.5, fontSize: { xs: '1.75rem', sm: '2rem' } }}>
                  {t('Vom Handy hochladen')}
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  {info.album
                    ? t('Fotos und Dateien landen sofort am Rechner, im Album „{album}“.', { album: info.album })
                    : t('Fotos und Dateien landen sofort am Rechner in deinen Uploads.')}
                </Typography>
                <Box sx={{ display: 'grid', gap: 1.25, mt: 3 }}>
                  <PickButton
                    primary
                    icon={<PhotoCameraRounded />}
                    label={t('Foto oder Video aufnehmen')}
                    hint={t('Öffnet die Kamera')}
                    onClick={() => camera.current?.click()}
                  />
                  <PickButton
                    icon={<PhotoLibraryRounded />}
                    label={t('Aus der Galerie oder den Dateien')}
                    hint={t('Mehrere auf einmal gehen auch')}
                    onClick={() => picker.current?.click()}
                  />
                </Box>
                <input
                  ref={camera}
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) add(event.target.files);
                    event.target.value = '';
                  }}
                />
                <input
                  ref={picker}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) add(event.target.files);
                    event.target.value = '';
                  }}
                />
                <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5 }}>
                  {[
                    tn(left, 'Noch 1 Minute offen', 'Noch {count} Minuten offen'),
                    tn(remaining, 'noch 1 Datei', 'noch {count} Dateien'),
                  ].join(', ')}
                </Typography>
              </>
            )}
            {queue.length > 0 && (
              <Box component="ul" sx={{ m: 0, mt: 2, p: 0 }} aria-live="polite">
                <AnimatePresence initial={false}>
                  {queue.map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      onRetry={() => {
                        patch(item.id, { state: 'waiting', error: '' });
                        window.setTimeout(run, 0);
                      }}
                      onRemove={() => {
                        queueRef.current = queueRef.current.filter((entry) => entry.id !== item.id);
                        setQueue(queueRef.current);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </Box>
            )}
            {done > 0 && !busy && open && (
              <Alert severity="success" icon={<CheckCircleRounded />} sx={{ mt: 1.5 }}>
                {tn(
                  done,
                  'Fertig. Die Datei ist auf deinem Rechner zu sehen.',
                  'Fertig. Alle {count} Dateien sind auf deinem Rechner zu sehen.'
                )}
              </Alert>
            )}
          </Box>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 2, textAlign: 'center', px: 2 }}>
            {t('Der Link gilt nur kurz und nur für dich. Gib ihn nicht weiter.')}
          </Typography>
        </m.section>
      </Box>
    </Box>
  );
}
