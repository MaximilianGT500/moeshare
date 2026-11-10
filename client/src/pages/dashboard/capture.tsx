import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ScreenshotMonitorRounded from '@mui/icons-material/ScreenshotMonitorRounded';
import VideocamRounded from '@mui/icons-material/VideocamRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { SwitchRow } from '../../components/SettingsKit';
import { useToast } from '../../components/Toaster';
import { fixWebmDuration } from '../../lib/webm';
import { formatBytes } from '../../lib/format';
import { c, ease, elevation, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

export const canCapture = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) &&
  typeof MediaRecorder !== 'undefined' &&
  !/Android|iPhone|iPad/i.test(navigator.userAgent);

const pad = (value: number) => String(value).padStart(2, '0');

function clock(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function stamp() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

const DISPLAY = { selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include' };

function stopAll(...streams: Array<MediaStream | null | undefined>) {
  for (const stream of streams) stream?.getTracks().forEach((track) => track.stop());
}

const cancelled = (error: unknown) => error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');

async function grabFrame(stream: MediaStream): Promise<Blob> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.pause();
  video.srcObject = null;
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('frame'))), 'image/png'));
}

function recordingType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Session {
  recorder: MediaRecorder;
  streams: MediaStream[];
  audio: AudioContext | null;
  chunks: Blob[];
  active: number;
  since: number;
}

interface Result {
  file: File;
  url: string;
  duration: number;
}

