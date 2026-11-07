import { useCallback, useEffect, useMemo, useState } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import LockClockRounded from '@mui/icons-material/LockClockRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import UploadRounded from '@mui/icons-material/UploadRounded';
import type { CaddyAdapt, CaddyState, CertificateInfo, CertificateStatus, SettingsPayload, TlsRequest } from '../../lib/types';
import {
  adaptCaddyfile,
  checkCertificate,
  checkCertificates,
  errorMessage,
  fetchCaddy,
  fetchCaddyfile,
  loadCaddyfile,
  saveSettings,
  ApiError,
} from '../../lib/api';
import { formatDate, formatNumber, relativeMs } from '../../lib/format';
import { siteName } from '../../lib/boot';
import { SettingRow, SettingsSection, SwitchRow } from '../../components/SettingsKit';
import { CopyIconButton } from '../../components/CopyButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { Card, Row } from './SystemPanel';
import { c, ease, fonts, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

const STATUS: Record<CertificateStatus, { label: string; bg: string; fg: string }> = {
  ok: { label: t('Gültig'), bg: c.successContainer, fg: c.onSuccessContainer },
  warning: { label: t('Läuft bald ab'), bg: c.warningContainer, fg: c.onWarningContainer },
  untrusted: { label: t('Nicht vertrauenswürdig'), bg: c.warningContainer, fg: c.onWarningContainer },
  expired: { label: t('Abgelaufen'), bg: c.errorContainer, fg: c.onErrorContainer },
  error: { label: t('Fehler'), bg: c.errorContainer, fg: c.onErrorContainer },
  unchecked: { label: t('Noch nicht geprüft'), bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant },
};

const SOURCE: Record<CertificateInfo['source'], string> = {
  site: t('Hauptadresse'),
  custom: t('Eigene Domain'),
  caddy: t('Aus Caddy'),
};

const REASON: Record<string, string> = {
  site: t('Adresse dieses Servers'),
  custom: t('Eigene Domain eines Kontos'),
  unknown: t('Unbekannte Domain'),
  empty: t('Ohne Domain'),
};

const ORDER: CertificateStatus[] = ['expired', 'error', 'warning', 'untrusted', 'unchecked', 'ok'];
const LIFETIME_DAYS = 90;

function StatusChip({ status }: { status: CertificateStatus }) {
  const look = STATUS[status] || STATUS.unchecked;
  return <Chip size="small" label={look.label} sx={{ bgcolor: look.bg, color: look.fg, fontWeight: 700 }} />;
}

function Lifetime({ item }: { item: CertificateInfo }) {
  if (item.daysLeft === null || item.daysLeft === undefined || !item.validTo) return null;
  const days = Math.max(0, item.daysLeft);
  const share = Math.min(1, days / LIFETIME_DAYS);
  const fill = item.status === 'expired' ? c.error : item.status === 'warning' ? c.warning : c.success;
  return (
    <Box sx={{ mt: 1.25 }}>
      <Box
        role="meter"
        aria-label={t('Restlaufzeit des Zertifikats')}
        aria-valuenow={days}
        aria-valuemin={0}
        aria-valuemax={LIFETIME_DAYS}
        sx={{ height: 6, borderRadius: `${radius.full}px`, bgcolor: c.surfaceContainerHighest, overflow: 'hidden', maxWidth: 360 }}
      >
        <m.div
          initial={{ width: 0 }}
          animate={{ width: `${share * 100}%` }}
          transition={{ duration: 0.7, ease: ease.emphasizedDecelerate }}
          style={{ height: '100%', background: fill, borderRadius: 999 }}
        />
      </Box>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.75 }}>
        {item.daysLeft < 0
          ? t('Abgelaufen am {date}', { date: formatDate(new Date(item.validTo)) })
          : tn(item.daysLeft, 'Gültig bis {date}, noch 1 Tag', 'Gültig bis {date}, noch {count} Tage', {
              date: formatDate(new Date(item.validTo)),
            })}
      </Typography>
    </Box>
  );
}

