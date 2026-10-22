import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type { AuditEvent } from '../../lib/types';
import { errorMessage, fetchAudit } from '../../lib/api';
import { ActivityList } from '../../components/ActivityList';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const CATEGORIES = [
  { key: '', label: t('Alles') },
  { key: 'signin', label: t('Anmeldungen') },
  { key: 'security', label: t('Sicherheit') },
  { key: 'admin', label: t('Verwaltung') },
];

export function ActivityPanel({ initial, retentionDays }: { initial: AuditEvent[]; retentionDays: number }) {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [events, setEvents] = useState(initial);
  const [more, setMore] = useState(initial.length >= 40);
  const [loading, setLoading] = useState(false);

  const load = async (nextCategory: string, before?: number) => {
    setLoading(true);
    try {
      const result = await fetchAudit({ category: nextCategory || undefined, before });
      setEvents((list) => (before ? [...list, ...result.events] : result.events));
      setMore(result.events.length >= 40);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat.key}
            label={cat.label}
            onClick={() => {
              setCategory(cat.key);
              load(cat.key);
            }}
            variant={category === cat.key ? 'filled' : 'outlined'}
            aria-pressed={category === cat.key}
            sx={category === cat.key ? { bgcolor: c.secondaryContainer, color: c.onSecondaryContainer } : undefined}
          />
        ))}
        <Typography variant="caption" sx={{ color: 'text.secondary', ml: { sm: 'auto' } }}>
          {t('Einträge werden nach {retentionDays} Tagen gelöscht.', { retentionDays })}
        </Typography>
      </Box>
      <Box
        sx={{
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerLow,
          px: { xs: 2, sm: 3 },
          py: 1,
          opacity: loading && !more ? 0.6 : 1,
          transition: 'opacity 160ms ease',
        }}
      >
        <ActivityList events={events} showPeople empty={t('In diesem Bereich gibt es noch keine Einträge.')} />
        {more && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
            <Button
              onClick={() => load(category, events[events.length - 1]?.id)}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {t('Ältere anzeigen')}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
