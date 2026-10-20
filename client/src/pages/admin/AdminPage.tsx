import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import { readBoot } from '../../lib/boot';
import type { AdminBoot, GlobalStats, SettingsPayload } from '../../lib/types';
import { fetchAdminStats } from '../../lib/api';
import { formatBytes, formatNumber, plural, storageSummary } from '../../lib/format';
import { AppShell } from '../../components/AppShell';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { ConfirmProvider } from '../../components/ConfirmDialog';
import { SudoProvider } from '../../components/Sudo';
import { ScrollTabs } from '../../components/ScrollTabs';
import { UsersPanel } from './UsersPanel';
import { InvitesPanel } from './InvitesPanel';
import { FilesPanel } from './FilesPanel';
import { SettingsPanel } from './SettingsPanel';
import { HomePanel } from './HomePanel';
import { ActivityPanel } from './ActivityPanel';
import { SystemPanel } from './SystemPanel';
import { c, ease, radius } from '../../theme/tokens';

type TabKey = 'benutzer' | 'einladungen' | 'dateien' | 'startseite' | 'einstellungen' | 'aktivitaet' | 'system';
const TABS: TabKey[] = ['benutzer', 'einladungen', 'dateien', 'startseite', 'einstellungen', 'aktivitaet', 'system'];

const tabFromHash = (): TabKey => {
  const hash = window.location.hash.replace('#', '') as TabKey;
  return TABS.includes(hash) ? hash : 'benutzer';
};

function Figure({ label, value, note, index }: { label: string; value: ReactNode; note: string; index: number }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06, duration: 0.5, ease: ease.emphasizedDecelerate }}
      style={{ minWidth: 0 }}
    >
      <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 2.5 }, height: '100%' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography component="p" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' }, fontWeight: 800, lineHeight: 1.15, mt: 0.5 }}>
          {value}
        </Typography>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {note}
        </Typography>
      </Box>
    </m.div>
  );
}