function CertificateRow({ item, busy, onCheck }: { item: CertificateInfo; busy: boolean; onCheck: () => void }) {
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontFamily: fonts.mono, fontSize: '0.9375rem', fontWeight: 600, wordBreak: 'break-all' }}>
            {item.domain}
          </Typography>
          <StatusChip status={item.status} />
          <Chip size="small" variant="outlined" label={SOURCE[item.source] || item.source} />
        </Box>
        {item.issuer && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {t('Ausgestellt von {issuer}', { issuer: item.issuer })}
          </Typography>
        )}
        {item.error && (
          <Typography
            variant="body2"
            sx={{ color: item.status === 'warning' || item.status === 'untrusted' ? c.onSurfaceVariant : c.error, mt: 0.5 }}
          >
            {item.error}
          </Typography>
        )}
        <Lifetime item={item} />
        {item.checkedAt && (
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {t('Geprüft {when}', { when: relativeMs(item.checkedAt) })}
          </Typography>
        )}
      </Box>
      <Tooltip title={t('Jetzt prüfen')}>
        <span>
          <IconButton onClick={onCheck} disabled={busy} aria-label={t('{domain} prüfen', { domain: item.domain })}>
            {busy ? <CircularProgress size={20} /> : <RefreshRounded />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

function RequestRow({ item }: { item: TlsRequest }) {
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.25, display: 'flex', gap: 1.5, alignItems: 'center' }}>
      {item.allowed ? (
        <CheckCircleRounded sx={{ color: c.success, fontSize: 20 }} aria-label={t('Erlaubt')} />
      ) : (
        <BlockRounded sx={{ color: c.error, fontSize: 20 }} aria-label={t('Abgelehnt')} />
      )}
      <Typography sx={{ fontFamily: fonts.mono, fontSize: '0.875rem', flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
        {item.domain}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
        {REASON[item.reason] || item.reason}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {relativeMs(item.at)}
      </Typography>
    </Box>
  );
}

function CaddyfileTool({ onLoaded }: { onLoaded: () => void }) {
  const toast = useToast();
  const sudo = useSudo();
  const confirm = useConfirm();
  const [mode, setMode] = useState<'docker' | 'native'>('docker');
  const [email, setEmail] = useState('');
  const [text, setText] = useState('');
  const [generated, setGenerated] = useState('');
  const [result, setResult] = useState<CaddyAdapt | null>(null);
  const [busy, setBusy] = useState<'' | 'make' | 'adapt' | 'load'>('');

  const generate = useCallback(
    async (nextMode: 'docker' | 'native', nextEmail: string) => {
      setBusy('make');
      try {
        const body = await fetchCaddyfile(nextMode, nextEmail);
        setGenerated(body);
        setText(body);
        setResult(null);
      } catch (failure) {
        toast(errorMessage(failure), { variant: 'error' });
      } finally {
        setBusy('');
      }
    },
    [toast]
  );

  useEffect(() => {
    generate('docker', '');
  }, [generate]);

  const check = async () => {
    setBusy('adapt');
    try {
      setResult(await adaptCaddyfile(text));
    } catch (failure) {
      setResult({ ok: false, error: errorMessage(failure), warnings: [] });
    } finally {
      setBusy('');
    }
  };

  const load = async () => {
    const ok = await confirm({
      title: t('Caddyfile in Caddy laden?'),
      message: t(
        'Caddy übernimmt die neue Konfiguration sofort. Ist sie fehlerhaft, bleibt die alte aktiv. Die Datei auf dem Server änderst du damit nicht, nach einem Neustart von Caddy gilt wieder sie.'
      ),
      confirmLabel: t('Laden'),
      destructive: false,
      icon: <UploadRounded />,
    });
    if (!ok) return;
    setBusy('load');
    try {
      const response = await sudo(() => loadCaddyfile(text));
      toast(response.warnings.length ? t('Geladen, mit Hinweisen von Caddy') : t('Caddy nutzt jetzt die neue Konfiguration'), {
        variant: 'success',
      });
      setResult({ ok: true, error: null, warnings: response.warnings });
      onLoaded();
    } catch (failure) {
      if (!isCancelled(failure)) setResult({ ok: false, error: errorMessage(failure), warnings: [] });
    } finally {
      setBusy('');
    }
  };

  const download = useMemo(() => {
    const blob = new Blob([text], { type: 'text/plain' });
    return URL.createObjectURL(blob);
  }, [text]);
  useEffect(() => () => URL.revokeObjectURL(download), [download]);

  return (
    <SettingsSection
      title={t('Caddyfile')}
      description={t(
        'Eine passende Konfiguration für diesen Server, mit allen Adressen und eigenen Domains. Du kannst sie anpassen, von Caddy prüfen lassen und direkt laden.'
      )}
    >
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_event, next) => {
              if (!next) return;
              setMode(next);
              generate(next, email);
            }}
          >
            <ToggleButton value="docker">{t('Docker')}</ToggleButton>
            <ToggleButton value="native">{t('Direkt installiert')}</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            type="email"
            label={t('E-Mail für Let’s Encrypt')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => generate(mode, email)}
            sx={{ minWidth: 240, flex: 1, maxWidth: 360 }}
          />
        </Box>
        <TextField
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult(null);
          }}
          multiline
          minRows={10}
          maxRows={24}
          fullWidth
          aria-label={t('Caddyfile')}
          slotProps={{
            htmlInput: { spellCheck: false, style: { fontFamily: fonts.mono, fontSize: '0.8125rem', lineHeight: 1.6, tabSize: 4 } },
          }}
        />
        {result && (
          <Alert severity={result.ok ? (result.warnings.length ? 'warning' : 'success') : 'error'}>
            {result.ok ? (
              <>
                {result.warnings.length ? t('Caddy versteht die Datei, hat aber Hinweise:') : t('Caddy versteht die Datei.')}
                {result.summary && (
                  <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                    {tn(result.summary.sites.length, '1 Seite', '{count} Seiten')}
                    {result.summary.onDemand ? `, ${t('Zertifikate auf Abruf für eigene Domains')}` : ''}
                  </Box>
                )}
                {result.warnings.map((warning) => (
                  <Box component="span" key={warning} sx={{ display: 'block', fontFamily: fonts.mono, fontSize: '0.8125rem', mt: 0.5 }}>
                    {warning}
                  </Box>
                ))}
              </>
            ) : (
              <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}>
                {result.error}
              </Box>
            )}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="outlined" startIcon={<FactCheckRounded />} onClick={check} disabled={!!busy || !text.trim()}>
            {t('Prüfen')}
          </Button>
          <Button variant="contained" startIcon={<UploadRounded />} onClick={load} disabled={!!busy || !text.trim()}>
            {t('In Caddy laden')}
          </Button>
          <Box sx={{ flex: 1 }} />
          {text !== generated && (
            <Button onClick={() => setText(generated)} disabled={!!busy}>
              {t('Vorschlag wiederherstellen')}
            </Button>
          )}
          <CopyIconButton value={text} label={t('Caddyfile kopieren')} message={t('Caddyfile kopiert')} icon={<ContentCopyRounded />} />
          <Tooltip title={t('Als Datei speichern')}>
            <IconButton component="a" href={download} download="Caddyfile" aria-label={t('Als Datei speichern')}>
              <DownloadRounded />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </SettingsSection>
  );
}

