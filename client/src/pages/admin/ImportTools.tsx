import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import type { ImportPreview, ImportReport, Job } from '../../lib/types';
import { ApiError, errorMessage, previewImport, startImport, waitForJob, type ImportInput } from '../../lib/api';
import { formatBytes, formatNumber } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { SettingRow } from '../../components/SettingsKit';
import { CopyTextButton } from '../../components/CopyButton';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { c, fonts, radius } from '../../theme/tokens';

const HINTS: Record<string, { database: () => string; files: () => string; placeholder: string; filesPlaceholder: string }> = {
  zipline: {
    database: () => t('Zipline speichert in PostgreSQL. Trage die Adresse aus DATABASE_URL ein.'),
    files: () => t('Der Ordner aus DATASOURCE_LOCAL_DIRECTORY, meist uploads.'),
    placeholder: 'postgres://zipline:passwort@localhost:5432/zipline',
    filesPlaceholder: '/srv/zipline/uploads',
  },
  xbackbone: {
    database: () => t('Bei SQLite der Pfad zur Datenbankdatei, sonst die Adresse wie mysql://benutzer:passwort@host/xbackbone.'),
    files: () => t('Der Ordner storage aus der XBackBone-Installation.'),
    placeholder: '/srv/xbackbone/resources/database/xbackbone.db',
    filesPlaceholder: '/srv/xbackbone/storage',
  },
  chibisafe: {
    database: () => t('Der Pfad zur Datei database.sqlite von Chibisafe.'),
    files: () => t('Der Ordner uploads von Chibisafe.'),
    placeholder: '/srv/chibisafe/database/database.sqlite',
    filesPlaceholder: '/srv/chibisafe/uploads',
  },
};

function Count({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHigh, minWidth: 110 }}>
      <Typography variant="h6" component="p" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  );
}

function PreviewCard({ preview }: { preview: ImportPreview }) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Count label={t('Konten')} value={formatNumber(preview.counts.users)} />
        <Count label={t('Dateien')} value={formatNumber(preview.counts.files)} />
        <Count label={t('Größe')} value={formatBytes(preview.bytes)} />
        <Count label={t('Alben')} value={formatNumber(preview.counts.albums)} />
        <Count label={t('Texte')} value={formatNumber(preview.counts.texts)} />
        <Count label={t('Kurzlinks')} value={formatNumber(preview.counts.links)} />
      </Box>
      {preview.missing > 0 && (
        <Alert severity="warning">
          {tn(
            preview.missing,
            '1 Datei steht in der Datenbank, liegt aber nicht im Ordner. Sie wird übersprungen.',
            '{count} Dateien stehen in der Datenbank, liegen aber nicht im Ordner. Sie werden übersprungen.'
          )}
        </Alert>
      )}
      {preview.alreadyImported > 0 && (
        <Alert severity="info">
          {tn(
            preview.alreadyImported,
            '1 Eintrag wurde schon übernommen und wird nicht doppelt angelegt.',
            '{count} Einträge wurden schon übernommen und werden nicht doppelt angelegt.'
          )}
        </Alert>
      )}
      {preview.orphans > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {tn(preview.orphans, '1 Datei hat keinen Besitzer.', '{count} Dateien haben keinen Besitzer.')}
        </Typography>
      )}
      {preview.accounts.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('Konten')}
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5, maxHeight: 280, overflowY: 'auto' }}>
            {preview.accounts.map((account) => (
              <Box
                component="li"
                key={account.username}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  py: 0.5,
                  borderBottom: `1px solid ${c.outlineVariant}`,
                }}
              >
                <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
                  {account.username}
                </Typography>
                {account.target !== account.username && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: fonts.mono, fontSize: '0.8125rem' }}>
                    → {account.target}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto', flexWrap: 'wrap' }}>
                  {account.merge && <Chip size="small" label={t('wird zusammengeführt')} />}
                  {account.renamed && <Chip size="small" label={t('umbenannt')} />}
                  {account.admin && <Chip size="small" label={t('Admin')} />}
                  {account.password === 'new' && <Chip size="small" color="warning" label={t('neues Passwort')} />}
                  {!account.active && <Chip size="small" label={t('gesperrt')} />}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ReportCard({ report }: { report: ImportReport }) {
  const passwords = report.passwords.map((entry) => `${entry.username}: ${entry.password}`).join('\n');
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Alert severity="success" icon={<CheckCircleRounded />}>
        {t('Import aus {source} abgeschlossen: {files} Dateien, {users} neue Konten, {redirects} alte Adressen leiten jetzt weiter.', {
          source: report.label || '',
          files: formatNumber(report.files.imported + report.texts.imported),
          users: formatNumber(report.users.created),
          redirects: formatNumber(report.redirects),
        })}
      </Alert>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Count label={t('Dateien')} value={formatNumber(report.files.imported)} />
        <Count label={t('Größe')} value={formatBytes(report.files.bytes + report.texts.bytes)} />
        <Count label={t('Texte')} value={formatNumber(report.texts.imported)} />
        <Count label={t('Alben')} value={formatNumber(report.albums.imported)} />
        <Count label={t('Kurzlinks')} value={formatNumber(report.links.imported)} />
        <Count label={t('Übersprungen')} value={formatNumber(report.files.skipped + report.texts.skipped)} />
        <Count label={t('Fehlend')} value={formatNumber(report.files.missing + report.texts.missing)} />
      </Box>
      {report.passwords.length > 0 && (
        <Box>
          <Typography variant="subtitle2">{t('Vorläufige Passwörter')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
            {t(
              'Diese Konten hatten ein Passwort, das MoeShare nicht lesen kann. Gib ihnen die Passwörter weiter, sie müssen sie beim ersten Anmelden ändern. Die Liste wird nur jetzt angezeigt.'
            )}
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              borderRadius: `${radius.sm}px`,
              bgcolor: c.surfaceContainerHighest,
              fontFamily: fonts.mono,
              fontSize: '0.8125rem',
              maxHeight: 220,
              overflow: 'auto',
            }}
          >
            {passwords}
          </Box>
          <CopyTextButton value={passwords} message={t('Passwörter kopiert')} sx={{ mt: 1 }}>
            {t('Alle kopieren')}
          </CopyTextButton>
        </Box>
      )}
      {report.renamed.length > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('Umbenannt: {list}', { list: report.renamed.map((entry) => `${entry.from} → ${entry.to}`).join(', ') })}
        </Typography>
      )}
      {report.warnings.length > 0 && (
        <Alert severity="warning">
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {report.warnings.slice(0, 20).map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </Box>
        </Alert>
      )}
    </Box>
  );
}

