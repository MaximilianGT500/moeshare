import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { Notice } from './client';

export interface PulseNoticesProps {
  notices?: Notice[];
  load?: () => Promise<Notice[]>;
  language?: 'de' | 'en';
  storageKey?: string;
  dismissible?: boolean;
}

const LABELS = {
  de: { more: 'Mehr erfahren', close: 'Ausblenden' },
  en: { more: 'Learn more', close: 'Dismiss' },
};

const SEVERITY = { info: 'info', warning: 'warning', security: 'error' } as const;

function readDismissed(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return new Set(Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : []);
  } catch {
    return new Set<number>();
  }
}

function writeDismissed(key: string, ids: Set<number>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids].slice(-100)));
  } catch {}
}

export function PulseNotices({ notices, load, language = 'de', storageKey = 'moepulse.notices', dismissible = true }: PulseNoticesProps) {
  const t = LABELS[language];
  const [loaded, setLoaded] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(() => readDismissed(storageKey));

  useEffect(() => {
    if (!load) return;
    let alive = true;
    load()
      .then((items) => alive && setLoaded(items))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [load]);

  const visible = (notices ?? loaded).filter((notice) => notice.level === 'security' || !dismissed.has(notice.id));
  if (!visible.length) return null;

  const dismiss = (id: number) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    writeDismissed(storageKey, next);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }} role="region" aria-label="MoeStudio">
      {visible.map((notice) => (
        <Alert
          key={notice.id}
          severity={SEVERITY[notice.level]}
          onClose={dismissible && notice.level !== 'security' ? () => dismiss(notice.id) : undefined}
          slotProps={{ closeButton: { 'aria-label': t.close, title: t.close } }}
        >
          <AlertTitle sx={{ fontWeight: 700 }}>{notice.title}</AlertTitle>
          <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {notice.body}
          </Typography>
          {notice.link && /^https:\/\/\S+$/.test(notice.link) && (
            <Button
              component="a"
              href={notice.link}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              color="inherit"
              sx={{ mt: 1, ml: -1 }}
            >
              {t.more}
            </Button>
          )}
        </Alert>
      ))}
    </Box>
  );
}
