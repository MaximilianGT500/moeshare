import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PublishRounded from '@mui/icons-material/PublishRounded';
import type { AdminTerms } from '../../lib/types';
import { ApiError, errorMessage, fetchAdminTerms, publishTerms } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useConfirm } from '../../components/ConfirmDialog';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { c, fonts, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

export function TermsEditor() {
  const toast = useToast();
  const sudo = useSudo();
  const confirm = useConfirm();
  const [data, setData] = useState<AdminTerms | null>(null);
  const [text, setText] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [minor, setMinor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdminTerms()
      .then((result) => {
        setData(result);
        setText(result.text);
        setEnabled(result.enabled);
      })
      .catch((failure) => setError(errorMessage(failure)));
  }, []);

  if (!data) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {error ? <Alert severity="error">{error}</Alert> : <Skeleton variant="rounded" height={160} />}
      </Box>
    );
  }

  const changedText = text.trim() !== data.text.trim();
  const changed = changedText || enabled !== data.enabled;
  const firstTime = data.version === 0;

  const publish = async () => {
    if (enabled && changedText && !minor && !firstTime) {
      const ok = await confirm({
        title: t('Neue Fassung veröffentlichen?'),
        message: tn(
          data.total,
          'Das Konto muss beim nächsten Besuch neu zustimmen. Bis dahin bleiben Dateien und Links erreichbar.',
          'Alle {count} Konten müssen beim nächsten Besuch neu zustimmen. Bis dahin bleiben Dateien und Links erreichbar.'
        ),
        confirmLabel: t('Veröffentlichen'),
        icon: <PublishRounded />,
      });
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await sudo(() => publishTerms({ text, minor: minor && !firstTime, enabled }));
      setData(result);
      setText(result.text);
      setEnabled(result.enabled);
      setMinor(false);
      toast(
        !result.enabled
          ? t('Nutzungsbedingungen abgeschaltet')
          : result.version !== data.version
            ? t('Fassung {version} veröffentlicht', { version: result.version })
            : t('Gespeichert, ohne neue Zustimmung'),
        { variant: 'success' }
      );
    } catch (failure) {
      if (isCancelled(failure)) return;
      if (failure instanceof ApiError && failure.field === 'text') setError(failure.message);
      else toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const share = data.total ? data.accepted / data.total : 0;

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, display: 'grid', gap: 2 }}>
      <FormControlLabel
        control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={busy} />}
        label={t('Zustimmung verlangen')}
      />
      {data.enabled && data.version > 0 && (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          <Typography variant="body2">
            {t('Fassung {version} vom {date}: {accepted} von {total} Konten haben zugestimmt.', {
              version: data.version,
              date: data.publishedAt ? formatDate(new Date(data.publishedAt)) : '–',
              accepted: data.accepted,
              total: data.total,
            })}{' '}
            <Link href="/nutzungsbedingungen" target="_blank" rel="noopener" underline="hover">
              {t('Ansehen')}
            </Link>
          </Typography>
          <LinearProgress
            variant="determinate"
            value={share * 100}
            aria-label={t('Anteil der Zustimmungen')}
            sx={{ height: 6, borderRadius: `${radius.full}px`, maxWidth: 360 }}
          />
        </Box>
      )}
      <TextField
        label={t('Text')}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError('');
        }}
        multiline
        minRows={8}
        maxRows={24}
        fullWidth
        disabled={busy}
        error={Boolean(error)}
        helperText={error || t('Absätze trennst du mit einer Leerzeile, Überschriften beginnen mit ##. Links werden von selbst klickbar.')}
        slotProps={{ htmlInput: { maxLength: 100000, style: { fontFamily: fonts.mono, fontSize: '0.875rem', lineHeight: 1.6 } } }}
      />
      {!firstTime && enabled && changedText && (
        <FormControlLabel
          control={<Checkbox checked={minor} onChange={(event) => setMinor(event.target.checked)} disabled={busy} />}
          label={
            <Box>
              <Typography variant="body2">{t('Nur kleine Korrektur')}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('Tippfehler und Formulierungen. Niemand muss neu zustimmen.')}
              </Typography>
            </Box>
          }
        />
      )}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          onClick={publish}
          disabled={busy || !changed || (enabled && !text.trim())}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PublishRounded />}
        >
          {enabled ? (firstTime || !minor ? t('Veröffentlichen') : t('Speichern')) : t('Speichern')}
        </Button>
        {enabled && (
          <Typography variant="caption" sx={{ color: c.onSurfaceVariant }}>
            {t('Neue Konten stimmen bei der Registrierung zu, bestehende beim nächsten Besuch.')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
