import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import { readBoot } from '../../lib/boot';
import type { AdminBoot, GlobalStats, SettingsPayload, UpdateInfo } from '../../lib/types';
import { checkForUpdate, errorMessage, fetchAdminStats } from '../../lib/api';
import { formatBytes, formatNumber, storageSummary } from '../../lib/format';
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
import { ReportsPanel } from './ReportsPanel';
import { AccessPanel } from './AccessPanel';
import { AccessProvider } from './LoginLinkDialog';
import { NoticesPanel } from './NoticesPanel';
import { CaddyPanel } from './CaddyPanel';
import { useToast } from '../../components/Toaster';
import { c, ease, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

type TabKey =
  | 'benutzer'
  | 'einladungen'
  | 'zugaenge'
  | 'dateien'
  | 'meldungen'
  | 'startseite'
  | 'hinweise'
  | 'einstellungen'
  | 'aktivitaet'
  | 'caddy'
  | 'system';
const ALL_TABS: TabKey[] = [
  'benutzer',
  'einladungen',
  'zugaenge',
  'dateien',
  'meldungen',
  'startseite',
  'hinweise',
  'einstellungen',
  'aktivitaet',
  'caddy',
  'system',
];

const DISMISSED_UPDATE = 'ms-dismissed-update';

function readDismissedUpdate() {
  try {
    return window.localStorage.getItem(DISMISSED_UPDATE) || '';
  } catch {
    return '';
  }
}

function UpdateNotice({ initial }: { initial: UpdateInfo }) {
  const toast = useToast();
  const [info, setInfo] = useState(initial);
  const [dismissed, setDismissed] = useState(readDismissedUpdate);
  const [busy, setBusy] = useState(false);
  if (!info.enabled || !info.available || dismissed === info.available) return null;

  const dismiss = () => {
    const version = info.available || '';
    setDismissed(version);
    try {
      window.localStorage.setItem(DISMISSED_UPDATE, version);
    } catch {}
  };

  const recheck = async () => {
    setBusy(true);
    try {
      const next = await checkForUpdate();
      setInfo(next);
      if (!next.available) toast(t('Du nutzt die neueste Version.'));
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Alert
      severity="info"
      onClose={dismiss}
      sx={{ mt: 1, mb: 2, alignItems: 'center' }}
      action={
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Button color="inherit" size="small" href={info.changelog} target="_blank" rel="noopener noreferrer">
            {t('Was ist neu?')}
          </Button>
          <Button color="inherit" size="small" onClick={recheck} disabled={busy}>
            {t('Erneut prüfen')}
          </Button>
        </Box>
      }
    >
      {t('Version {latest} ist erschienen. Hier läuft noch {current}.', { latest: info.available, current: info.current })}
    </Alert>
  );
}

const tabsFor = (boot: AdminBoot) => ALL_TABS.filter((key) => key !== 'meldungen' || boot.moderation.enabled || boot.moderation.open > 0);

const tabFromHash = (tabs: TabKey[]): TabKey => {
  const hash = window.location.hash.replace('#', '') as TabKey;
  return tabs.includes(hash) ? hash : 'benutzer';
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
  const TABS = tabsFor(boot);
  const [tab, setTab] = useState<TabKey>(() => tabFromHash(tabsFor(boot)));
  const [openReports, setOpenReports] = useState(boot.moderation.open);
  const [pendingLinks, setPendingLinks] = useState(boot.access.pending);
  const [direction, setDirection] = useState(0);
  const [stats, setStats] = useState<GlobalStats>(boot.stats);
  const [fileTotal, setFileTotal] = useState(boot.files.total);
  const [activeInvites, setActiveInvites] = useState(boot.invites.filter((i) => i.state === 'active').length);
  const [settings, setSettings] = useState<SettingsPayload>(boot.settings);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const values = settings.values;

  useEffect(() => {
    const onHash = () => setTab(tabFromHash(tabsFor(boot)));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [boot]);

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
      label: t('Benutzer'),
      value: <AnimatedNumber value={stats.users} format={formatNumber} />,
      note: tn(admins, '1 Admin, {mfa} mit Zwei-Faktor', '{count} Admins, {mfa} mit Zwei-Faktor', { mfa: formatNumber(withMfa) }),
    },
    {
      label: t('Dateien'),
      value: <AnimatedNumber value={stats.files} format={formatNumber} />,
      note: stats.files
        ? t('im Schnitt {bytes} pro Datei', { bytes: formatBytes(stats.storageBytes / stats.files) })
        : t('noch keine Uploads'),
    },
    {
      label: t('Speicher'),
      value: <AnimatedNumber value={stats.storageBytes} format={formatBytes} />,
      note: values['uploads.defaultQuotaBytes']
        ? t('Limit pro Konto: {bytes}', { bytes: formatBytes(values['uploads.defaultQuotaBytes'] as number) })
        : t('ohne Limit pro Konto'),
    },
    {
      label: t('Aufrufe'),
      value: <AnimatedNumber value={stats.views} format={formatNumber} />,
      note: stats.files
        ? t('im Schnitt {number} pro Datei', { number: formatNumber(stats.views / stats.files) })
        : t('über alle Ansichtsseiten'),
    },
  ];

  const label: Record<TabKey, string> = {
    benutzer: t('Benutzer ({users})', { users: formatNumber(stats.users) }),
    einladungen: activeInvites ? t('Einladungen ({activeInvites})', { activeInvites }) : t('Einladungen'),
    dateien: t('Dateien ({fileTotal})', { fileTotal: formatNumber(fileTotal) }),
    zugaenge: pendingLinks ? t('Zugänge ({count})', { count: formatNumber(pendingLinks) }) : t('Zugänge'),
    meldungen: openReports ? t('Meldungen ({count})', { count: formatNumber(openReports) }) : t('Meldungen'),
    startseite: t('Startseite'),
    hinweise: values['maintenance.enabled'] ? t('Hinweise (Wartung)') : t('Hinweise'),
    einstellungen: t('Einstellungen'),
    aktivitaet: t('Aktivität'),
    caddy: t('Caddy'),
    system: t('System'),
  };

  const defaults = {
    quotaBytes: (values['uploads.defaultQuotaBytes'] as number | null) ?? null,
    maxFileBytes: (values['uploads.maxFileBytes'] as number | null) ?? null,
  };

  const access = useMemo(
    () => ({
      passwordLogin: values['auth.passwordLogin'] !== false,
      linksEnabled: values['auth.loginLinks'] !== false,
      defaultMinutes: Number(values['auth.loginLinkMinutes']) || 15,
      maxMinutes: Number(values['auth.loginLinkMaxMinutes']) || 1440,
      mailReady: boot.mail.ready,
      baseUrl: boot.site.baseUrl,
    }),
    [values, boot.mail.ready, boot.site.baseUrl]
  );

  return (
    <AccessProvider value={access}>
      <AppShell
        site={boot.site}
        user={boot.user}
        active="admin"
        topBar={
          <Typography variant="h5" component="h1" sx={{ pl: { xs: 1, md: 0 } }}>
            {t('Administration')}
          </Typography>
        }
        accountSummary={storageSummary(boot.userStats)}
      >
        <UpdateNotice initial={boot.update} />
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
          <ScrollTabs value={tab} onChange={select} label={t('Bereiche')}>
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
              <InvitesPanel
                initial={boot.invites}
                registration={values['auth.registration'] as string}
                onCount={setActiveInvites}
                mailReady={boot.mail.ready}
              />
            )}
            {tab === 'zugaenge' && (
              <AccessPanel
                users={boot.users}
                onPending={setPendingLinks}
                onOpenSettings={() => {
                  setSettingsSection('anmeldung');
                  select('einstellungen');
                }}
              />
            )}
            {tab === 'dateien' && (
              <FilesPanel initial={boot.files} onChanged={refreshStats} onTotal={setFileTotal} trashEnabled={!!values['trash.enabled']} />
            )}
            {tab === 'meldungen' && <ReportsPanel enabled={!!values['reports.enabled']} onOpenCount={setOpenReports} />}
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
            {tab === 'hinweise' && <NoticesPanel initial={boot.announcements} settings={settings} onSettings={setSettings} />}
            {tab === 'einstellungen' && (
              <SettingsPanel
                initial={settings}
                initialSection={settingsSection}
                currentUserTotp={boot.sudo.totp}
                currentUserWayIn={boot.sudo.passkey || boot.sudo.providers.length > 0}
                mailReady={boot.mail.ready}
                storage={boot.storage}
                backups={boot.backups}
                webhooks={boot.webhooks}
                imports={boot.imports}
                onSaved={(next) => {
                  setSettings(next);
                  if (next.values['auth.enforceMfa'] !== 'off' && !boot.sudo.totp) window.location.assign('/account?setup=mfa');
                }}
              />
            )}
            {tab === 'aktivitaet' && (
              <ActivityPanel initial={boot.audit} retentionDays={(values['system.auditRetentionDays'] as number) || 90} />
            )}
            {tab === 'caddy' && <CaddyPanel settings={settings} onSettings={setSettings} />}
            {tab === 'system' && (
              <SystemPanel
                initial={boot.system}
                database={boot.database}
                ffmpeg={boot.storage.ffmpeg}
                update={boot.update}
                videos={boot.videos}
              />
            )}
          </m.div>
        </AnimatePresence>
      </AppShell>
    </AccessProvider>
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