function Choice({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        textAlign: 'left',
        gap: 2,
        p: 2,
        borderRadius: `${radius.md}px`,
        bgcolor: c.surfaceContainerHigh,
        width: '100%',
        '&:hover': { bgcolor: c.surfaceContainerHighest },
        '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: `${radius.sm}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.primaryContainer,
          color: c.onPrimaryContainer,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {text}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

export function ScreenCapture({ open, onClose, onFile }: { open: boolean; onClose: () => void; onFile: (file: File) => void }) {
  const toast = useToast();
  const [sound, setSound] = useState(true);
  const [microphone, setMicrophone] = useState(false);
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'finishing'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const session = useRef<Session | null>(null);
  const discard = useRef(false);

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => {
      const current = session.current;
      if (current) setElapsed(current.active + (performance.now() - current.since));
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(
    () => () => {
      const current = session.current;
      if (current) {
        discard.current = true;
        if (current.recorder.state !== 'inactive') current.recorder.stop();
        stopAll(...current.streams);
      }
    },
    []
  );

  const screenshot = async () => {
    onClose();
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, ...DISPLAY } as DisplayMediaStreamOptions);
      const blob = await grabFrame(stream);
      onFile(new File([blob], `${t('Bildschirmfoto')} ${stamp()}.png`, { type: 'image/png' }));
    } catch (error) {
      if (!cancelled(error)) toast(t('Das Bildschirmfoto hat nicht geklappt.'), { variant: 'error' });
    } finally {
      stopAll(stream);
    }
  };

  const finish = async () => {
    const current = session.current;
    if (!current) return;
    session.current = null;
    stopAll(...current.streams);
    current.audio?.close().catch(() => {});
    setState('idle');
    setElapsed(0);
    if (discard.current) {
      discard.current = false;
      return;
    }
    const type = current.recorder.mimeType || current.chunks[0]?.type || 'video/webm';
    const raw = new Blob(current.chunks, { type: type.split(';')[0] });
    if (!raw.size) {
      toast(t('Die Aufnahme ist leer.'), { variant: 'error' });
      return;
    }
    const webm = raw.type.includes('webm');
    const blob = webm ? await fixWebmDuration(raw, current.active).catch(() => raw) : raw;
    const file = new File([blob], `${t('Bildschirmaufnahme')} ${stamp()}.${webm ? 'webm' : 'mp4'}`, { type: raw.type });
    setResult({ file, url: URL.createObjectURL(file), duration: current.active });
  };

  const record = async () => {
    onClose();
    const streams: MediaStream[] = [];
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: sound,
        ...DISPLAY,
      } as DisplayMediaStreamOptions);
      streams.push(display);
      let voice: MediaStream | null = null;
      if (microphone) {
        try {
          voice = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          streams.push(voice);
        } catch {
          toast(t('Ohne Mikrofon, der Zugriff wurde nicht erlaubt.'), { variant: 'info' });
        }
      }
      const sources = [display, voice].filter((stream): stream is MediaStream => Boolean(stream && stream.getAudioTracks().length));
      let audio: AudioContext | null = null;
      let audioTracks: MediaStreamTrack[] = [];
      if (sources.length > 1) {
        audio = new AudioContext();
        const target = audio.createMediaStreamDestination();
        for (const stream of sources) audio.createMediaStreamSource(stream).connect(target);
        audioTracks = target.stream.getAudioTracks();
      } else if (sources.length === 1) {
        audioTracks = sources[0].getAudioTracks();
      }
      const mixed = new MediaStream([...display.getVideoTracks(), ...audioTracks]);
      const mimeType = recordingType();
      const recorder = new MediaRecorder(mixed, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
      const current: Session = { recorder, streams, audio, chunks: [], active: 0, since: performance.now() };
      session.current = current;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) current.chunks.push(event.data);
      };
      recorder.onstop = () => void finish();
      display.getVideoTracks()[0]?.addEventListener('ended', () => stop());
      discard.current = false;
      recorder.start(1000);
      setElapsed(0);
      setState('recording');
    } catch (error) {
      stopAll(...streams);
      if (!cancelled(error)) toast(t('Die Aufnahme ließ sich nicht starten.'), { variant: 'error' });
    }
  };

  const pause = () => {
    const current = session.current;
    if (!current || current.recorder.state !== 'recording') return;
    current.recorder.pause();
    current.active += performance.now() - current.since;
    setElapsed(current.active);
    setState('paused');
  };

  const resume = () => {
    const current = session.current;
    if (!current || current.recorder.state !== 'paused') return;
    current.since = performance.now();
    current.recorder.resume();
    setState('recording');
  };

  const stop = (drop = false) => {
    const current = session.current;
    if (!current || current.recorder.state === 'inactive') return;
    if (current.recorder.state === 'recording') current.active += performance.now() - current.since;
    discard.current = drop;
    setState('finishing');
    current.recorder.stop();
  };

  const closeResult = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="capture-title">
        <DialogTitle id="capture-title">{t('Bildschirm aufnehmen')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
          <Choice
            icon={<ScreenshotMonitorRounded />}
            title={t('Bildschirmfoto')}
            text={t('Ein Bild von einem Bildschirm, Fenster oder Tab. Es wird gleich hochgeladen.')}
            onClick={screenshot}
          />
          <Choice
            icon={<VideocamRounded />}
            title={t('Bildschirmvideo')}
            text={t('Nimmt auf, bis du auf Stopp klickst. Vor dem Hochladen siehst du das Video noch einmal.')}
            onClick={record}
          />
          <Box sx={{ mx: -3 }}>
            <SwitchRow
              id="capture-sound"
              label={t('Ton vom Bildschirm')}
              description={t('Bei Tabs immer, beim ganzen Bildschirm nur in manchen Browsern.')}
              checked={sound}
              onChange={setSound}
            />
            <SwitchRow
              id="capture-microphone"
              label={t('Mikrofon')}
              description={t('Deine Stimme kommt mit ins Video.')}
              checked={microphone}
              onChange={setMicrophone}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>{t('Abbrechen')}</Button>
        </DialogActions>
      </Dialog>

      {state !== 'idle' &&
        createPortal(
          <m.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}
            style={{ position: 'fixed', left: '50%', bottom: 24, x: '-50%', zIndex: 1450 }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pl: 2,
                pr: 1,
                py: 0.75,
                borderRadius: `${radius.full}px`,
                bgcolor: c.inverseSurface,
                color: c.inverseOnSurface,
                boxShadow: elevation[3],
              }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: state === 'recording' ? '#ff5449' : c.outline,
                  animation: state === 'recording' ? 'ms-rec 1.2s ease-in-out infinite' : 'none',
                  '@keyframes ms-rec': { '50%': { opacity: 0.35 } },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              />
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 48 }}>
                {clock(elapsed)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, mr: 0.5, display: { xs: 'none', sm: 'block' } }}>
                {state === 'paused' ? t('Pausiert') : state === 'finishing' ? t('Wird fertig …') : t('Aufnahme läuft')}
              </Typography>
              {state === 'paused' ? (
                <Tooltip title={t('Weiter')}>
                  <IconButton onClick={resume} aria-label={t('Weiter aufnehmen')} sx={{ color: 'inherit' }}>
                    <PlayArrowRounded />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title={t('Pause')}>
                  <span>
                    <IconButton
                      onClick={pause}
                      disabled={state !== 'recording'}
                      aria-label={t('Aufnahme pausieren')}
                      sx={{ color: 'inherit' }}
                    >
                      <PauseRounded />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<StopRounded />}
                onClick={() => stop()}
                disabled={state === 'finishing'}
                sx={{ borderRadius: `${radius.full}px` }}
              >
                {t('Stopp')}
              </Button>
              <Tooltip title={t('Verwerfen')}>
                <span>
                  <IconButton
                    onClick={() => stop(true)}
                    disabled={state === 'finishing'}
                    aria-label={t('Aufnahme verwerfen')}
                    sx={{ color: 'inherit' }}
                  >
                    <CloseRounded />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </m.div>,
          document.body
        )}

      <Dialog open={Boolean(result)} onClose={closeResult} maxWidth="sm" fullWidth aria-labelledby="capture-result-title">
        <DialogTitle id="capture-result-title">{t('Aufnahme fertig')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
          {result && (
            <>
              <Box
                component="video"
                src={result.url}
                controls
                playsInline
                sx={{ width: '100%', maxHeight: '55vh', borderRadius: `${radius.md}px`, bgcolor: '#000' }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('{duration} lang, {size}', {
                  duration: clock(result.duration),
                  size: formatBytes(result.file.size),
                })}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={closeResult} sx={{ mr: 'auto' }}>
            {t('Verwerfen')}
          </Button>
          <Button startIcon={<DownloadRounded />} onClick={() => result && save(result.file, result.file.name)}>
            {t('Herunterladen')}
          </Button>
          <Button
            variant="contained"
            startIcon={<CloudUploadRounded />}
            onClick={() => {
              if (result) onFile(result.file);
              closeResult();
            }}
          >
            {t('Hochladen')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