export function ImportTools({
  sources,
  argon2,
  redirects,
}: {
  sources: Array<{ id: string; label: string }>;
  argon2: boolean;
  redirects: number;
}) {
  const sudo = useSudo();
  const toast = useToast();
  const [kind, setKind] = useState(sources[0]?.id || 'zipline');
  const [database, setDatabase] = useState('');
  const [files, setFiles] = useState('');
  const [admins, setAdmins] = useState(true);
  const [merge, setMerge] = useState(true);
  const [orphans, setOrphans] = useState<'admin' | 'skip'>('admin');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [job, setJob] = useState<Job<ImportReport> | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [redirectCount, setRedirectCount] = useState(redirects);
  const hint = HINTS[kind] || HINTS.zipline;

  const input = (): ImportInput => ({ kind, database: database.trim(), files: files.trim(), admins, merge, orphans });

  const fail = (failure: unknown) => {
    if (isCancelled(failure)) return;
    setError({ field: failure instanceof ApiError ? failure.field : '', message: errorMessage(failure) });
  };

  const check = async () => {
    setBusy('preview');
    setError(null);
    setReport(null);
    try {
      const result = await sudo(() => previewImport(input()));
      setPreview(result.preview);
    } catch (failure) {
      setPreview(null);
      fail(failure);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy('run');
    setError(null);
    try {
      const { job: started } = await sudo(() => startImport(input()));
      setJob(started);
      const finished = await waitForJob<ImportReport>(started.id, setJob, { admin: true, interval: 1000 });
      if (finished.state === 'error' || !finished.result) {
        setError({ field: '', message: finished.error?.message || t('Der Import ist fehlgeschlagen.') });
      } else {
        setReport(finished.result);
        setRedirectCount((count) => count + (finished.result?.redirects || 0));
        setPreview(null);
        toast(t('Import abgeschlossen'), { variant: 'success' });
      }
    } catch (failure) {
      fail(failure);
    } finally {
      setJob(null);
      setBusy(null);
    }
  };

  const partial = job?.detail as Partial<ImportReport> | null | undefined;
  const changed = () => {
    setPreview(null);
    setError(null);
  };

  return (
    <Box>
      <SettingRow label={t('Alter Uploader')} stacked>
        <ToggleButtonGroup
          exclusive
          value={kind}
          onChange={(_event, next: string | null) => {
            if (!next) return;
            setKind(next);
            changed();
          }}
          aria-label={t('Alter Uploader')}
          sx={{ flexWrap: 'wrap' }}
        >
          {sources.map((source) => (
            <ToggleButton key={source.id} value={source.id} disabled={!!busy}>
              {source.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </SettingRow>
      <SettingRow label={t('Datenbank')} description={hint.database()} htmlFor="import-database" stacked>
        <TextField
          id="import-database"
          size="small"
          fullWidth
          value={database}
          disabled={!!busy}
          placeholder={hint.placeholder}
          onChange={(event) => {
            setDatabase(event.target.value);
            changed();
          }}
          error={error?.field === 'database'}
          helperText={error?.field === 'database' ? error.message : t('Wird nur gelesen, nie verändert.')}
          slotProps={{ htmlInput: { spellCheck: false, autoComplete: 'off', style: { fontFamily: fonts.mono } } }}
        />
      </SettingRow>
      <SettingRow label={t('Ordner mit den Dateien')} description={hint.files()} htmlFor="import-files" stacked>
        <TextField
          id="import-files"
          size="small"
          fullWidth
          value={files}
          disabled={!!busy}
          placeholder={hint.filesPlaceholder}
          onChange={(event) => {
            setFiles(event.target.value);
            changed();
          }}
          error={error?.field === 'files'}
          helperText={
            error?.field === 'files'
              ? error.message
              : t('Ein Pfad auf diesem Server. Die Dateien werden kopiert, die Originale bleiben liegen.')
          }
          slotProps={{ htmlInput: { spellCheck: false, autoComplete: 'off', style: { fontFamily: fonts.mono } } }}
        />
      </SettingRow>
      <SettingRow label={t('Optionen')} stacked>
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                checked={admins}
                disabled={!!busy}
                onChange={(event) => {
                  setAdmins(event.target.checked);
                  changed();
                }}
              />
            }
            label={t('Admins bleiben Admins')}
          />
          <FormControlLabel
            control={
              <Switch
                checked={merge}
                disabled={!!busy}
                onChange={(event) => {
                  setMerge(event.target.checked);
                  changed();
                }}
              />
            }
            label={t('Gleichnamige Konten zusammenführen statt umzubenennen')}
          />
          <FormControlLabel
            control={
              <Switch
                checked={orphans === 'admin'}
                disabled={!!busy}
                onChange={(event) => {
                  setOrphans(event.target.checked ? 'admin' : 'skip');
                  changed();
                }}
              />
            }
            label={t('Dateien ohne Besitzer dir zuordnen')}
          />
          {!argon2 && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('Diese Node.js-Version kann keine Argon2-Passwörter prüfen. Betroffene Konten bekommen ein vorläufiges Passwort.')}
            </Typography>
          )}
        </Box>
      </SettingRow>
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25, display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant={preview ? 'text' : 'tonal'}
            onClick={check}
            disabled={!!busy || !database.trim() || !files.trim()}
            startIcon={busy === 'preview' ? <CircularProgress size={16} color="inherit" /> : <TravelExploreRounded />}
          >
            {t('Prüfen')}
          </Button>
          <Button
            variant="contained"
            onClick={run}
            disabled={!!busy || !preview}
            startIcon={busy === 'run' ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRounded />}
          >
            {t('Import starten')}
          </Button>
        </Box>
        {error && !['database', 'files'].includes(error.field) && <Alert severity="error">{error.message}</Alert>}
        {job && (
          <Box aria-live="polite">
            <LinearProgress variant={job.progress > 0 ? 'determinate' : 'indeterminate'} value={job.progress * 100} />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
              {t('{percent} % erledigt, {files} Dateien übernommen', {
                percent: Math.round(job.progress * 100),
                files: formatNumber((partial?.files?.imported || 0) + (partial?.texts?.imported || 0)),
              })}
            </Typography>
          </Box>
        )}
        {preview && !job && <PreviewCard preview={preview} />}
        {report && <ReportCard report={report} />}
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t(
            'Der Import lässt sich gefahrlos wiederholen, schon übernommene Einträge werden übersprungen. Alte Links leiten weiter, gerade sind es {count}. Auf der Kommandozeile geht es mit node cli.js import.',
            {
              count: formatNumber(redirectCount),
            }
          )}
        </Typography>
      </Box>
    </Box>
  );
}
