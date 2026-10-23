import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import FirstPageRounded from '@mui/icons-material/FirstPageRounded';
import LastPageRounded from '@mui/icons-material/LastPageRounded';
import { ApiError, startClip, waitForJob, type ClipResult } from '../../lib/api';
import type { FileItem } from '../../lib/types';
import { locale, t } from '../../lib/i18n';
import { GrowTransition } from '../../components/transitions';
import { displayName } from './MediaTile';
import { c, radius } from '../../theme/tokens';

const GIF_MAX = 30;
const MIN_LENGTH = 0.2;
const FPS = [10, 15, 20, 25];
const WIDTHS = [320, 480, 640, 800];
const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SEPARATOR = decimal.format(1.5).charAt(1);

function formatClock(seconds: number) {
  const tenths = Math.round(Math.max(0, seconds || 0) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(rest).padStart(2, '0')}${SEPARATOR}${tenths % 10}`;
}

type Format = 'mp4' | 'gif';

export function ClipDialog({
  file,
  versions,
  onClose,
  onDone,
}: {
  file: FileItem | null;
  versions: boolean;
  onClose: () => void;
  onDone: (result: ClipResult) => void;
}) {
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef(0);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [format, setFormat] = useState<Format>('mp4');
  const [target, setTarget] = useState<'new' | 'version'>('new');
  const [audio, setAudio] = useState(true);
  const [fps, setFps] = useState(15);
  const [width, setWidth] = useState(480);
  const [job, setJob] = useState<{ progress: number } | null>(null);
  const [error, setError] = useState('');
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => {
    if (!file) return;
    setDuration(0);
    setRange([0, 0]);
    setTime(0);
    setPlaying(false);
    setFormat('mp4');
    setTarget('new');
    setAudio(true);
    setFps(15);
    setWidth(Math.min(480, file.width || 480));
    setJob(null);
    setError('');
  }, [file]);

  useEffect(() => {
    if (!playing) return undefined;
    const tick = () => {
      const el = video.current;
      if (el) {
        const [start, end] = rangeRef.current;
        if (el.currentTime >= end || el.currentTime < start - 0.05) el.currentTime = start;
        setTime(el.currentTime);
      }
      frame.current = window.requestAnimationFrame(tick);
    };
    frame.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame.current);
  }, [playing]);

  const seek = (value: number) => {
    const el = video.current;
    if (!el) return;
    el.currentTime = value;
    setTime(value);
  };

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      if (el.currentTime < range[0] || el.currentTime >= range[1] - 0.05) el.currentTime = range[0];
      el.play().catch(() => {});
    } else el.pause();
  };

  const chooseFormat = (next: Format) => {
    setFormat(next);
    if (next === 'gif' && range[1] - range[0] > GIF_MAX) setRange([range[0], range[0] + GIF_MAX]);
  };

  const length = range[1] - range[0];
  const tooLong = format === 'gif' && length > GIF_MAX + 0.01;
  const tooShort = length < MIN_LENGTH;
  const running = !!job;

  const submit = async () => {
    if (!file || tooLong || tooShort) return;
    video.current?.pause();
    setError('');
    setJob({ progress: 0 });
    try {
      const { job: started } = await startClip(file.id, {
        start: Math.round(range[0] * 100) / 100,
        end: Math.round(range[1] * 100) / 100,
        format,
        target: format === 'mp4' ? target : 'new',
        audio,
        fps,
        width,
      });
      const finished = await waitForJob<ClipResult>(started.id, (state) => setJob({ progress: state.progress }));
      if (finished.state === 'error' || !finished.result) {
        setError(finished.error?.message || t('Das Video konnte nicht verarbeitet werden.'));
        setJob(null);
        return;
      }
      setJob(null);
      onDone(finished.result);
      onClose();
    } catch (err) {
      setJob(null);
      setError(err instanceof ApiError ? err.message : t('Das Video konnte nicht verarbeitet werden.'));
    }
  };

  const markers =
    duration > 0 ? (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', color: 'text.secondary' }}>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {t('Start {time}', { time: formatClock(range[0]) })}
        </Typography>
        <Typography
          variant="caption"
          sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: tooLong || tooShort ? c.error : 'text.primary' }}
        >
          {t('Länge {seconds} s', { seconds: decimal.format(length) })}
        </Typography>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {t('Ende {time}', { time: formatClock(range[1]) })}
        </Typography>
      </Box>
    ) : null;

  return (
    <Dialog
      open={!!file}
      onClose={running ? undefined : onClose}
      maxWidth="md"
      fullWidth
      fullScreen={phone}
      sx={{ zIndex: 1450 }}
      slots={{ transition: GrowTransition }}
      aria-labelledby="clip-title"
    >
      <DialogTitle id="clip-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ContentCutRounded sx={{ color: c.secondary }} />
        <Box sx={{ minWidth: 0 }}>
          <Box component="span" sx={{ display: 'block' }}>
            {t('Video kürzen')}
          </Box>
          {file && (
            <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
              {displayName(file)}
            </Typography>
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        {file && (
          <Box sx={{ display: 'grid', gap: 2.5 }}>
            <Box
              sx={{
                position: 'relative',
                borderRadius: `${radius.md}px`,
                overflow: 'hidden',
                bgcolor: '#000',
                aspectRatio: file.width && file.height ? `${file.width} / ${file.height}` : '16 / 9',
                maxHeight: { xs: '34vh', sm: '40vh' },
                mx: 'auto',
                width: '100%',
              }}
            >
              <video
                ref={video}
                src={file.urls.direct}
                poster={file.urls.preview}
                playsInline
                preload="auto"
                onLoadedMetadata={(event) => {
                  const total = event.currentTarget.duration;
                  if (Number.isFinite(total) && total > 0) {
                    setDuration(total);
                    setRange([0, total]);
                  }
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={toggle}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: 'pointer' }}
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title={playing ? t('Pause') : t('Ausschnitt abspielen')}>
                  <span>
                    <IconButton
                      onClick={toggle}
                      disabled={!duration}
                      aria-label={playing ? t('Pause') : t('Ausschnitt abspielen')}
                      sx={{ bgcolor: c.primaryContainer, color: c.onPrimaryContainer, '&:hover': { bgcolor: c.primaryContainer } }}
                    >
                      {playing ? <PauseRounded /> : <PlayArrowRounded />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Box sx={{ flex: 1, position: 'relative', px: 1.5 }}>
                  <Slider
                    value={range}
                    min={0}
                    max={duration || 1}
                    step={0.05}
                    disabled={!duration || running}
                    disableSwap
                    onChange={(_event, value, thumb) => {
                      if (!Array.isArray(value)) return;
                      const next: [number, number] = [value[0], value[1]];
                      if (format === 'gif' && next[1] - next[0] > GIF_MAX) {
                        if (thumb === 0) next[1] = next[0] + GIF_MAX;
                        else next[0] = next[1] - GIF_MAX;
                      }
                      setRange(next);
                      seek(thumb === 0 ? next[0] : Math.max(next[0], next[1] - 0.05));
                    }}
                    getAriaLabel={(index) => (index === 0 ? t('Start') : t('Ende'))}
                    getAriaValueText={(value) => formatClock(value)}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => formatClock(value)}
                  />
                  {duration > 0 && (
                    <Box
                      aria-hidden
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: `calc(12px + (100% - 24px) * ${Math.min(1, time / duration)})`,
                        width: 2,
                        height: 22,
                        transform: 'translate(-1px, -60%)',
                        bgcolor: c.onSurface,
                        borderRadius: 1,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </Box>
              </Box>
              {markers}
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  startIcon={<FirstPageRounded />}
                  disabled={!duration || running || time >= range[1] - MIN_LENGTH}
                  onClick={() => setRange([Math.min(time, range[1] - MIN_LENGTH), range[1]])}
                >
                  {t('Start hier setzen')}
                </Button>
                <Button
                  size="small"
                  startIcon={<LastPageRounded />}
                  disabled={!duration || running || time <= range[0] + MIN_LENGTH}
                  onClick={() => setRange([range[0], Math.max(time, range[0] + MIN_LENGTH)])}
                >
                  {t('Ende hier setzen')}
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('Format')}
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={format}
                  disabled={running}
                  onChange={(_event, value: Format | null) => value && chooseFormat(value)}
                  aria-label={t('Format')}
                >
                  <ToggleButton value="mp4">{t('MP4-Video')}</ToggleButton>
                  <ToggleButton value="gif">{t('GIF')}</ToggleButton>
                </ToggleButtonGroup>
                {format === 'mp4' ? (
                  <FormControlLabel
                    sx={{ mt: 1 }}
                    control={<Switch checked={audio} onChange={(event) => setAudio(event.target.checked)} disabled={running} />}
                    label={t('Ton behalten')}
                  />
                ) : (
                  <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
                    {t('GIFs haben keinen Ton und dürfen höchstens {seconds} Sekunden lang sein.', { seconds: GIF_MAX })}
                  </Typography>
                )}
              </Box>
              {format === 'mp4' ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    {t('Speichern als')}
                  </Typography>
                  <RadioGroup value={target} onChange={(event) => setTarget(event.target.value as 'new' | 'version')}>
                    <FormControlLabel value="new" control={<Radio size="small" />} label={t('Neue Datei')} disabled={running} />
                    <FormControlLabel
                      value="version"
                      control={<Radio size="small" />}
                      disabled={running}
                      label={versions ? t('Neue Fassung dieses Videos') : t('Dieses Video ersetzen')}
                    />
                  </RadioGroup>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gap: 1.5 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      {t('Bilder pro Sekunde')}
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      size="small"
                      value={fps}
                      disabled={running}
                      onChange={(_event, value: number | null) => value && setFps(value)}
                      aria-label={t('Bilder pro Sekunde')}
                    >
                      {FPS.map((value) => (
                        <ToggleButton key={value} value={value}>
                          {value}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      {t('Breite in Pixeln')}
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      size="small"
                      value={width}
                      disabled={running}
                      onChange={(_event, value: number | null) => value && setWidth(value)}
                      aria-label={t('Breite in Pixeln')}
                    >
                      {WIDTHS.map((value) => (
                        <ToggleButton key={value} value={value}>
                          {value}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                </Box>
              )}
            </Box>

            {job && (
              <Box aria-live="polite">
                <LinearProgress variant={job.progress > 0 ? 'determinate' : 'indeterminate'} value={job.progress * 100} />
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
                  {format === 'gif'
                    ? t('GIF wird erstellt: {percent} %', { percent: Math.round(job.progress * 100) })
                    : t('Video wird geschnitten: {percent} %', { percent: Math.round(job.progress * 100) })}
                </Typography>
              </Box>
            )}

            {error && (
              <Typography variant="body2" sx={{ color: c.error }}>
                {error}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={running}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!duration || running || tooLong || tooShort}
          startIcon={running ? <CircularProgress size={16} color="inherit" /> : <ContentCutRounded />}
        >
          {format === 'gif' ? t('GIF erstellen') : target === 'version' ? t('Video ersetzen') : t('Ausschnitt speichern')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
