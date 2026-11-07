import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import KeyRounded from '@mui/icons-material/KeyRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { SettingValue } from '../../lib/types';
import { createMetricsToken, errorMessage } from '../../lib/api';
import { siteSlug } from '../../lib/boot';
import { SettingRow } from '../../components/SettingsKit';
import { CopyIconButton } from '../../components/CopyButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { c, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

function scrapeConfig(url: string, token: string) {
  let host = url;
  let scheme = 'https';
  try {
    const parsed = new URL(url);
    host = parsed.host;
    scheme = parsed.protocol.replace(':', '');
  } catch {}
  return [
    'scrape_configs:',
    `  - job_name: ${siteSlug()}`,
    `    scheme: ${scheme}`,
    '    metrics_path: /metrics',
    '    authorization:',
    `      credentials: ${token}`,
    '    static_configs:',
    `      - targets: ['${host}']`,
  ].join('\n');
}

function Snippet({ value, label }: { value: string; label: string }) {
  return (
    <Box sx={{ position: 'relative', borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHighest }}>
      <Box component="pre" sx={{ m: 0, p: 2, pr: 6, fontFamily: fonts.mono, fontSize: '0.8125rem', overflowX: 'auto', whiteSpace: 'pre' }}>
        {value}
      </Box>
      <Box sx={{ position: 'absolute', top: 6, right: 6 }}>
        <CopyIconButton value={value} size="small" label={label} message={t('Kopiert')} icon={<ContentCopyRounded fontSize="inherit" />} />
      </Box>
    </Box>
  );
}

export function MetricsTools({ hasToken, onValues }: { hasToken: boolean; onValues: (values: Record<string, SettingValue>) => void }) {
  const sudo = useSudo();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ token: string; url: string } | null>(null);

  const create = async () => {
    if (hasToken) {
      const ok = await confirm({
        title: t('Neues Token erstellen?'),
        message: t('Das alte Token gilt dann nicht mehr. Trage das neue in Prometheus ein.'),
        confirmLabel: t('Neues Token'),
        destructive: false,
        icon: <KeyRounded />,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await sudo(() => createMetricsToken());
      setCreated({ token: result.token, url: result.url });
      onValues(result.values);
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingRow
        label={t('Token für den Abruf')}
        description={
          hasToken
            ? t('Ein Token ist eingerichtet. Prometheus schickt es im Header Authorization mit.')
            : t('Ohne Token antwortet /metrics nicht. Das Token siehst du nur direkt nach dem Erstellen.')
        }
      >
        <Button
          variant="outlined"
          onClick={create}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <KeyRounded />}
        >
          {hasToken ? t('Neues Token') : t('Token erstellen')}
        </Button>
      </SettingRow>
      {created && (
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25, display: 'grid', gap: 1.5 }}>
          <Alert severity="success">{t('Kopiere das Token jetzt. Es wird nicht wieder angezeigt.')}</Alert>
          <Snippet value={created.token} label={t('Token kopieren')} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('So sieht der Eintrag in der prometheus.yml aus:')}
          </Typography>
          <Snippet value={scrapeConfig(created.url, created.token)} label={t('Eintrag kopieren')} />
        </Box>
      )}
    </>
  );
}
