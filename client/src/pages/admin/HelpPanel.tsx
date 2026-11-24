import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import { PulseSupport } from '../../moepulse';
import { pulseSupport } from '../../lib/api';
import type { PulseAdminState } from '../../lib/types';
import { language, t } from '../../lib/i18n';
import { c, radius } from '../../theme/tokens';

const README = 'https://github.com/MaximilianGT500/moeshare#readme';
const ISSUES = 'https://github.com/MaximilianGT500/moeshare/issues';

export function HelpPanel({
  pulse,
  defaults,
  onUnread,
  onOpenSystem,
}: {
  pulse: PulseAdminState;
  defaults: { name: string; email: string };
  onUnread: (count: number) => void;
  onOpenSystem: () => void;
}) {
  const lang = language === 'en' ? 'en' : 'de';
  return (
    <Stack spacing={3}>
      <Box
        component="section"
        aria-label={t('Support')}
        sx={{ p: { xs: 2.5, md: 3 }, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow }}
      >
        {pulse.locked ? (
          <Alert severity="info">
            {t('Der Kontakt zu MoeStudio ist auf diesem Server abgeschaltet. Fragen und Fehler kannst du trotzdem auf GitHub melden.')}
          </Alert>
        ) : (
          <PulseSupport
            support={pulseSupport}
            language={lang}
            developer="Max von MoeStudio"
            defaults={defaults}
            diagnostics={pulse.value.stats}
            onUnread={onUnread}
            privacy={t(
              'Deine Nachricht geht an {dev} und wird nur für diese Anfrage verwendet. Mit „Gesendete Daten löschen“ unter System verschwindet sie wieder.'
            )}
          />
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        {[
          {
            icon: <MenuBookRounded />,
            title: t('Anleitung'),
            text: t('Installation, Einstellungen und alle Funktionen stehen in der README auf GitHub.'),
            href: README,
            action: t('README öffnen'),
          },
          {
            icon: <BugReportOutlined />,
            title: t('Fehler öffentlich melden'),
            text: t('Lieber öffentlich? Auf GitHub kannst du Fehler melden und sehen, woran gerade gearbeitet wird.'),
            href: ISSUES,
            action: t('Zu den Issues'),
          },
        ].map((item) => (
          <Box key={item.title} sx={{ p: 2.5, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow, display: 'grid', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: c.primary }}>
              {item.icon}
              <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {item.title}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {item.text}
            </Typography>
            <Box>
              <Button href={item.href} target="_blank" rel="noopener noreferrer" size="small" sx={{ ml: -1 }}>
                {item.action}
              </Button>
            </Box>
          </Box>
        ))}
        <Box sx={{ p: 2.5, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow, display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: c.primary }}>
            <ForumOutlined />
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {t('Diagnose')}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {pulse.value.stats
              ? t(
                  'Die Nutzungsstatistik ist an, deshalb ist der Haken für die Diagnose schon gesetzt. Du kannst ihn pro Nachricht abwählen.'
                )
              : t(
                  'Mit Nutzungsstatistik und Fehlerberichten kann MoeStudio Fehler schneller finden. Beides schaltest du unter System ein.'
                )}
          </Typography>
          <Box>
            <Button size="small" onClick={onOpenSystem} sx={{ ml: -1 }}>
              {t('Zu System')}
            </Button>
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
