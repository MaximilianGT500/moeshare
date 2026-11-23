import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Skeleton from '@mui/material/Skeleton';
import Slider from '@mui/material/Slider';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { FileItem, FileVersion, VersionDiff } from '../../lib/types';
import { ApiError, fetchVersionDiff, fileContentUrl } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { GrowTransition } from '../../components/transitions';
import { c, fonts, radius } from '../../theme/tokens';

export const canCompare = (version: FileVersion, current: FileItem) =>
  (version.type === 'image' && current.type === 'image') || (version.type === 'text' && current.type === 'text');

function ImageCompare({ before, after, ratio }: { before: string; after: string; ratio: number }) {
  const [mode, setMode] = useState<'slider' | 'side'>('slider');
  const [position, setPosition] = useState(50);
  const box = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const moveTo = (event: ReactPointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    setPosition(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)));
  };

  const frame = {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    userSelect: 'none' as const,
    pointerEvents: 'none' as const,
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_event, next) => next && setMode(next)} aria-label={t('Ansicht')}>
          <ToggleButton value="slider">{t('Regler')}</ToggleButton>
          <ToggleButton value="side">{t('Nebeneinander')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {mode === 'side' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          {[
            { src: before, label: t('Vorher') },
            { src: after, label: t('Jetzt') },
          ].map((item) => (
            <Box key={item.label} component="figure" sx={{ m: 0 }}>
              <Box
                component="img"
                src={item.src}
                alt={item.label}
                sx={{
                  display: 'block',
                  width: '100%',
                  maxHeight: '55vh',
                  objectFit: 'contain',
                  borderRadius: `${radius.md}px`,
                  bgcolor: c.surfaceContainerHighest,
                }}
              />
              <Typography
                component="figcaption"
                variant="caption"
                sx={{ display: 'block', textAlign: 'center', mt: 0.75, color: 'text.secondary' }}
              >
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <>
          <Box
            ref={box}
            onPointerDown={(event) => {
              dragging.current = true;
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
              moveTo(event);
            }}
            onPointerMove={(event) => dragging.current && moveTo(event)}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            sx={{
              position: 'relative',
              width: '100%',
              maxHeight: '60vh',
              aspectRatio: String(ratio),
              mx: 'auto',
              overflow: 'hidden',
              borderRadius: `${radius.md}px`,
              background: 'repeating-conic-gradient(#3b3940 0 25%, #2b2930 0 50%) 0 0 / 20px 20px',
              cursor: 'ew-resize',
              touchAction: 'none',
            }}
          >
            <img src={after} alt={t('Jetzt')} draggable={false} style={frame} />
            <img src={before} alt={t('Vorher')} draggable={false} style={{ ...frame, clipPath: `inset(0 ${100 - position}% 0 0)` }} />
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${position}%`,
                width: 2,
                ml: '-1px',
                bgcolor: '#fff',
                boxShadow: '0 0 0 1px rgb(0 0 0 / 0.35)',
                pointerEvents: 'none',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 30,
                  height: 30,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  bgcolor: '#fff',
                  boxShadow: '0 2px 8px rgb(0 0 0 / 0.4)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#1d1a23',
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                ⇆
              </Box>
            </Box>
            <Chip
              size="small"
              label={t('Vorher')}
              sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgb(0 0 0 / 0.6)', color: '#fff' }}
            />
            <Chip
              size="small"
              label={t('Jetzt')}
              sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgb(0 0 0 / 0.6)', color: '#fff' }}
            />
          </Box>
          <Slider
            value={position}
            onChange={(_event, value) => setPosition(value as number)}
            aria-label={t('Trennlinie zwischen vorher und jetzt')}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${Math.round(value)} %`}
            sx={{ mt: 1.5 }}
          />
        </>
      )}
    </Box>
  );
}

