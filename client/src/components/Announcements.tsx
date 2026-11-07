import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import type { SxProps, Theme } from '@mui/material/styles';
import CloseRounded from '@mui/icons-material/CloseRounded';
import type { SiteAnnouncement, SiteInfo } from '../lib/types';
import { ease } from '../theme/tokens';
import { t } from '../lib/i18n';
import { readDismissedUpdate, writeDismissedUpdate } from '../lib/updates';

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
  const [dismissedUpdate, setDismissedUpdate] = useState(readDismissedUpdate);
  const items = (site.announcements || []).filter((item) => !dismissed.includes(keyOf(item)));
  const maintenance = Boolean(site.maintenance);
  const update = admin && site.update && dismissedUpdate !== site.update.version ? site.update : null;
  if (!items.length && !maintenance && !update) return null;

  const dismiss = (item: SiteAnnouncement) => {
    const next = [...dismissed, keyOf(item)];
    setDismissed(next);
    writeDismissed(next);
  };

  const dismissUpdate = (version: string) => {
    setDismissedUpdate(version);
    writeDismissedUpdate(version);
  };

  return (
    <Box sx={[{ display: 'grid', gap: 1.25 }, ...(Array.isArray(sx) ? sx : [sx])]} role="region" aria-label={t('Hinweise')}>
      {update && (
        <Alert
          severity={update.security ? 'warning' : 'info'}
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button color="inherit" size="small" href={update.changelog} target="_blank" rel="noopener noreferrer">
                {t('Neuerungen')}
              </Button>
              <Button color="inherit" size="small" href="/admin#system">
                {t('Aktualisieren')}
              </Button>
              <IconButton color="inherit" size="small" aria-label={t('Ausblenden')} onClick={() => dismissUpdate(update.version)}>
                <CloseRounded fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          {update.security
            ? t('Sicherheitsupdate: MoeShare {version} ist erschienen.', { version: update.version })
            : t('MoeShare {version} ist erschienen.', { version: update.version })}
        </Alert>
      )}
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
