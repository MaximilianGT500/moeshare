import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import SubtitlesOutlined from '@mui/icons-material/SubtitlesOutlined';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import type { FileItem, Subtitle } from '../../lib/types';
import { ApiError, addSubtitle, deleteSubtitle, errorMessage, fetchSubtitles, updateSubtitle } from '../../lib/api';
import { useToast } from '../../components/Toaster';
import { c, fonts, radius } from '../../theme/tokens';
import { language as uiLanguage, t } from '../../lib/i18n';

const LANGUAGES: Array<[string, string]> = [
  ['de', t('Deutsch')],
  ['en', t('Englisch')],
  ['fr', t('Französisch')],
  ['es', t('Spanisch')],
  ['it', t('Italienisch')],
  ['nl', t('Niederländisch')],
  ['pl', t('Polnisch')],
  ['pt', t('Portugiesisch')],
  ['tr', t('Türkisch')],
  ['uk', t('Ukrainisch')],
  ['ru', t('Russisch')],
  ['ar', t('Arabisch')],
  ['ja', t('Japanisch')],
  ['ko', t('Koreanisch')],
  ['zh', t('Chinesisch')],
];

const labelFor = (code: string) => LANGUAGES.find(([key]) => key === code)?.[1] || code.toUpperCase();

function guessLanguage(name: string) {
  const match = /[._-]([a-z]{2,3})(?:[._-](?:forced|sdh|cc))?\.(?:srt|vtt)$/i.exec(name);
  const code = match ? match[1].toLowerCase() : '';
  return LANGUAGES.some(([key]) => key === code) ? code : '';
}

export function SubtitlesDialog({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const toast = useToast();
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Subtitle[] | null>(null);
  const [picked, setPicked] = useState<{ name: string; content: string } | null>(null);
  const [language, setLanguage] = useState<string>(uiLanguage);
  const [label, setLabel] = useState('');
  const [preferred, setPreferred] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return;
    setItems(null);
    setPicked(null);
    setError('');
    fetchSubtitles(file.id)
      .then((result) => setItems(result.subtitles))
      .catch((failure) => setError(errorMessage(failure)));
  }, [file]);

  const pick = async (chosen: File) => {
    setError('');
    if (chosen.size > 512 * 1024) {
      setError(t('Untertitel dürfen höchstens 512 KB groß sein.'));
      return;
    }
    const content = await chosen.text();
    setPicked({ name: chosen.name, content });
    const guessed = guessLanguage(chosen.name);
    if (guessed) setLanguage(guessed);
    setLabel('');
    setPreferred(!(items || []).length);
  };

  const add = async () => {
    if (!file || !picked) return;
    setBusy(true);
    setError('');
    try {
      const result = await addSubtitle(file.id, {
        language,
        label: label.trim() || labelFor(language),
        content: picked.content,
        default: preferred,
      });
      setItems(result.subtitles);
      setPicked(null);
      toast(t('Untertitel hinzugefügt'), { variant: 'success' });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (item: Subtitle) => {
    if (!file) return;
    try {
      const result = await updateSubtitle(file.id, item.id, { default: !item.default });
      setItems(result.subtitles);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const remove = async (item: Subtitle) => {
    if (!file) return;
    try {
      const result = await deleteSubtitle(file.id, item.id);
      setItems(result.subtitles);
      toast(t('Untertitel entfernt'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  return (
    <Dialog open={!!file} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{t('Untertitel')}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t(
              'Lade Untertitel als SRT oder WebVTT hoch. Sie erscheinen im Player auf der Ansichtsseite und lassen sich dort ein- und ausschalten.'
            )}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {!items && !error && <Skeleton variant="rounded" height={56} />}
          {items && items.length > 0 && (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHigh }}>
              {items.map((item, index) => (
                <Box
                  component="li"
                  key={item.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1,
                    borderTop: index ? `1px solid ${c.outlineVariant}` : 'none',
                  }}
                >
                  <SubtitlesOutlined sx={{ color: 'text.secondary' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {item.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: fonts.mono }}>
                      {item.language}
                    </Typography>
                  </Box>
                  <Tooltip title={item.default ? t('Startet eingeschaltet') : t('Eingeschaltet starten')}>
                    <IconButton onClick={() => makeDefault(item)} aria-pressed={item.default} aria-label={t('Eingeschaltet starten')}>
                      {item.default ? <StarRounded sx={{ color: c.tertiary }} /> : <StarOutlineRounded />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('Entfernen')}>
                    <IconButton onClick={() => remove(item)} aria-label={t('{label} entfernen', { label: item.label })}>
                      <DeleteOutlineRounded />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}
          {picked ? (
            <Box sx={{ display: 'grid', gap: 2, p: 2, borderRadius: `${radius.md}px`, border: `1px solid ${c.outlineVariant}` }}>
              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                {picked.name}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <TextField select size="small" label={t('Sprache')} value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {LANGUAGES.map(([code, name]) => (
                    <MenuItem key={code} value={code}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  label={t('Name im Player')}
                  placeholder={labelFor(language)}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 60 } }}
                />
              </Box>
              <FormControlLabel
                control={<Switch checked={preferred} onChange={(event) => setPreferred(event.target.checked)} />}
                label={t('Eingeschaltet starten')}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button onClick={() => setPicked(null)} disabled={busy}>
                  {t('Verwerfen')}
                </Button>
                <Button
                  variant="contained"
                  onClick={add}
                  disabled={busy}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {t('Hinzufügen')}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box>
              <Button
                variant="outlined"
                startIcon={<UploadFileRounded />}
                onClick={() => input.current?.click()}
                disabled={!items || items.length >= 10}
              >
                {t('Datei wählen')}
              </Button>
              {items && items.length >= 10 && (
                <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
                  {t('Höchstens 10 Untertitel pro Video.')}
                </Typography>
              )}
            </Box>
          )}
          <input
            ref={input}
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            hidden
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) pick(chosen);
              event.target.value = '';
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Fertig')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
