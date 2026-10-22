import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BackupRounded from '@mui/icons-material/BackupRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import type { BackupInfo, BackupItem } from '../../lib/types';
import { backupDownloadUrl, deleteBackup, errorMessage, fetchBackups, probeBackupDownload, startBackup } from '../../lib/api';
import { formatBytes, formatDateTime, relativeMs } from '../../lib/format';
import { rich, t } from '../../lib/i18n';
import { useConfirm } from '../../components/ConfirmDialog';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { c, ease, fonts } from '../../theme/tokens';

const PHASES: Record<string, string> = {
  database: t('Datenbank wird gesichert …'),
  uploads: t('Dateien werden gepackt …'),
  archive: t('Archiv wird geschrieben …'),
  upload: t('Sicherung wird nach S3 hochgeladen …'),
};

export function BackupTools({ initial, includeUploads }: { initial: BackupInfo; includeUploads: boolean }) {
  const toast = useToast();
  const sudo = useSudo();
  const confirm = useConfirm();
  const [info, setInfo] = useState(initial);
  const [withFiles, setWithFiles] = useState(includeUploads);
  const [starting, setStarting] = useState(false);
  const running = info.running;

  useEffect(() => setWithFiles(includeUploads), [includeUploads]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      fetchBackups()
        .then((next) => {
          setInfo(next);
          if (!next.running && next.last) {
            if (next.last.ok) toast(t('Sicherung erstellt'), { variant: 'success' });
            else toast(t('Die Sicherung ist fehlgeschlagen: {error}', { error: next.last.error || '' }), { variant: 'error' });
          }
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [running, toast]);

  const start = async () => {
    setStarting(true);
    try {
      const result = await sudo(() => startBackup(withFiles));
      setInfo((current) => ({ ...current, running: result.running, last: result.last }));
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const download = async (item: BackupItem) => {
    try {
      await sudo(() => probeBackupDownload(item.name, item.location));
      window.location.assign(backupDownloadUrl(item.name, item.location));
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const remove = async (item: BackupItem) => {
    const ok = await confirm({
      title: t('Sicherung löschen?'),
      message: t('{name} wird endgültig gelöscht.', { name: item.name }),
      confirmLabel: t('Löschen'),
      destructive: true,
      icon: <DeleteOutlineRounded />,
    });
    if (!ok) return;
    try {
      setInfo(await sudo(() => deleteBackup(item.name, item.location)));
      toast(t('Sicherung gelöscht'), { variant: 'success' });
    } catch (failure) {
      if (!isCancelled(failure)) toast(errorMessage(failure), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Button
          variant="contained"
          startIcon={starting || running ? <CircularProgress size={16} color="inherit" /> : <BackupRounded />}
          disabled={starting || !!running}
          onClick={start}
        >
          {t('Jetzt sichern')}
        </Button>
        <FormControlLabel
          control={<Checkbox checked={withFiles} onChange={(event) => setWithFiles(event.target.checked)} disabled={!!running} />}
          label={t('Mit hochgeladenen Dateien')}
        />
      </Box>

      {running && (
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {PHASES[running.phase] || t('Sicherung läuft …')}
          </Typography>
          <LinearProgress />
        </Box>
      )}
      {!running && info.last && !info.last.ok && (
        <Alert severity="error">{t('Die letzte Sicherung ist fehlgeschlagen: {error}', { error: info.last.error || '' })}</Alert>
      )}
      {info.listError && (
        <Alert severity="warning">{t('Die Sicherungen in S3 ließen sich nicht abrufen: {error}', { error: info.listError })}</Alert>
      )}

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid' }}>
        <AnimatePresence initial={false}>
          {info.items.map((item) => (
            <m.li
              key={`${item.location}-${item.name}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.26, ease: ease.emphasizedDecelerate }}
              style={{ overflow: 'hidden' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${c.outlineVariant}` }}>
                <Box sx={{ color: c.onSurfaceVariant, display: 'flex' }}>{item.auto ? <ScheduleRounded /> : <SaveRounded />}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} title={item.name}>
                    {formatDateTime(new Date(item.at))}
                  </Typography>
                  <Typography variant="caption" component="p" noWrap sx={{ color: 'text.secondary', fontFamily: fonts.mono }}>
                    {item.name}
                  </Typography>
                </Box>
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75 }}>
                  <Chip size="small" variant="outlined" label={item.auto ? t('Automatisch') : t('Manuell')} />
                  {item.location === 's3' && <Chip size="small" variant="outlined" label="S3" />}
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 72, textAlign: 'right' }}>
                  {formatBytes(item.size)}
                </Typography>
                <Tooltip title={t('Herunterladen')}>
                  <IconButton aria-label={t('{name} herunterladen', { name: item.name })} onClick={() => download(item)}>
                    <DownloadRounded />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('Löschen')}>
                  <IconButton
                    aria-label={t('{name} löschen', { name: item.name })}
                    onClick={() => remove(item)}
                    sx={{ '&:hover': { color: c.error } }}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </Tooltip>
              </Box>
            </m.li>
          ))}
        </AnimatePresence>
      </Box>
      {!info.items.length && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('Noch keine Sicherungen.')}
          {info.last?.ok && info.last.at ? ` ${t('Die letzte lief {when}.', { when: relativeMs(info.last.at) })}` : ''}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {rich('Zurückspielen geht auf dem Server mit {command}, der Server muss dafür gestoppt sein.', {
          command: (
            <Box component="span" sx={{ fontFamily: fonts.mono }}>
              {`node cli.js restore <${t('Datei')}>`}
            </Box>
          ),
        })}
      </Typography>
    </Box>
  );
}
