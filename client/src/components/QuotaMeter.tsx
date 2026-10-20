import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatBytes } from '../lib/format';
import { c, ease, radius } from '../theme/tokens';

export function QuotaMeter({
  usedBytes,
  quotaBytes,
  compact = false,
}: {
  usedBytes: number;
  quotaBytes: number | null;
  compact?: boolean;
}) {
  if (!quotaBytes) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {formatBytes(usedBytes)} belegt, kein Speicherlimit
      </Typography>
    );
  }
  const share = Math.min(1, usedBytes / quotaBytes);
  const percent = Math.round(share * 100);
  const color = share >= 0.95 ? c.error : share >= 0.8 ? c.warning : c.primary;
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mb: 0.75 }}>
        <Typography variant="body2">
          <Box component="span" sx={{ fontWeight: 700 }}>
            {formatBytes(usedBytes)}
          </Box>{' '}
          <Box component="span" sx={{ color: 'text.secondary' }}>
            von {formatBytes(quotaBytes)}
          </Box>
        </Typography>
        {!compact && (
          <Typography variant="caption" sx={{ color: share >= 0.8 ? color : 'text.secondary', fontWeight: share >= 0.8 ? 700 : 400 }}>
            {share >= 0.95 ? 'Fast voll' : usedBytes > 0 && percent === 0 ? 'unter 1 %' : `${percent} %`}
          </Typography>
        )}
      </Box>
      <Box
        role="meter"
        aria-label="Speicher belegt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        sx={{ height: 8, borderRadius: `${radius.full}px`, bgcolor: c.surfaceContainerHighest, overflow: 'hidden' }}
      >
        <m.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={{ duration: 0.8, ease: ease.emphasizedDecelerate, delay: 0.1 }}
          style={{ height: '100%', width: '100%', transformOrigin: 'left', background: color, borderRadius: 999 }}
        />
      </Box>
    </Box>
  );
}