function CaddySettings({ settings, onSettings }: { settings: SettingsPayload; onSettings: (next: SettingsPayload) => void }) {
  const toast = useToast();
  const values = settings.values;
  const [adminUrl, setAdminUrl] = useState(String(values['caddy.adminUrl'] || ''));
  const [tlsAddress, setTlsAddress] = useState(String(values['caddy.tlsAddress'] || ''));
  const [monitor, setMonitor] = useState(values['caddy.monitor'] !== false);
  const [warnDays, setWarnDays] = useState(String(values['caddy.warnDays'] ?? 14));
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState('');
  const [error, setError] = useState('');
  const dirty =
    adminUrl !== String(values['caddy.adminUrl'] || '') ||
    tlsAddress !== String(values['caddy.tlsAddress'] || '') ||
    monitor !== (values['caddy.monitor'] !== false) ||
    warnDays !== String(values['caddy.warnDays'] ?? 14);

  const save = async () => {
    setBusy(true);
    setField('');
    setError('');
    try {
      const next = await saveSettings({
        'caddy.adminUrl': adminUrl.trim(),
        'caddy.tlsAddress': tlsAddress.trim(),
        'caddy.monitor': monitor,
        'caddy.warnDays': Number(warnDays) || 14,
      });
      onSettings(next);
      toast(t('Einstellungen gespeichert'), { variant: 'success' });
    } catch (failure) {
      setError(errorMessage(failure));
      setField(failure instanceof ApiError ? failure.field : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title={t('Verbindung und Überwachung')}>
      <SettingRow
        label={t('Admin-API von Caddy')}
        description={t('Leer lassen, dann sucht {name} selbst nach http://caddy:2019 und http://127.0.0.1:2019.', { name: siteName() })}
        htmlFor="caddy-admin-url"
        stacked
      >
        <TextField
          id="caddy-admin-url"
          value={adminUrl}
          onChange={(event) => setAdminUrl(event.target.value)}
          placeholder="http://caddy:2019"
          fullWidth
          error={field === 'caddy.adminUrl'}
          helperText={field === 'caddy.adminUrl' ? error : undefined}
          slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: fonts.mono } } }}
        />
      </SettingRow>
      <SettingRow
        label={t('Adresse für die Zertifikatsprüfung')}
        description={t(
          'Wo {name} Caddy per HTTPS erreicht, um Zertifikate anzusehen. Leer lassen, dann fragt {name} die Domains direkt ab.',
          { name: siteName() }
        )}
        htmlFor="caddy-tls-address"
        stacked
      >
        <TextField
          id="caddy-tls-address"
          value={tlsAddress}
          onChange={(event) => setTlsAddress(event.target.value)}
          placeholder="caddy:443"
          fullWidth
          error={field === 'caddy.tlsAddress'}
          helperText={field === 'caddy.tlsAddress' ? error : undefined}
          slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: fonts.mono } } }}
        />
      </SettingRow>
      <SwitchRow
        id="caddy-monitor"
        label={t('Zertifikate täglich prüfen')}
        description={t('Bei Problemen bekommen Admins eine E-Mail und der Webhook für Systemmeldungen feuert.')}
        checked={monitor}
        onChange={setMonitor}
      />
      <SettingRow
        label={t('Warnen ab')}
        description={t('So viele Tage vor dem Ablauf gilt ein Zertifikat als gefährdet.')}
        htmlFor="caddy-warn-days"
      >
        <TextField
          id="caddy-warn-days"
          type="number"
          value={warnDays}
          onChange={(event) => setWarnDays(event.target.value)}
          sx={{ width: 120 }}
          error={field === 'caddy.warnDays'}
          helperText={field === 'caddy.warnDays' ? error : undefined}
          slotProps={{
            htmlInput: { min: 1, max: 60 },
            input: { endAdornment: <Typography sx={{ color: 'text.secondary', ml: 1 }}>{t('Tage')}</Typography> },
          }}
        />
      </SettingRow>
      {error && !field && (
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: 1 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={save} disabled={!dirty || busy}>
          {t('Speichern')}
        </Button>
      </Box>
    </SettingsSection>
  );
}

