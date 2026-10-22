import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import { readBoot } from '../../lib/boot';
import type { ReportBoot } from '../../lib/types';
import { ReportForm } from '../../components/ReportDialog';
import { AuthLayout } from '../login/AuthLayout';
import { c, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

export function ReportPage() {
  const boot = readBoot<ReportBoot>();
  return (
    <AuthLayout site={boot.site} wide>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: `${radius.tile}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: c.errorContainer,
            color: c.onErrorContainer,
          }}
        >
          <FlagOutlined />
        </Box>
        <Typography variant="h5" component="h1">
          {t('Inhalt melden')}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        {t('Füge die Adresse der Datei, des Albums, des Kurzlinks oder des Profils ein und sag uns, was nicht stimmt.')}
      </Typography>
      <ReportForm askUrl initialUrl={boot.report.url} />
    </AuthLayout>
  );
}
