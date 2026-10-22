import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { c, radius } from '../theme/tokens';
import { t } from '../lib/i18n';

export function SideSheet({
  open,
  onClose,
  title,
  subtitle,
  leading,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: width },
            maxWidth: '100%',
            bgcolor: c.surfaceContainerLow,
            borderTopLeftRadius: { sm: radius.xl },
            borderBottomLeftRadius: { sm: radius.xl },
            backgroundImage: 'none',
          },
        },
      }}
      sx={{ zIndex: 1300 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, sm: 3 }, pt: 2.5, pb: 2 }}>
        {leading}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="h2" noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <Tooltip title={t('Schließen')}>
          <IconButton aria-label={t('Schließen')} onClick={onClose}>
            <CloseRounded />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 }, pb: 4 }}>{children}</Box>
    </Drawer>
  );
}
