import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { delimiterLabel, numericColumns, type CsvData } from '../lib/csv';
import { formatNumber } from '../lib/format';
import { mix } from '../lib/color';
import { t } from '../lib/i18n';
import { c, fonts } from '../theme/tokens';

export function CsvTable({ data, limit }: { data: CsvData & { delimiter: string }; limit: number }) {
  const head = data.rows[0] || [];
  const rows = useMemo(() => data.rows.slice(1, limit + 1), [data, limit]);
  const numeric = useMemo(() => numericColumns(rows, data.columns), [rows, data.columns]);
  const columns = Array.from({ length: data.columns }, (_, index) => index);
  const shown = rows.length;
  const total = Math.max(0, data.total - 1);

  return (
    <Box>
      <Box sx={{ maxHeight: { xs: '70vh', md: 'min(78vh, calc(100dvh - 290px))' }, overflow: 'auto' }}>
        <Box
          component="table"
          sx={{
            borderCollapse: 'separate',
            borderSpacing: 0,
            minWidth: '100%',
            fontSize: { xs: '0.8125rem', sm: '0.875rem' },
            '& th, & td': {
              px: 1.5,
              py: 0.75,
              textAlign: 'left',
              whiteSpace: 'nowrap',
              maxWidth: '28em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              borderBottom: `1px solid ${mix(c.outlineVariant, 70)}`,
              borderRight: `1px solid ${mix(c.outlineVariant, 45)}`,
            },
            '& thead th': {
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: c.surfaceContainerHigh,
              fontWeight: 700,
              borderBottom: `1px solid ${c.outlineVariant}`,
            },
            '& .num': { textAlign: 'right' },
            '& td.num': { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' },
            '& .line': {
              position: 'sticky',
              left: 0,
              color: c.onSurfaceVariant,
              bgcolor: c.surfaceContainerLow,
              fontFamily: fonts.mono,
              textAlign: 'right',
              userSelect: 'none',
            },
            '& thead .line': { zIndex: 2, bgcolor: c.surfaceContainerHigh },
            '& tbody tr:hover td': { bgcolor: mix(c.primary, 6) },
            '& tbody tr:hover .line': { bgcolor: c.surfaceContainer },
          }}
        >
          <thead>
            <tr>
              <th className="line" aria-label={t('Zeile')} />
              {columns.map((column) => (
                <th key={column} className={numeric[column] ? 'num' : undefined} title={head[column] || undefined}>
                  {head[column] ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, line) => (
              <tr key={line}>
                <td className="line">{line + 1}</td>
                {columns.map((column) => {
                  const value = row[column] ?? '';
                  return (
                    <td key={column} className={numeric[column] ? 'num' : undefined} title={value.length > 40 ? value : undefined}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          px: 2,
          py: 1,
          borderTop: `1px solid ${c.outlineVariant}`,
          color: 'text.secondary',
        }}
      >
        <Typography variant="caption">{t('Getrennt durch: {delimiter}', { delimiter: delimiterLabel(data.delimiter) })}</Typography>
        {total > shown && (
          <Typography variant="caption">
            {t('Die Vorschau zeigt die ersten {shown} von {total} Zeilen.', { shown: formatNumber(shown), total: formatNumber(total) })}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
