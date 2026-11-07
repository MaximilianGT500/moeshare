import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { SxProps, Theme } from '@mui/material/styles';
import type { SiteAnnouncement, SiteInfo } from '../lib/types';
import { ease } from '../theme/tokens';
import { t } from '../lib/i18n';

const STORAGE_KEY = 'ms-dismissed-announcements';

function readDismissed(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-50)));
  } catch {}
}

const keyOf = (item: SiteAnnouncement) => `${item.id}:${item.updatedAt}`;

export function Announcements({ site, admin = false, sx }: { site: SiteInfo; admin?: boolean; sx?: SxProps<Theme> }) {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const items = (site.announcements || []).filter((item) => !dismissed.includes(keyOf(item)));
  const maintenance = Boolean(site.maintenance);
  if (!items.length && !maintenance) return null;

  const dismiss = (item: SiteAnnouncement) => {
    const next = [...dismissed, keyOf(item)];
    setDismissed(next);
    writeDismissed(next);
  };

  return (
    <Box sx={[{ display: 'grid', gap: 1.25 }, ...(Array.isArray(sx) ? sx : [sx])]} role="region" aria-label={t('Hinweise')}>
      {maintenance && (
        <Alert
          severity="warning"
          action={
            admin ? (
              <Button color="inherit" size="small" href="/admin#hinweise">
                {t('Ändern')}
              </Button>
            ) : undefined
          }
        >
          {t('Der Wartungsmodus ist an. Außer Admins sieht gerade niemand das Dashboard.')}
        </Alert>
      )}
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <m.div
            key={keyOf(item)}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.2, ease: ease.emphasizedAccelerate } }}
            transition={{ duration: 0.3, ease: ease.emphasizedDecelerate }}
          >
            <Alert severity={item.level} onClose={item.dismissible ? () => dismiss(item) : undefined}>
              <AlertTitle sx={{ mb: item.text ? 0.25 : 0 }}>{item.title}</AlertTitle>
              {item.text && <Box sx={{ whiteSpace: 'pre-line' }}>{item.text}</Box>}
            </Alert>
          </m.div>
        ))}
      </AnimatePresence>
    </Box>
  );
}