export function CaddyPanel({ settings, onSettings }: { settings: SettingsPayload; onSettings: (next: SettingsPayload) => void }) {
  const toast = useToast();
  const [state, setState] = useState<CaddyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await fetchCaddy());
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!state?.checking) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        setState(await fetchCaddy());
      } catch {}
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  const checkAll = async () => {
    try {
      await checkCertificates();
      setState((current) => (current ? { ...current, checking: true } : current));
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const checkOne = async (domain: string) => {
    setChecking((list) => [...list, domain]);
    try {
      const { certificate } = await checkCertificate(domain);
      setState((current) =>
        current ? { ...current, certificates: current.certificates.map((item) => (item.domain === domain ? certificate : item)) } : current
      );
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setChecking((list) => list.filter((item) => item !== domain));
    }
  };

  const certificates = useMemo(
    () =>
      [...(state?.certificates || [])].sort(
        (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.domain.localeCompare(b.domain)
      ),
    [state]
  );
  const counts = useMemo(() => {
    const result: Partial<Record<CertificateStatus, number>> = {};
    for (const item of certificates) result[item.status] = (result[item.status] || 0) + 1;
    return result;
  }, [certificates]);

  if (loading && !state) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={140} sx={{ borderRadius: `${radius.lg}px` }} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: `${radius.lg}px` }} />
      </Stack>
    );
  }

  const overview = state?.overview;
  const summary = overview?.summary;
  const requests = state?.requests || [];
  const visibleRequests = showAll ? requests : requests.slice(0, 12);

  return (
    <Stack spacing={4}>
      <Box
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: `${radius.lg}px`,
          bgcolor: overview?.connected ? c.surfaceContainerLow : c.surfaceContainerHigh,
          display: 'grid',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box
            aria-hidden
            sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: overview?.connected ? c.success : c.error, flexShrink: 0 }}
          />
          <Typography variant="h6" component="h2" sx={{ flex: 1, minWidth: 200 }}>
            {overview?.connected ? t('Verbunden mit Caddy') : t('Keine Verbindung zu Caddy')}
          </Typography>
          <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshRounded />} onClick={load} disabled={loading}>
            {t('Neu laden')}
          </Button>
        </Box>
        {overview?.connected ? (
          <Box>
            <Row
              label={t('Admin-API')}
              value={
                <>
                  <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
                    {overview.url}
                  </Box>
                  {overview.detected ? ` (${t('automatisch gefunden')})` : ''}
                </>
              }
            />
            {overview.reload?.at && (
              <Row
                label={t('Konfiguration geladen')}
                value={overview.reload.successful === false ? t('Letzter Versuch fehlgeschlagen') : relativeMs(overview.reload.at)}
              />
            )}
            {summary?.email && <Row label={t('E-Mail für Zertifikate')} value={summary.email} mono />}
            <Row
              label={t('Eigene Domains')}
              value={summary?.onDemand ? t('Zertifikate auf Abruf, Caddy fragt vorher hier nach') : t('Keine Zertifikate auf Abruf')}
            />
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: '68ch' }}>
            {overview?.error ? `${overview.error} ` : ''}
            {t(
              '{name} liest Zertifikate und Weiterleitungen über die Admin-API von Caddy. Im Docker-Paket ist sie ab Version 3.4.0 unter http://caddy:2019 erreichbar und wird automatisch gefunden. Bei einer eigenen Installation trägst du die Adresse unten ein, meist http://127.0.0.1:2019.',
              { name: siteName() }
            )}
          </Typography>
        )}
        {(overview?.notes || []).map((note) => (
          <Alert key={note.text} severity={note.level}>
            {note.text}
          </Alert>
        ))}
      </Box>

      <SettingsSection
        title={t('Zertifikate')}
        description={
          certificates.length
            ? ORDER.filter((status) => counts[status])
                .map((status) => `${formatNumber(counts[status] || 0)} ${STATUS[status].label.toLowerCase()}`)
                .join(', ')
            : undefined
        }
        action={
          <Button
            variant="outlined"
            startIcon={state?.checking ? <CircularProgress size={16} /> : <LockClockRounded />}
            onClick={checkAll}
            disabled={!!state?.checking || !certificates.length}
          >
            {state?.checking ? t('Prüfe …') : t('Alle prüfen')}
          </Button>
        }
      >
        {certificates.length ? (
          certificates.map((item) => (
            <CertificateRow
              key={item.domain}
              item={item}
              busy={checking.includes(item.domain) || !!state?.checking}
              onCheck={() => checkOne(item.domain)}
            />
          ))
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: { xs: 2, sm: 3 }, py: 2.5 }}>
            {t('Trage unter Einstellungen › Domains die Adresse dieses Servers ein. Danach prüft {name} hier ihr Zertifikat.', {
              name: siteName(),
            })}
          </Typography>
        )}
      </SettingsSection>

      {overview?.connected && summary && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
          <Card icon={<RouteRounded />} title={t('Seiten in Caddy')}>
            {summary.sites.length ? (
              summary.sites.map((site, index) => (
                <Box key={`${site.server}-${index}`} sx={{ py: 1.25, borderTop: index ? `1px solid ${c.outlineVariant}` : 'none' }}>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {site.hosts.length ? (
                      site.hosts.map((host) => <Chip key={host} size="small" label={host} sx={{ fontFamily: fonts.mono }} />)
                    ) : (
                      <Chip size="small" label={t('alle Domains')} />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
                    {site.upstreams.length
                      ? t('leitet weiter an {list}', { list: site.upstreams.join(', ') })
                      : t('ohne Weiterleitung an einen Server')}
                  </Typography>
                </Box>
              ))
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('Caddy hat gerade keine Seiten eingerichtet.')}
              </Typography>
            )}
          </Card>
          <Card icon={<HubRounded />} title={t('Weiterleitungsziele')}>
            {overview.upstreams && overview.upstreams.length ? (
              overview.upstreams.map((upstream) => (
                <Row
                  key={upstream.address}
                  label={upstream.address}
                  value={
                    upstream.fails
                      ? tn(upstream.fails, '1 Fehlschlag', '{count} Fehlschläge')
                      : tn(upstream.requests, '1 laufende Anfrage', '{count} laufende Anfragen')
                  }
                />
              ))
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('Caddy meldet keine Ziele.')}
              </Typography>
            )}
          </Card>
        </Box>
      )}

      <SettingsSection
        title={t('Anfragen für Zertifikate')}
        description={t(
          'Bevor Caddy für eine eigene Domain ein Zertifikat holt, fragt es hier nach. Abgelehnt wird jede Domain, die nicht zu diesem Server gehört.'
        )}
      >
        {requests.length ? (
          <>
            {visibleRequests.map((item) => (
              <RequestRow key={item.id} item={item} />
            ))}
            {requests.length > visibleRequests.length && (
              <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
                <Button onClick={() => setShowAll(true)}>{t('Alle {count} anzeigen', { count: formatNumber(requests.length) })}</Button>
              </Box>
            )}
          </>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: { xs: 2, sm: 3 }, py: 2.5 }}>
            {t('Noch keine Anfragen. Sie erscheinen, sobald Caddy für eine neue Domain ein Zertifikat holen will.')}
          </Typography>
        )}
      </SettingsSection>

      <CaddyfileTool onLoaded={load} />
      <CaddySettings settings={settings} onSettings={onSettings} />
    </Stack>
  );
}