function Admin({ boot }: { boot: AdminBoot }) {
  const [tab, setTab] = useState<TabKey>(tabFromHash);
  const [direction, setDirection] = useState(0);
  const [stats, setStats] = useState<GlobalStats>(boot.stats);
  const [fileTotal, setFileTotal] = useState(boot.files.total);
  const [activeInvites, setActiveInvites] = useState(boot.invites.filter((i) => i.state === 'active').length);
  const [settings, setSettings] = useState<SettingsPayload>(boot.settings);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const values = settings.values;

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshStats = useCallback(() => {
    fetchAdminStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const admins = boot.users.filter((u) => u.role === 'admin').length;
  const withMfa = boot.users.filter((u) => u.totp).length;

  const select = (next: TabKey) => {
    setDirection(TABS.indexOf(next) > TABS.indexOf(tab) ? 1 : -1);
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  const figures = [
    {
      label: 'Benutzer',
      value: <AnimatedNumber value={stats.users} format={formatNumber} />,
      note: `${plural(admins, 'Admin', 'Admins')}, ${withMfa} mit Zwei-Faktor`,
    },
    {
      label: 'Dateien',
      value: <AnimatedNumber value={stats.files} format={formatNumber} />,
      note: stats.files ? `im Schnitt ${formatBytes(stats.storageBytes / stats.files)} pro Datei` : 'noch keine Uploads',
    },
    {
      label: 'Speicher',
      value: <AnimatedNumber value={stats.storageBytes} format={formatBytes} />,
      note: values['uploads.defaultQuotaBytes']
        ? `Limit pro Konto: ${formatBytes(values['uploads.defaultQuotaBytes'] as number)}`
        : 'ohne Limit pro Konto',
    },
    {
      label: 'Aufrufe',
      value: <AnimatedNumber value={stats.views} format={formatNumber} />,
      note: stats.files ? `im Schnitt ${formatNumber(stats.views / stats.files)} pro Datei` : 'über alle Ansichtsseiten',
    },
  ];

  const label: Record<TabKey, string> = {
    benutzer: `Benutzer (${formatNumber(stats.users)})`,
    einladungen: activeInvites ? `Einladungen (${activeInvites})` : 'Einladungen',
    dateien: `Dateien (${formatNumber(fileTotal)})`,
    startseite: 'Startseite',
    einstellungen: 'Einstellungen',
    aktivitaet: 'Aktivität',
    system: 'System',
  };

  const defaults = {
    quotaBytes: (values['uploads.defaultQuotaBytes'] as number | null) ?? null,
    maxFileBytes: (values['uploads.maxFileBytes'] as number | null) ?? null,
  };

  return (
    <AppShell
      site={boot.site}
      user={boot.user}
      active="admin"
      topBar={
        <Typography variant="h5" component="h1" sx={{ pl: { xs: 1, md: 0 } }}>
          Administration
        </Typography>
      }
      accountSummary={storageSummary(boot.userStats)}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerLow,
          overflow: 'hidden',
          mt: 1,
          '& > *': { borderLeft: `1px solid ${c.outlineVariant}`, borderTop: `1px solid ${c.outlineVariant}` },
          '& > *:nth-of-type(-n+2)': { borderTop: 'none' },
          '& > *:nth-of-type(odd)': { borderLeft: 'none' },
          '@media (min-width: 1200px)': {
            '& > *': { borderTop: 'none' },
            '& > *:nth-of-type(odd)': { borderLeft: `1px solid ${c.outlineVariant}` },
            '& > *:first-of-type': { borderLeft: 'none' },
          },
        }}
      >
        {figures.map((figure, index) => (
          <Figure key={figure.label} index={index} {...figure} />
        ))}
      </Box>

      <Box sx={{ mt: 3, mb: 2.5, borderBottom: `1px solid ${c.outlineVariant}` }}>
        <ScrollTabs value={tab} onChange={select} label="Bereiche">
          {TABS.map((key) => (
            <Tab key={key} value={key} label={label[key]} id={`tab-${key}`} aria-controls={`panel-${key}`} />
          ))}
        </ScrollTabs>
      </Box>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <m.div
          key={tab}
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          custom={direction}
          initial={{ opacity: 0, x: direction * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -28, transition: { duration: 0.14, ease: ease.emphasizedAccelerate } }}
          transition={{ duration: 0.32, ease: ease.emphasizedDecelerate }}
        >
          {tab === 'benutzer' && (
            <UsersPanel
              initial={boot.users}
              currentUser={boot.user.username}
              onChanged={refreshStats}
              minPasswordLength={(values['auth.passwordMinLength'] as number) || 10}
              defaults={defaults}
              baseUrl={boot.site.baseUrl}
              siteTitle={boot.site.title}
            />
          )}
          {tab === 'einladungen' && (
            <InvitesPanel initial={boot.invites} registration={values['auth.registration'] as string} onCount={setActiveInvites} />
          )}
          {tab === 'dateien' && <FilesPanel initial={boot.files} onChanged={refreshStats} onTotal={setFileTotal} />}
          {tab === 'startseite' && (
            <HomePanel
              initial={settings}
              site={boot.site}
              stats={boot.homeStats}
              registrationOpen={values['auth.registration'] === 'open'}
              onSaved={setSettings}
              onOpenSettings={() => {
                setSettingsSection('rechtliches');
                select('einstellungen');
              }}
            />
          )}
          {tab === 'einstellungen' && (
            <SettingsPanel
              initial={settings}
              initialSection={settingsSection}
              currentUserTotp={boot.sudo.totp}
              onSaved={(next) => {
                setSettings(next);
                if (next.values['auth.enforceMfa'] !== 'off' && !boot.sudo.totp) window.location.assign('/account?setup=mfa');
              }}
            />
          )}
          {tab === 'aktivitaet' && (
            <ActivityPanel initial={boot.audit} retentionDays={(values['system.auditRetentionDays'] as number) || 90} />
          )}
          {tab === 'system' && <SystemPanel initial={boot.system} />}
        </m.div>
      </AnimatePresence>
    </AppShell>
  );
}

export function AdminPage() {
  const boot = readBoot<AdminBoot>();
  return (
    <ConfirmProvider>
      <SudoProvider methods={boot.sudo}>
        <Admin boot={boot} />
      </SudoProvider>
    </ConfirmProvider>
  );
}
