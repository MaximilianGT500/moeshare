import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AccessibilityNewRounded from '@mui/icons-material/AccessibilityNewRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import type { FileItem } from '../../lib/types';
import { errorMessage, listFiles, updateFile } from '../../lib/api';
import { t, tn } from '../../lib/i18n';
import { useToast } from '../../components/Toaster';
import { GrowTransition } from '../../components/transitions';
import { displayName } from './MediaTile';
import { c, radius } from '../../theme/tokens';

const PAGE = 200;
const MAX_ALT = 500;

export function AltTextDialog({
  open,
  total,
  onClose,
  onSaved,
}: {
  open: boolean;
  total: number;
  onClose: (saved: number) => void;
  onSaved: (file: FileItem) => void;
}) {
  const toast = useToast();
  const [queue, setQueue] = useState<FileItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const [remaining, setRemaining] = useState(total);
  const [broken, setBroken] = useState(false);
  const seen = useRef(new Set<number>());
  const exhausted = useRef(false);
  const field = useRef<HTMLTextAreaElement | null>(null);

  const fetchMore = useCallback(async () => {
    for (let page = 1; page <= 20; page += 1) {
      const result = await listFiles({ page, limit: PAGE, search: '', type: '', sort: 'newest', missingAlt: true });
      setRemaining(result.total);
      const fresh = result.files.filter((file) => !seen.current.has(file.id));
      if (fresh.length) return fresh;
      if (!result.hasNext) break;
    }
    exhausted.current = true;
    return [];
  }, []);

  useEffect(() => {
    if (!open) return;
    seen.current = new Set();
    exhausted.current = false;
    setQueue(null);
    setIndex(0);
    setSaved(0);
    setText('');
    setRemaining(total);
    fetchMore()
      .then((files) => setQueue(files))
      .catch((failure) => {
        setQueue([]);
        toast(errorMessage(failure), { variant: 'error' });
      });
  }, [open, fetchMore, toast, total]);

  const current = queue && index < queue.length ? queue[index] : null;

  useEffect(() => {
    setBroken(false);
    setText(current?.alt || '');
    if (current) window.requestAnimationFrame(() => field.current?.focus());
  }, [current]);

  const advance = async () => {
    if (!queue) return;
    if (current) seen.current.add(current.id);
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      return;
    }
    if (exhausted.current) {
      setIndex(queue.length);
      return;
    }
    setBusy(true);
    try {
      const more = await fetchMore();
      if (more.length) {
        setQueue([...queue, ...more]);
        setIndex(index + 1);
      } else setIndex(queue.length);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!current || !text.trim()) return;
    setBusy(true);
    try {
      const { file } = await updateFile(current.id, { alt: text.trim() });
      onSaved(file);
      setSaved((count) => count + 1);
      setRemaining((count) => Math.max(0, count - 1));
      setBusy(false);
      await advance();
    } catch (failure) {
      setBusy(false);
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const done = queue !== null && !current;
  const position = queue ? Math.min(index + 1, queue.length) : 0;
  const totalCount = Math.max(remaining + saved, queue ? queue.length : 0, 1);
  const preview = current ? current.urls.preview || current.urls.direct : '';

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : () => onClose(saved)}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="alt-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <AccessibilityNewRounded sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="alt-title" sx={{ textAlign: 'center', pb: 0.5 }}>
        {t('Alternativtexte nachtragen')}
      </DialogTitle>
      <DialogContent>
        {queue === null ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : done ? (
          <Box sx={{ textAlign: 'center', py: 4, display: 'grid', justifyItems: 'center', gap: 1 }}>
            <CheckCircleOutlineRounded sx={{ fontSize: 44, color: c.primary }} />
            <Typography variant="h6" component="p">
              {remaining === 0 ? t('Alles beschrieben') : t('Für heute geschafft')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 380 }}>
              {saved
                ? tn(saved, 'Du hast 1 Alternativtext nachgetragen.', 'Du hast {count} Alternativtexte nachgetragen.')
                : remaining === 0
                  ? t('Alle Bilder und Videos haben einen Alternativtext.')
                  : t('Du hast alle übrigen übersprungen.')}
              {remaining > 0 && saved > 0 ? ` ${tn(remaining, 'Eine Datei ist noch offen.', '{count} Dateien sind noch offen.')}` : ''}
            </Typography>
          </Box>
        ) : (
          current && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 1 }}>
                  {t('{position} von {total}', { position, total: totalCount })}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (index / totalCount) * 100)}
                  aria-label={t('Fortschritt')}
                  sx={{ borderRadius: 4, height: 6 }}
                />
              </Box>
              <Box
                sx={{
                  display: 'grid',
                  placeItems: 'center',
                  height: { xs: '34vh', sm: '42vh' },
                  borderRadius: `${radius.lg}px`,
                  bgcolor: c.surfaceContainerHighest,
                  overflow: 'hidden',
                }}
              >
                {!broken && preview ? (
                  <Box
                    component="img"
                    key={current.id}
                    src={preview}
                    alt=""
                    onError={() => setBroken(true)}
                    sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('Keine Vorschau')}
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', overflowWrap: 'anywhere', mt: -1 }}>
                {displayName(current)}
                {current.type === 'video' ? ` · ${t('Video')}` : ''}
              </Typography>
              <TextField
                inputRef={field}
                label={current.type === 'video' ? t('Was passiert im Video?') : t('Was ist zu sehen?')}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    void save();
                  }
                }}
                multiline
                minRows={2}
                maxRows={5}
                helperText={t('Kurz und konkret, etwa „Hund springt am Strand nach einem Ball“. Strg+Enter speichert.')}
                slotProps={{ htmlInput: { maxLength: MAX_ALT } }}
                fullWidth
              />
            </Box>
          )
        )}
      </DialogContent>
      <DialogActions>
        {done || queue === null ? (
          <Button variant="contained" onClick={() => onClose(saved)} disabled={queue === null}>
            {t('Schließen')}
          </Button>
        ) : (
          <>
            <Button onClick={() => onClose(saved)} disabled={busy} sx={{ mr: 'auto' }}>
              {t('Beenden')}
            </Button>
            <Button onClick={() => void advance()} disabled={busy}>
              {t('Überspringen')}
            </Button>
            <Button
              variant="contained"
              onClick={() => void save()}
              disabled={busy || !text.trim()}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {t('Speichern und weiter')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
