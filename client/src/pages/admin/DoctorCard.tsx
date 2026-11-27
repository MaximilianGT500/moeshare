import { useState, type ReactElement } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import type { DoctorReport, DoctorStatus } from '../../lib/types';
import { errorMessage, fetchDoctor } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { formatDateTime, relativeMs } from '../../lib/format';
import { useToast } from '../../components/Toaster';
import { Card } from './SystemPanel';
import { c, ease, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

const ORDER: DoctorStatus[] = ['error', 'warn', 'info', 'ok'];

const STATUS: Record<
  DoctorStatus,
  { icon: ReactElement; color: string; label: () => string; count: (count: number) => string; mark: string }
> = {
  error: {
    icon: <ErrorRounded />,
    color: c.error,
    label: () => t('Fehler'),
    count: (count) => tn(count, '1 Fehler', '{count} Fehler'),
    mark: '✗',
  },
  warn: {
    icon: <WarningRounded />,
    color: c.warning,
    label: () => t('Warnung'),
    count: (count) => tn(count, '1 Warnung', '{count} Warnungen'),
    mark: '!',
  },
  info: {
    icon: <InfoRounded />,
    color: c.primary,
    label: () => t('Hinweis'),
    count: (count) => tn(count, '1 Hinweis', '{count} Hinweise'),
    mark: '·',
  },
  ok: {
    icon: <CheckCircleRounded />,
    color: c.success,
    label: () => t('In Ordnung'),
    count: (count) => tn(count, '1 in Ordnung', '{count} in Ordnung'),
    mark: '✓',
  },
};

function reportText(report: DoctorReport, site: string) {
  const lines = [t('Systemprüfung für {site}, {date}', { site, date: formatDateTime(new Date(report.at)) }), ''];
  for (const status of ORDER) {
    for (const check of report.checks.filter((entry) => entry.status === status)) {
      lines.push(`${STATUS[status].mark} ${check.title}: ${check.detail}`);
      if (check.hint) lines.push(`  ${check.hint}`);
    }
  }
  return lines.join('\n');
}

export function DoctorCard({ initial, site }: { initial: DoctorReport | null; site: string }) {
  const toast = useToast();
  const [report, setReport] = useState<DoctorReport | null>(initial);
  const [busy, setBusy] = useState(false);
  const [showOk, setShowOk] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setReport(await fetchDoctor());
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (report && (await copyText(reportText(report, site)))) toast(t('Bericht kopiert'), { variant: 'success', duration: 2400 });
  };

  const problems = report ? report.checks.filter((check) => check.status !== 'ok') : [];
  const passed = report ? report.checks.filter((check) => check.status === 'ok') : [];
  const visible = report
    ? [...ORDER.flatMap((status) => problems.filter((check) => check.status === status)), ...(showOk ? passed : [])]
    : [];

  return (
    <Card icon={<FactCheckRounded />} title={t('Systemprüfung')} full>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: report ? 2 : 0 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: '1 1 240px' }}>
          {report
            ? report.summary.error || report.summary.warn
              ? t('{problems} von {total} Prüfungen brauchen Aufmerksamkeit. Zuletzt geprüft {when}.', {
                  problems: report.summary.error + report.summary.warn,
                  total: report.checks.length,
                  when: relativeMs(report.at),
                })
              : t('Alles in Ordnung. Zuletzt geprüft {when}.', { when: relativeMs(report.at) })
            : t(
                'Prüft Adresse, HTTPS, Speicherplatz, Rechte, Datenbank, E-Mail, Sicherungen, Virenscan und mehr. Dauert ein paar Sekunden.'
              )}
        </Typography>
        {report && (
          <Button size="small" startIcon={<ContentCopyRounded />} onClick={copy}>
            {t('Bericht kopieren')}
          </Button>
        )}
        <Button
          variant={report ? 'tonal' : 'contained'}
          onClick={run}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <FactCheckRounded />}
        >
          {report ? t('Erneut prüfen') : t('Jetzt prüfen')}
        </Button>
      </Box>
      {report && (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }} role="list" aria-label={t('Zusammenfassung')}>
            {ORDER.filter((status) => report.summary[status] > 0).map((status) => (
              <Box
                key={status}
                role="listitem"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: `${radius.full}px`,
                  bgcolor: c.surfaceContainerHigh,
                  '& svg': { fontSize: 16, color: STATUS[status].color },
                }}
              >
                {STATUS[status].icon}
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {STATUS[status].count(report.summary[status])}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-live="polite">
            <AnimatePresence initial={false}>
              {visible.map((check) => (
                <m.li
                  key={check.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: ease.emphasizedDecelerate }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      py: 1.25,
                      borderTop: `1px solid ${c.outlineVariant}`,
                      '& > svg': { mt: '2px', fontSize: 20, color: STATUS[check.status].color, flexShrink: 0 },
                    }}
                  >
                    {STATUS[check.status].icon}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                          {`${STATUS[check.status].label()}: `}
                        </Box>
                        {check.title}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                        {check.detail}
                      </Typography>
                      {check.hint && (
                        <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                          {check.hint}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </m.li>
              ))}
            </AnimatePresence>
          </Box>
          {passed.length > 0 && (
            <Button size="small" onClick={() => setShowOk((value) => !value)} sx={{ mt: 1, ml: -1 }}>
              {showOk
                ? t('Bestandene Prüfungen ausblenden')
                : tn(passed.length, '1 bestandene Prüfung zeigen', '{count} bestandene Prüfungen zeigen')}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
