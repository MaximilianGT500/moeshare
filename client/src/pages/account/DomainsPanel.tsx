import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { DomainCheck, DomainState, Preferences, UserDomain } from '../../lib/types';
import { ApiError, addDomain, errorMessage, fetchDomains, removeDomain, savePreferences, verifyDomain } from '../../lib/api';
import { relativeMs } from '../../lib/format';
import { t } from '../../lib/i18n';
import { CopyIconButton } from '../../components/CopyButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, ease, fonts, radius } from '../../theme/tokens';

function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '96px 1fr auto' }, alignItems: 'center', columnGap: 1.5, rowGap: 0.25 }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, gridColumn: { sm: '2 / 4' } }}>
        <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem', wordBreak: 'break-all', flex: 1, minWidth: 0 }}>
          {value}
        </Typography>
        <CopyIconButton
          value={value}
          size="small"
          label={t('{label} kopieren', { label })}
          icon={<ContentCopyRounded fontSize="inherit" />}
        />
      </Box>
    </Box>
  );
}

function CheckLine({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <Box sx={{ color: ok ? c.primary : ok === false ? c.error : c.onSurfaceVariant, display: 'flex', mt: 0.1 }}>
        {ok ? (
          <CheckCircleRounded fontSize="small" />
        ) : ok === false ? (
          <ErrorOutlineRounded fontSize="small" />
        ) : (
          <HourglassEmptyRounded fontSize="small" />
        )}
      </Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
            {hint}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function DomainCard({
  item,
  check,
  https,
  isDefault,
  busy,
  onVerify,
  onRemove,
  onDefault,
}: {
  item: UserDomain;
  check: DomainCheck | null;
  https: boolean;
  isDefault: boolean;
  busy: boolean;
  onVerify: () => void;
  onRemove: () => void;
  onDefault: () => void;
}) {
  const verified = item.status === 'verified';
  return (
    <Box sx={{ borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow, p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography
          variant="h6"
          component="h3"
          sx={{ fontFamily: fonts.mono, fontSize: '1.0625rem', wordBreak: 'break-all', flex: 1, minWidth: 180 }}
        >
          {item.domain}
        </Typography>
        <Chip
          size="small"
          icon={verified ? <CheckCircleRounded /> : <HourglassEmptyRounded />}
          label={verified ? t('Verbunden') : t('Wartet auf Bestätigung')}
          sx={
            verified
              ? { bgcolor: c.primaryContainer, color: c.onPrimaryContainer, '& .MuiChip-icon': { color: 'inherit' } }
              : { bgcolor: c.surfaceContainerHighest, color: c.onSurfaceVariant, '& .MuiChip-icon': { color: 'inherit' } }
          }
        />
        {isDefault && <Chip size="small" icon={<StarRounded />} label={t('Standard')} sx={{ '& .MuiChip-icon': { color: c.tertiary } }} />}
      </Box>

      {!verified && (
        <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2">{t('1. TXT-Eintrag anlegen')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              {t('Damit zeigst du, dass dir die Domain gehört. Lege ihn bei deinem DNS-Anbieter an.')}
            </Typography>
            <Box sx={{ display: 'grid', gap: 1, p: 1.5, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHigh }}>
              <RecordLine label={t('Typ')} value="TXT" />
              <RecordLine label={t('Name')} value={item.record.name} />
              <RecordLine label={t('Wert')} value={item.record.value} />
            </Box>
          </Box>
          <Box>
            <Typography variant="subtitle2">{t('2. Domain auf diesen Server zeigen lassen')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              {t(
                'Lege einen CNAME-Eintrag an. Für eine Hauptdomain ohne Subdomain nimmst du stattdessen A- und AAAA-Einträge mit den Adressen des Servers.'
              )}
            </Typography>
            <Box sx={{ display: 'grid', gap: 1, p: 1.5, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHigh }}>
              <RecordLine label={t('Typ')} value="CNAME" />
              <RecordLine label={t('Name')} value={item.domain} />
              <RecordLine label={t('Ziel')} value={item.target} />
            </Box>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {item.autoCheckUntil && item.autoCheckUntil > Date.now()
              ? t(
                  'MoeShare prüft die Einträge in den ersten sieben Tagen alle paar Minuten von selbst. Sobald alles stimmt, ist die Domain verbunden.'
                )
              : t('Die automatische Prüfung ist nach sieben Tagen beendet. Prüfe selbst, sobald die Einträge stehen.')}
          </Typography>
          {item.error && (
            <Alert severity="warning" variant="outlined">
              {item.error}
              {item.checkedAt ? ` ${t('Zuletzt geprüft {when}.', { when: relativeMs(item.checkedAt) })}` : ''}
            </Alert>
          )}
        </Box>
      )}

      <AnimatePresence initial={false}>
        {check?.verified && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}
            style={{ overflow: 'hidden' }}
          >
            <Box sx={{ mt: 2, display: 'grid', gap: 1.25 }}>
              <CheckLine ok label={t('TXT-Eintrag gefunden')} />
              <CheckLine
                ok={check.points}
                label={check.points ? t('Die Domain zeigt auf diesen Server') : t('Die Domain zeigt noch nicht auf diesen Server')}
                hint={check.points ? undefined : t('Prüfe den CNAME-Eintrag. Änderungen am DNS brauchen manchmal etwas Zeit.')}
              />
              <CheckLine
                ok={check.reachable}
                label={check.reachable ? (https ? t('Über HTTPS erreichbar') : t('Erreichbar')) : t('Noch nicht erreichbar')}
                hint={
                  check.reachable
                    ? undefined
                    : https
                      ? t('Das Zertifikat wird beim ersten Aufruf automatisch ausgestellt. Versuche es in einer Minute erneut.')
                      : t('Der Server antwortet unter dieser Domain noch nicht.')
                }
              />
            </Box>
          </m.div>
        )}
      </AnimatePresence>

      {verified && !check && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {t('Bestätigt {when}. Deine Links, Alben und dein Profil sind auch unter {origin} erreichbar.', {
            when: relativeMs(item.verifiedAt),
            origin: item.origin,
          })}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <Button
          variant={verified ? 'text' : 'contained'}
          onClick={onVerify}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <RefreshRounded />}
        >
          {verified ? t('Erneut prüfen') : t('Jetzt prüfen')}
        </Button>
        {verified && (
          <Button component="a" href={item.origin} target="_blank" rel="noopener" startIcon={<OpenInNewRounded />}>
            {t('Öffnen')}
          </Button>
        )}
        {verified && !isDefault && (
          <Button onClick={onDefault} disabled={busy} startIcon={<StarOutlineRounded />}>
            {t('Als Standard für neue Links')}
          </Button>
        )}
        <Button color="error" onClick={onRemove} disabled={busy} startIcon={<DeleteOutlineRounded />} sx={{ ml: { sm: 'auto' } }}>
          {t('Entfernen')}
        </Button>
      </Box>
    </Box>
  );
}

export function DomainsPanel({
  initial,
  preferences,
  onPreferences,
}: {
  initial: DomainState;
  preferences: Preferences;
  onPreferences: (preferences: Preferences) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<DomainState>(initial);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [checks, setChecks] = useState<Record<number, DomainCheck>>({});
  const full = state.items.length >= state.max;
  const current = useRef(state);
  current.current = state;
  const waiting = state.enabled && state.items.some((item) => item.status === 'pending');

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await fetchDomains();
        const before = current.current.items;
        for (const item of next.items) {
          const previous = before.find((entry) => entry.id === item.id);
          if (previous && previous.status !== 'verified' && item.status === 'verified') {
            toast(t('{domain} ist bestätigt', { domain: item.domain }), { variant: 'success' });
          }
        }
        setState(next);
      } catch {}
    }, 30000);
    return () => window.clearInterval(timer);
  }, [waiting, toast]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setAdding(true);
    setError('');
    try {
      const result = await addDomain(value);
      setState(result.domains);
      setInput('');
      toast(t('{domain} hinzugefügt. Lege jetzt die DNS-Einträge an.', { domain: result.domain.domain }), { variant: 'success' });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : errorMessage(failure));
    } finally {
      setAdding(false);
    }
  };

  const verify = async (item: UserDomain) => {
    setBusy(item.id);
    try {
      const result = await verifyDomain(item.id);
      setState(result.domains);
      setChecks((current) => ({ ...current, [item.id]: result.result }));
      if (result.result.verified && item.status !== 'verified')
        toast(t('{domain} ist bestätigt', { domain: item.domain }), { variant: 'success' });
      else if (!result.result.verified) toast(t('Noch nicht bestätigt'), { variant: 'info' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: UserDomain) => {
    const ok = await confirm({
      title: t('Domain entfernen?'),
      message: t('Links über {domain} funktionieren danach nicht mehr. Die Dateien selbst bleiben erhalten.', { domain: item.domain }),
      confirmLabel: t('Entfernen'),
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      const result = await removeDomain(item.id);
      setState(result.domains);
      if (preferences.domain === item.origin) onPreferences({ ...preferences, domain: null });
      toast(t('Domain entfernt'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const makeDefault = async (item: UserDomain) => {
    setBusy(item.id);
    try {
      const result = await savePreferences({ domain: item.origin });
      onPreferences(result.preferences);
      toast(t('Neue Links nutzen jetzt {domain}', { domain: item.domain }), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" component="h2">
          {t('Eigene Domains')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 680 }}>
          {t(
            'Verbinde eine Domain, die dir gehört, zum Beispiel bilder.deinname.de. Deine Dateien, Alben, Kurzlinks und dein Profil sind dann auch darüber erreichbar.'
          )}
        </Typography>
      </Box>

      {!state.enabled && (
        <Alert severity="info">
          {t('Eigene Domains sind auf diesem Server gerade abgeschaltet. Bestehende Domains bleiben gespeichert.')}
        </Alert>
      )}

      {state.enabled && (
        <Box
          component="form"
          onSubmit={add}
          sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}
        >
          <TextField
            fullWidth
            size="small"
            label={t('Domain')}
            placeholder="bilder.beispiel.de"
            value={input}
            disabled={full || adding}
            error={!!error}
            helperText={error || (full ? t('Du kannst höchstens {max} Domains verbinden.', { max: state.max }) : ' ')}
            onChange={(event) => {
              setInput(event.target.value);
              if (error) setError('');
            }}
            slotProps={{ htmlInput: { inputMode: 'url', spellCheck: false, autoCapitalize: 'none', autoComplete: 'off' } }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={full || adding || !input.trim()}
            startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
            sx={{ flexShrink: 0, height: 40 }}
          >
            {t('Hinzufügen')}
          </Button>
        </Box>
      )}

      {state.items.map((item) => (
        <DomainCard
          key={item.id}
          item={item}
          check={checks[item.id] || null}
          https={state.https}
          isDefault={preferences.domain === item.origin}
          busy={busy === item.id}
          onVerify={() => verify(item)}
          onRemove={() => remove(item)}
          onDefault={() => makeDefault(item)}
        />
      ))}

      {!state.items.length && state.enabled && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('Noch keine Domain verbunden.')}
        </Typography>
      )}
    </Stack>
  );
}
