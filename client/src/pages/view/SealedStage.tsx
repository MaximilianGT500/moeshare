import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EnhancedEncryptionRounded from '@mui/icons-material/EnhancedEncryptionRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import { useDesign } from '../../lib/design';
import { formatBytes } from '../../lib/format';
import { mix } from '../../lib/color';
import { t } from '../../lib/i18n';
import { keyFromHash, parseKey, SealedError, toBase64Url, unseal, type SealedMeta } from '../../lib/sealed';
import { c, elevation, fonts, radius } from '../../theme/tokens';
import type { ViewModel } from './parts';

type Phase = 'missing' | 'loading' | 'error';

function failureText(error: unknown) {
  if (error instanceof SealedError) {
    if (error.reason === 'key') return t('Der Schlüssel passt nicht zu dieser Datei. Prüf, ob du den vollständigen Link hast.');
    return t('Die Datei ist beschädigt und lässt sich nicht entschlüsseln.');
  }
  return t('Die Datei ließ sich nicht laden. Versuch es noch einmal.');
}

export function SealedStage({ model }: { model: ViewModel }) {
  const { r } = useDesign();
  const { file, urls, onUnseal } = model;
  const [phase, setPhase] = useState<Phase>(() => (keyFromHash() ? 'loading' : 'missing'));
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [received, setReceived] = useState(0);
  const [meta, setMeta] = useState<SealedMeta | null>(null);
  const started = useRef(false);

  const open = useCallback(
    async (raw: Uint8Array, fromInput: boolean) => {
      setPhase('loading');
      setError('');
      setReceived(0);
      try {
        const response = await fetch(urls.raw, { credentials: 'same-origin' });
        if (!response.ok || !response.body) throw new Error(String(response.status));
        const opened = await unseal(response.body, raw, { onMeta: setMeta, onProgress: setReceived });
        const key = toBase64Url(raw);
        if (fromInput) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#k=${key}`);
        onUnseal?.({ meta: opened.meta, url: URL.createObjectURL(opened.blob), key });
      } catch (failure) {
        setPhase('error');
        setError(failureText(failure));
      }
    },
    [urls.raw, onUnseal]
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const raw = keyFromHash();
    if (raw) void open(raw, false);
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const raw = parseKey(input);
    if (!raw) {
      setPhase('error');
      setError(t('Das ist kein gültiger Schlüssel. Füg den ganzen Link oder den Teil nach #k= ein.'));
      return;
    }
    void open(raw, true);
  };

  const total = file.sizeBytes || 0;
  const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;

  return (
    <Box
      sx={{
        width: 'min(640px, 100%)',
        mx: 'auto',
        py: { xs: 4.5, sm: 6 },
        px: { xs: 2.5, sm: 5 },
        borderRadius: `${r(radius.xl)}px`,
        textAlign: 'center',
        bgcolor: mix(c.surfaceContainerHigh, 88),
        backdropFilter: 'blur(20px)',
        boxShadow: elevation[3],
      }}
    >
      <Box
        sx={{
          width: 96,
          height: 96,
          mx: 'auto',
          borderRadius: `${r(32)}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.tertiaryContainer,
          color: c.onTertiaryContainer,
          '& svg': { fontSize: 46 },
        }}
      >
        {phase === 'loading' ? <LockOpenRounded /> : <EnhancedEncryptionRounded />}
      </Box>
      <Typography variant="h5" component="h2" sx={{ mt: 2.5, fontWeight: 800 }}>
        {t('Ende-zu-Ende verschlüsselt')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, maxWidth: 440, mx: 'auto' }}>
        {t('Entschlüsselt wird nur in deinem Browser. Der Server kennt weder den Inhalt noch den Namen.')}
      </Typography>

      {phase === 'loading' && (
        <Box sx={{ mt: 3.5, maxWidth: 420, mx: 'auto' }} role="status" aria-live="polite">
          <LinearProgress variant={received ? 'determinate' : 'indeterminate'} value={percent} sx={{ height: 6, borderRadius: 3 }} />
          <Typography variant="body2" sx={{ mt: 1.25, color: 'text.secondary' }}>
            {meta
              ? t('{name} wird entschlüsselt, {percent} %', { name: meta.name, percent })
              : t('Wird geladen und entschlüsselt, {size}', { size: formatBytes(total) })}
          </Typography>
        </Box>
      )}

      {phase !== 'loading' && (
        <Box component="form" onSubmit={submit} sx={{ mt: 3.5, maxWidth: 460, mx: 'auto', textAlign: 'left' }}>
          <Typography variant="body2" sx={{ mb: 1.5, color: phase === 'error' ? c.error : 'text.primary', textAlign: 'center' }}>
            {phase === 'error' ? error : t('Im Link fehlt der Schlüssel. Füg den vollständigen Link oder nur den Schlüssel ein.')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
            <TextField
              size="small"
              fullWidth
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('Link oder Schlüssel')}
              slotProps={{
                htmlInput: {
                  spellCheck: false,
                  autoComplete: 'off',
                  'aria-label': t('Link oder Schlüssel'),
                  style: { fontFamily: fonts.mono },
                },
              }}
            />
            <Button type="submit" variant="contained" disabled={!input.trim()} sx={{ height: 40, flexShrink: 0 }}>
              {t('Entschlüsseln')}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
