import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import AutoDeleteOutlined from '@mui/icons-material/AutoDeleteOutlined';
import type { RetentionPreview } from '../../lib/types';
import { errorMessage, fetchRetention, runRetention } from '../../lib/api';
import { formatBytes, formatDate, relativeMs } from '../../lib/format';
import { siteName } from '../../lib/boot';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

const dayText = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return year && month && date ? formatDate(new Date(year, month - 1, date)) : day;
};

export function RetentionPreviewCard({ dirty, version }: { dirty: boolean; version: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<RetentionPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchRetention()
      .then(setData)
      .catch(() => {});
  }, [version]);

  if (!data) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
        <Skeleton variant="text" width="60%" />
      </Box>
    );
  }

  const apply = async () => {
    const ok = await confirm({
      title: t('Regel jetzt anwenden?'),
      message: tn(
        data.count,
        'Eine Datei läuft dann in {days} Tagen ab. Ihr Besitzer bekommt einen Hinweis und kann sie mit einem Stern behalten.',
        '{count} Dateien laufen dann in {days} Tagen ab. Die Besitzer bekommen einen Hinweis und können sie mit einem Stern behalten.',
        { days: data.grace }
      ),
      confirmLabel: t('Anwenden'),
      icon: <AutoDeleteOutlined />,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await runRetention();
      setData(result.preview);
      toast(
        result.done.marked
          ? tn(result.done.marked, 'Eine Datei läuft in {days} Tagen ab.', '{count} Dateien laufen in {days} Tagen ab.', {
              days: data.grace,
            })
          : t('Nichts zu tun. Alle Dateien wurden zuletzt benutzt.'),
        { variant: 'success' }
      );
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (!data.enabled) {
    body = (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('Aus. Dateien bleiben, bis jemand sie löscht oder ihre eigene Ablaufzeit erreicht ist.')}
      </Typography>
    );
  } else if (data.blocked === 'stats') {
    body = (
      <Alert severity="warning">
        {t(
          'Die Statistik wird nur {days} Tage aufbewahrt. Wähl eine kürzere Frist oder bewahr die Statistik unter Funktionen › Statistiken länger auf.',
          { days: data.statsDays }
        )}
      </Alert>
    );
  } else if (data.blocked === 'statsOff') {
    body = (
      <Alert severity="warning">
        {t('Die Statistik ist abgeschaltet. Ohne sie weiß {name} nicht, welche Dateien benutzt werden, deshalb läuft nichts ab.', {
          name: siteName(),
        })}
      </Alert>
    );
  } else if (data.blocked === 'history') {
    body = (
      <Alert severity="info">
        {data.since
          ? t('Die Statistik reicht erst bis zum {date} zurück. Die Regel greift, sobald sie {days} Tage abdeckt.', {
              date: dayText(data.since),
              days: data.unused,
            })
          : t('Es gibt noch keine Statistik. Die Regel greift, sobald sie {days} Tage abdeckt.', { days: data.unused })}
      </Alert>
    );
  } else {
    body = (
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        <Typography variant="body2">
          {data.count
            ? tn(data.count, 'Gerade käme eine Datei mit {size} dazu.', 'Gerade kämen {count} Dateien mit {size} dazu.', {
                size: formatBytes(data.bytes),
              })
            : t('Gerade ist keine Datei lange genug unbenutzt.')}
        </Typography>
        {data.users.length > 0 && (
          <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', fontSize: '0.875rem', display: 'grid', gap: 0.25 }}>
            {data.users.map((entry) => (
              <li key={entry.username}>
                {t('{user}: {files}, {size}', {
                  user: entry.username,
                  files: tn(entry.count, '1 Datei', '{count} Dateien'),
                  size: formatBytes(entry.bytes),
                })}
              </li>
            ))}
          </Box>
        )}
        <Box>
          <Button
            variant="tonal"
            onClick={apply}
            disabled={busy || dirty || data.count === 0}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoDeleteOutlined />}
          >
            {t('Jetzt anwenden')}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25, display: 'grid', gap: 1.5 }} aria-live="polite">
      <Typography variant="subtitle2" component="h3">
        {t('Vorschau')}
      </Typography>
      {dirty && (
        <Typography variant="caption" sx={{ color: c.tertiary }}>
          {t('Speichere zuerst. Die Vorschau zeigt die gespeicherten Einstellungen.')}
        </Typography>
      )}
      {body}
      {(data.pending.count > 0 || data.lastRun) && (
        <Box sx={{ p: 1.5, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHigh, display: 'grid', gap: 0.5 }}>
          {data.pending.count > 0 && (
            <Typography variant="body2">
              {tn(
                data.pending.count,
                'Eine Datei mit {size} läuft gerade wegen der Regel ab.',
                '{count} Dateien mit {size} laufen gerade wegen der Regel ab.',
                { size: formatBytes(data.pending.bytes) }
              )}
            </Typography>
          )}
          {data.lastRun && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('Zuletzt angewendet {when}: {marked} markiert, {released} wieder freigegeben.', {
                when: relativeMs(data.lastRun.at),
                marked: data.lastRun.marked,
                released: data.lastRun.released,
              })}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
