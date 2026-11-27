import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import { fixWebmDuration } from '../../lib/webm';
import { formatBytes } from '../../lib/format';
import { c, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const MAX_MS = 15 * 60 * 1000;
const BARS = 56;

export const canRecordVoice = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
  typeof MediaRecorder !== 'undefined';

const FORMATS: Array<{ type: string; ext: string }> = [
  { type: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
  { type: 'audio/ogg;codecs=opus', ext: 'ogg' },
  { type: 'audio/mp4;codecs=opus', ext: 'm4a' },
  { type: 'audio/mp4', ext: 'm4a' },
  { type: 'audio/webm;codecs=opus', ext: 'weba' },
  { type: 'audio/webm', ext: 'weba' },
];

const pickFormat = () => FORMATS.find((format) => MediaRecorder.isTypeSupported(format.type)) || null;

const pad = (value: number) => String(value).padStart(2, '0');

function clock(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

function defaultName() {
  const now = new Date();
  return `${t('Sprachnotiz')} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

const safeName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

interface Session {
  recorder: MediaRecorder;
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  chunks: Blob[];
  active: number;
  since: number;
  format: { type: string; ext: string } | null;
  frame: number;
}

interface Take {
  blob: Blob;
  url: string;
  ext: string;
  duration: number;
}

type State = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing' | 'done';

function Meter({ levels, live }: { levels: number[]; live: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        height: 72,
        px: 1,
      }}
    >
      {levels.map((level, index) => (
        <Box
          key={index}
          sx={{
            width: 4,
            flexShrink: 0,
            borderRadius: '2px',
            height: `${Math.max(6, Math.round(level * 100))}%`,
            bgcolor: live ? c.primary : c.outlineVariant,
            opacity: live ? 0.45 + level * 0.55 : 1,
          }}
        />
      ))}
    </Box>
  );
}

export function VoiceMemoDialog({ open, onClose, onFile }: { open: boolean; onClose: () => void; onFile: (file: File) => void }) {
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [take, setTake] = useState<Take | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const session = useRef<Session | null>(null);
  const discard = useRef(false);

  const release = (current: Session | null) => {
    if (!current) return;
    window.cancelAnimationFrame(current.frame);
    current.stream.getTracks().forEach((track) => track.stop());
    current.context.close().catch(() => {});
  };

  useEffect(
    () => () => {
      const current = session.current;
      if (current) {
        discard.current = true;
        if (current.recorder.state !== 'inactive') current.recorder.stop();
        release(current);
      }
    },
    []
  );

  useEffect(() => {
    if (!take) return;
    return () => URL.revokeObjectURL(take.url);
  }, [take]);

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => {
      const current = session.current;
      if (!current) return;
      const total = current.active + (performance.now() - current.since);
      setElapsed(total);
      if (total >= MAX_MS) stop();
    }, 200);
    return () => window.clearInterval(timer);
  }, [state]);

  const reset = () => {
    setTake(null);
    setElapsed(0);
    setLevels(Array(BARS).fill(0));
    setError('');
    setState('idle');
  };

  const finish = async (current: Session) => {
    session.current = null;
    release(current);
    if (discard.current) {
      discard.current = false;
      reset();
      return;
    }
    const type = (current.recorder.mimeType || current.format?.type || 'audio/webm').split(';')[0];
    const raw = new Blob(current.chunks, { type });
    if (!raw.size) {
      setError(t('Die Aufnahme ist leer. Prüf, ob das richtige Mikrofon gewählt ist.'));
      setState('idle');
      return;
    }
    const ext = type.includes('webm') ? 'weba' : type.includes('ogg') ? 'ogg' : 'm4a';
    const blob = type.includes('webm') ? await fixWebmDuration(raw, current.active).catch(() => raw) : raw;
    setTake({ blob, url: URL.createObjectURL(blob), ext, duration: current.active });
    setState('done');
  };

  const start = async () => {
    setError('');
    setState('starting');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const format = pickFormat();
      const recorder = new MediaRecorder(stream, format ? { mimeType: format.type, audioBitsPerSecond: 96_000 } : undefined);
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const current: Session = { recorder, stream, context, analyser, chunks: [], active: 0, since: performance.now(), format, frame: 0 };
      session.current = current;
      const samples = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (time: number) => {
        current.frame = window.requestAnimationFrame(tick);
        if (time - last < 70 || current.recorder.state !== 'recording') return;
        last = time;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
        setLevels((previous) => [...previous.slice(1), level]);
      };
      current.frame = window.requestAnimationFrame(tick);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) current.chunks.push(event.data);
      };
      recorder.onstop = () => void finish(current);
      discard.current = false;
      recorder.start(1000);
      setElapsed(0);
      setState('recording');
    } catch (failure) {
      stream?.getTracks().forEach((track) => track.stop());
      session.current = null;
      setState('idle');
      const denied = failure instanceof DOMException && (failure.name === 'NotAllowedError' || failure.name === 'SecurityError');
      const missing = failure instanceof DOMException && failure.name === 'NotFoundError';
      setError(
        denied
          ? t('Der Browser hat den Zugriff aufs Mikrofon nicht erlaubt. Erlaub ihn in den Seiteneinstellungen und versuch es noch einmal.')
          : missing
            ? t('Es wurde kein Mikrofon gefunden.')
            : t('Die Aufnahme ließ sich nicht starten.')
      );
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

  function stop(drop = false) {
    const current = session.current;
    if (!current || current.recorder.state === 'inactive') return;
    if (current.recorder.state === 'recording') current.active += performance.now() - current.since;
    discard.current = drop;
    setState('finishing');
    current.recorder.stop();
  }

  const close = () => {
    if (session.current) stop(true);
    else reset();
    setName('');
    onClose();
  };

  const upload = () => {
    if (!take) return;
    const base = safeName(name) || defaultName();
    onFile(new File([take.blob], `${base}.${take.ext}`, { type: take.blob.type }));
    setName('');
    reset();
    onClose();
  };

  const recording = state === 'recording' || state === 'paused' || state === 'finishing';

  return (
    <Dialog open={open} onClose={recording ? undefined : close} maxWidth="xs" fullWidth aria-labelledby="voice-title">
      <DialogTitle id="voice-title">{t('Sprachnotiz aufnehmen')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {state !== 'done' ? (
          <>
            <Box
              sx={{
                borderRadius: `${radius.lg}px`,
                bgcolor: c.surfaceContainerHigh,
                py: 2.5,
                display: 'grid',
                justifyItems: 'center',
                gap: 1.5,
              }}
            >
              <Meter levels={levels} live={state === 'recording'} />
              <Typography
                role="timer"
                aria-live="off"
                sx={{ fontSize: '2rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}
              >
                {clock(elapsed)}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }} aria-live="polite">
                {state === 'recording'
                  ? t('Aufnahme läuft')
                  : state === 'paused'
                    ? t('Pausiert')
                    : state === 'finishing'
                      ? t('Wird fertig …')
                      : state === 'starting'
                        ? t('Mikrofon wird geöffnet …')
                        : t('Bis zu 15 Minuten')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
              {recording && (
                <Tooltip title={state === 'paused' ? t('Weiter aufnehmen') : t('Aufnahme pausieren')}>
                  <span>
                    <IconButton
                      onClick={state === 'paused' ? resume : pause}
                      disabled={state === 'finishing'}
                      aria-label={state === 'paused' ? t('Weiter aufnehmen') : t('Aufnahme pausieren')}
                      sx={{ width: 48, height: 48, bgcolor: c.surfaceContainerHighest }}
                    >
                      {state === 'paused' ? <PlayArrowRounded /> : <PauseRounded />}
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <ButtonBase
                onClick={recording ? () => stop() : start}
                disabled={state === 'starting' || state === 'finishing'}
                aria-label={recording ? t('Aufnahme beenden') : t('Aufnahme starten')}
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  bgcolor: recording ? c.error : c.primary,
                  color: recording ? c.onError : c.onPrimary,
                  transition: 'transform 120ms',
                  '&:active': { transform: 'scale(0.95)' },
                  '&.Mui-focusVisible': { outline: `3px solid ${c.primary}`, outlineOffset: 3 },
                  '&.Mui-disabled': { opacity: 0.6 },
                  '& svg': { fontSize: 34 },
                }}
              >
                {recording ? <StopRounded /> : <MicRounded />}
              </ButtonBase>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
          </>
        ) : (
          take && (
            <>
              <Box component="audio" src={take.url} controls sx={{ width: '100%' }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('{duration} lang, {size}', { duration: clock(take.duration), size: formatBytes(take.blob.size) })}
              </Typography>
              <TextField
                id="voice-name"
                label={t('Name')}
                placeholder={defaultName()}
                value={name}
                onChange={(event) => setName(event.target.value)}
                size="small"
                fullWidth
                slotProps={{ htmlInput: { maxLength: 120 } }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') upload();
                }}
              />
            </>
          )
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        {state === 'done' ? (
          <>
            <Button onClick={close} sx={{ mr: 'auto' }}>
              {t('Verwerfen')}
            </Button>
            <Button startIcon={<ReplayRounded />} onClick={reset}>
              {t('Neu aufnehmen')}
            </Button>
            <Button variant="contained" startIcon={<CloudUploadRounded />} onClick={upload}>
              {t('Hochladen')}
            </Button>
          </>
        ) : (
          <Button onClick={close}>{recording ? t('Verwerfen') : t('Abbrechen')}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