function TextCompare({ fileId, version }: { fileId: number; version: FileVersion }) {
  const [data, setData] = useState<VersionDiff | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    fetchVersionDiff(fileId, version.id)
      .then((next) => alive && setData(next))
      .catch(
        (failure) => alive && setError(failure instanceof ApiError ? failure.message : t('Der Vergleich konnte nicht geladen werden.'))
      );
    return () => {
      alive = false;
    };
  }, [fileId, version.id]);

  if (error) return <Typography sx={{ color: c.error }}>{error}</Typography>;
  if (!data) return <Skeleton variant="rounded" height={240} />;
  if (data.diff.tooLarge)
    return (
      <Typography sx={{ color: 'text.secondary' }}>{t('Die Fassungen unterscheiden sich zu stark für eine Gegenüberstellung.')}</Typography>
    );
  if (!data.diff.hunks.length) return <Typography sx={{ color: 'text.secondary' }}>{t('Beide Fassungen sind gleich.')}</Typography>;
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          size="small"
          label={tn(data.diff.added || 0, '1 Zeile neu', '{count} Zeilen neu')}
          sx={{ bgcolor: c.successContainer, color: c.onSuccessContainer, fontWeight: 600 }}
        />
        <Chip
          size="small"
          label={tn(data.diff.removed || 0, '1 Zeile entfernt', '{count} Zeilen entfernt')}
          sx={{ bgcolor: c.errorContainer, color: c.onErrorContainer, fontWeight: 600 }}
        />
      </Box>
      <Box
        role="table"
        aria-label={t('Unterschiede zwischen Version {before} und Version {after}', {
          before: data.before.version,
          after: data.after.version,
        })}
        sx={{
          fontFamily: fonts.mono,
          fontSize: '0.8125rem',
          lineHeight: 1.6,
          borderRadius: `${radius.md}px`,
          border: `1px solid ${c.outlineVariant}`,
          overflow: 'auto',
          maxHeight: '60vh',
        }}
      >
        {data.diff.hunks.map((hunk, index) => (
          <Box key={index} role="rowgroup">
            {index > 0 && (
              <Box role="row" sx={{ px: 1.5, py: 0.25, bgcolor: c.surfaceContainerHigh, color: 'text.secondary', fontSize: '0.75rem' }}>
                <span role="cell">⋯</span>
              </Box>
            )}
            {hunk.lines.map((line, row) => (
              <Box
                key={row}
                role="row"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '44px 44px 18px minmax(0, 1fr)',
                  bgcolor: line.type === 'add' ? c.successContainer : line.type === 'del' ? c.errorContainer : 'transparent',
                  color: line.type === 'add' ? c.onSuccessContainer : line.type === 'del' ? c.onErrorContainer : 'inherit',
                }}
              >
                <Box role="cell" sx={{ textAlign: 'right', pr: 1, opacity: 0.6, userSelect: 'none' }}>
                  {line.before ? formatNumber(line.before) : ''}
                </Box>
                <Box role="cell" sx={{ textAlign: 'right', pr: 1, opacity: 0.6, userSelect: 'none' }}>
                  {line.after ? formatNumber(line.after) : ''}
                </Box>
                <Box
                  role="cell"
                  aria-label={line.type === 'add' ? t('neu') : line.type === 'del' ? t('entfernt') : undefined}
                  sx={{ userSelect: 'none', fontWeight: 700 }}
                >
                  {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ''}
                </Box>
                <Box role="cell" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pr: 1.5 }}>
                  {line.text || ' '}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function CompareDialog({ file, version, onClose }: { file: FileItem | null; version: FileVersion | null; onClose: () => void }) {
  const open = Boolean(file && version);
  const ratio =
    file && file.width && file.height
      ? file.width / file.height
      : version && version.width && version.height
        ? version.width / version.height
        : 4 / 3;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{ zIndex: 1500 }}
      slots={{ transition: GrowTransition }}
      aria-labelledby="compare-title"
    >
      <DialogTitle id="compare-title">
        {version && file
          ? t('Version {before} mit der aktuellen vergleichen', { before: version.version, current: file.version || 1 })
          : ''}
      </DialogTitle>
      <DialogContent>
        {file && version && version.type === 'image' && (
          <ImageCompare before={version.content} after={`${fileContentUrl(file.id)}?v=${file.version || 1}`} ratio={ratio} />
        )}
        {file && version && version.type === 'text' && <TextCompare fileId={file.id} version={version} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Schließen')}</Button>
      </DialogActions>
    </Dialog>
  );
}
