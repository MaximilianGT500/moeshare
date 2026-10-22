import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import CloudSyncRounded from '@mui/icons-material/CloudSyncRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import CloudDownloadRounded from '@mui/icons-material/CloudDownloadRounded';
import NetworkCheckRounded from '@mui/icons-material/NetworkCheckRounded';
import type { SettingValue, StorageInfo } from '../../lib/types';
import { errorMessage, fetchStorageInfo, migrateStorage, testStorage } from '../../lib/api';
import { formatBytes, formatNumber } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { useConfirm } from '../../components/ConfirmDialog';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';

type Values = Record<string, SettingValue>;

const FIELDS: Array<[string, string]> = [
  ['endpoint', 'storage.s3.endpoint'],
  ['region', 'storage.s3.region'],
  ['bucket', 'storage.s3.bucket'],
  ['accessKeyId', 'storage.s3.accessKeyId'],
  ['prefix', 'storage.s3.prefix'],
  ['pathStyle', 'storage.s3.pathStyle'],
];

function Place({ label, files, bytes, active }: { label: string; files: number; bytes: number; active: boolean }) {
  return (
    <Box
      sx={{
        flex: '1 1 200px',
        p: 2,
        borderRadius: `${radius.md}px`,
        bgcolor: active ? c.secondaryContainer : c.surfaceContainerHighest,
        color: active ? c.onSecondaryContainer : c.onSurface,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>{formatNumber(files)}</Typography>
      <Typography variant="caption">{tn(files, 'Datei, {size}', 'Dateien, {size}', { size: formatBytes(bytes) })}</Typography>
    </Box>
  );
}

export function StorageTools({
  initial,
  draft,
  secret,
  unsaved,
}: {
  initial: StorageInfo;
  draft: Values;
  secret?: string;
  unsaved: boolean;
}) {
  const toast = useToast();
  const sudo = useSudo();
  const confirm = useConfirm();
  const [info, setInfo] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const migration = info.migration;
  const running = !!migration && !migration.finishedAt;

  useEffect(() => {
    if (unsaved) return;
    fetchStorageInfo()
      .then(setInfo)
      .catch(() => {});
  }, [unsaved]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      fetchStorageInfo()
        .then(setInfo)
        .catch(() => {});
    }, 1500);
    return () => window.clearInterval(timer);
  }, [running]);

  const test = async () => {
    setTesting(true);
    try {
      const body: Record<string, string | boolean> = {};
      for (const [field, key] of FIELDS) {
        const value = draft[key];
        if (typeof value === 'boolean') body[field] = value;
        else if (typeof value === 'string' && value.trim()) body[field] = value.trim();
      }
      if (secret) body.secretAccessKey = secret;
      const result = await testStorage(body);
      toast(t('Verbindung steht: Datei geschrieben, gelesen und gelöscht in {ms} ms.', { ms: formatNumber(result.ms) }), {
        variant: 'success',
      });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const move = async (to: 'local' | 's3') => {
    const count = to === 's3' ? info.counts.local.files : info.counts.s3.files;
    const ok = await confirm({
      title: to === 's3' ? t('Alle Dateien nach S3 verschieben?') : t('Alle Dateien zurück auf den Server holen?'),
      message:
        to === 's3'
          ? t(
              '{count} Dateien werden hochgeladen und danach auf dem Server gelöscht. Links bleiben gleich. Das kann je nach Menge lange dauern.',
              {
                count: formatNumber(count),
              }
            )
          : t(
              '{count} Dateien werden aus S3 heruntergeladen. Prüfe vorher, ob auf dem Server genug Platz ist. In S3 bleiben sie liegen, bis du sie dort löschst.',
              {
                count: formatNumber(count),
              }
            ),
      confirmLabel: t('Verschieben'),
      icon: <CloudSyncRounded />,
    });
    if (!ok) return;
    setStarting(true);
    try {
      await sudo(() => migrateStorage(to));
      setInfo(await fetchStorageInfo());
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const progress = migration && migration.total ? Math.round((migration.done / migration.total) * 100) : null;

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Place
          label={t('Auf dem Server')}
          files={info.counts.local.files}
          bytes={info.counts.local.bytes}
          active={info.driver === 'local'}
        />
        <Place label={t('In S3')} files={info.counts.s3.files} bytes={info.counts.s3.bytes} active={info.driver === 's3'} />
      </Box>

      {migration && (
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {running
              ? migration.to === 's3'
                ? t('Dateien werden nach S3 verschoben …')
                : t('Dateien werden auf den Server geholt …')
              : migration.error
                ? t('Das Verschieben wurde abgebrochen: {error}', { error: migration.error })
                : t('Fertig verschoben.')}{' '}
            {migration.total !== null &&
              t('{done} von {total}, davon {failed} fehlgeschlagen und {missing} nicht gefunden.', {
                done: formatNumber(migration.done),
                total: formatNumber(migration.total),
                failed: formatNumber(migration.failed),
                missing: formatNumber(migration.missing),
              })}
          </Typography>
          {running && <LinearProgress variant={progress === null ? 'indeterminate' : 'determinate'} value={progress ?? 0} />}
        </Box>
      )}

      {unsaved && <Alert severity="info">{t('Speichere die Änderungen, bevor du Dateien verschiebst.')}</Alert>}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="tonal"
          startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <NetworkCheckRounded />}
          disabled={testing}
          onClick={test}
        >
          {t('Verbindung testen')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<CloudUploadRounded />}
          disabled={!info.configured || unsaved || running || starting || info.counts.local.files === 0}
          onClick={() => move('s3')}
        >
          {t('Alles nach S3 verschieben')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<CloudDownloadRounded />}
          disabled={!info.configured || unsaved || running || starting || info.counts.s3.files === 0}
          onClick={() => move('local')}
        >
          {t('Alles auf den Server holen')}
        </Button>
      </Box>
    </Box>
  );
}
