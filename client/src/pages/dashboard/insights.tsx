import { useCallback } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { FileItem, StatsOverview } from '../../lib/types';
import { fetchStatsOverview } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { t, tn } from '../../lib/i18n';
import { FileThumb } from '../../components/FileThumb';
import { StatsPanel } from '../../components/StatsView';
import { displayName } from './MediaTile';
import { c, css, radius } from '../../theme/tokens';

function breakdown(entry: StatsOverview['top'][number]) {
  const parts: string[] = [];
  if (entry.views) parts.push(tn(entry.views, '1 Aufruf', '{count} Aufrufe'));
  if (entry.downloads) parts.push(tn(entry.downloads, '1 Download', '{count} Downloads'));
  if (entry.direct) parts.push(tn(entry.direct, '1-mal direkt', '{count}-mal direkt'));
  return parts.join(', ');
}

function TopFiles({ entries, onOpen }: { entries: StatsOverview['top']; onOpen: (file: FileItem) => void }) {
  return (
    <Box>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1.25 }}>
        {t('Am häufigsten abgerufen')}
      </Typography>
      {entries.length ? (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.5 }}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <ButtonBase
                onClick={() => onOpen(entry.file)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 0.75,
                  pr: 1.5,
                  textAlign: 'left',
                  borderRadius: `${radius.md}px`,
                  transition: `background-color 160ms ${css.standard}`,
                  '&:hover': { bgcolor: c.surfaceContainerHigh },
                  '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
                }}
              >
                <FileThumb file={entry.file} size={44} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {displayName(entry.file)}
                  </Typography>
                  <Typography variant="caption" component="p" noWrap sx={{ color: 'text.secondary' }}>
                    {breakdown(entry) || t('Nur Vorschauen')}
                  </Typography>
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(entry.total)}
                </Typography>
              </ButtonBase>
            </li>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('In diesem Zeitraum hat noch niemand deine Dateien abgerufen.')}
        </Typography>
      )}
    </Box>
  );
}

export function InsightsView({ onOpen }: { onOpen: (file: FileItem) => void }) {
  const load = useCallback((days: number) => fetchStatsOverview(days), []);
  return (
    <Box sx={{ maxWidth: 1080, pb: 4 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 680 }}>
        {t('Alle deine Dateien zusammen. Gezählt werden nur Abrufe von anderen, ohne IP-Adressen oder Geräte zu speichern.')}
      </Typography>
      <StatsPanel load={load} aside={(data) => <TopFiles entries={data.top} onOpen={onOpen} />} />
    </Box>
  );
}
