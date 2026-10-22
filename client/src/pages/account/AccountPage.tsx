import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import { readBoot } from '../../lib/boot';
import type { AccountBoot, AccountOverview } from '../../lib/types';
import { errorMessage, fetchAccount } from '../../lib/api';
import { formatDate, relativeMs, storageSummary } from '../../lib/format';
import { providerLabel } from '../../lib/providers';
import { AppShell } from '../../components/AppShell';
import { ConfirmProvider } from '../../components/ConfirmDialog';
import { SudoProvider } from '../../components/Sudo';
import { UserAvatar } from '../../components/UserAvatar';
import { QuotaMeter } from '../../components/QuotaMeter';
import { useToast } from '../../components/Toaster';
import { ScrollTabs } from '../../components/ScrollTabs';
import { SecurityPanel } from './SecurityPanel';
import { SessionsPanel } from './SessionsPanel';
import { ApiPanel } from './ApiPanel';
import { ProfilePanel } from './ProfilePanel';
import { PreferencesPanel } from './PreferencesPanel';
import { DomainsPanel } from './DomainsPanel';
import { c, ease, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

type TabKey = 'sicherheit' | 'einstellungen' | 'domains' | 'geraete' | 'sharex' | 'konto';
const ALL_TABS: TabKey[] = ['sicherheit', 'einstellungen', 'domains', 'geraete', 'sharex', 'konto'];
const LABELS: Record<TabKey, string> = {
  sicherheit: t('Sicherheit'),
  einstellungen: t('Einstellungen'),
  domains: t('Domains'),
  geraete: t('Geräte'),
  sharex: t('ShareX und API'),
  konto: t('Konto'),
};

const tabsFor = (account: AccountOverview) =>
  ALL_TABS.filter((key) => key !== 'domains' || account.domains.enabled || account.domains.items.length > 0);

const tabFromHash = (tabs: TabKey[]): TabKey => {
  const hash = window.location.hash.replace('#', '') as TabKey;
  return tabs.includes(hash) ? hash : 'sicherheit';
};

const EMAIL_NOTICES: Record<string, { text: () => string; variant: 'success' | 'error' }> = {
  bestaetigt: { text: () => t('Deine E-Mail-Adresse ist bestätigt.'), variant: 'success' },
  vergeben: { text: () => t('Diese E-Mail-Adresse gehört schon zu einem anderen Konto.'), variant: 'error' },
  abgelaufen: { text: () => t('Der Bestätigungslink ist abgelaufen oder wurde schon benutzt.'), variant: 'error' },
};

const OAUTH_MESSAGES: Record<string, { text: (label: string) => string; variant: 'success' | 'error' }> = {
  linked: { text: (label) => t('{label} ist jetzt verknüpft', { label }), variant: 'success' },
  taken: { text: (label) => t('Dieses {label}-Konto ist schon mit einem anderen Benutzer verknüpft.', { label }), variant: 'error' },
  mismatch: { text: (label) => t('Das war ein anderes {label}-Konto als das verknüpfte.', { label }), variant: 'error' },
  disabled: { text: (label) => t('Die Anmeldung mit {label} ist auf diesem Server nicht aktiviert.', { label }), variant: 'error' },
  failed: { text: (label) => t('{label} ist gerade nicht erreichbar. Versuche es später erneut.', { label }), variant: 'error' },
};

function Account({ boot }: { boot: AccountBoot }) {
  const toast = useToast();
  const [account, setAccount] = useState<AccountOverview>(boot.account);
  const TABS = tabsFor(account);
  const [tab, setTab] = useState<TabKey>(() => (account.setup ? 'sicherheit' : tabFromHash(tabsFor(boot.account))));
  const [direction, setDirection] = useState(0);
  const setup = account.setup;

  const reload = useCallback(async () => {
    try {
      setAccount(await fetchAccount());
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  }, [toast]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash(tabsFor(boot.account)));
    window.addEventListener('hashchange', onHash);
    const params = new URLSearchParams(window.location.search);
    const emailNotice = EMAIL_NOTICES[params.get('email') || ''];
    if (emailNotice) {
      toast(emailNotice.text(), { variant: emailNotice.variant, duration: 6000 });
      params.delete('email');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    }
    const notice = OAUTH_MESSAGES[params.get('oauth') || ''];
    if (notice) {
      const provider = params.get('provider') || '';
      const known = boot.account.security.providers.find((candidate) => candidate.key === provider);
      toast(notice.text(providerLabel(provider, known?.label)), { variant: notice.variant });
      params.delete('oauth');
      params.delete('provider');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, [toast, boot.account]);

  const select = (next: TabKey) => {
    setDirection(TABS.indexOf(next) > TABS.indexOf(tab) ? 1 : -1);
    setTab(next);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${next}`);
  };

  const { user, limits, security } = account;

  return (
    <SudoProvider
      methods={{
        password: user.hasPassword,
        totp: security.totp,
        passkey: security.passkeysEnabled && security.passkeys.length > 0,
        providers: security.identities.filter((identity) => identity.enabled).map(({ provider, label }) => ({ key: provider, label })),
        passkeyOrigin: security.passkeyOrigin,
      }}
    >
      <AppShell
        site={boot.site}
        user={boot.user}
        active="account"
        topBar={
          <Typography variant="h5" component="h1" sx={{ pl: { xs: 1, md: 0 } }}>
            {t('Konto')}
          </Typography>
        }
        accountSummary={storageSummary(boot.userStats)}
      >
        <Box sx={{ maxWidth: 960 }}>
          {setup && (
            <m.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: ease.emphasizedDecelerate }}
            >
              <Alert severity="warning" sx={{ mb: 3 }}>
                {setup === 'password'
                  ? t('Lege zuerst ein eigenes Passwort fest. Danach geht es direkt weiter.')
                  : t('Auf diesem Server ist die Zwei-Faktor-Anmeldung Pflicht. Richte sie ein, danach geht es direkt weiter.')}
              </Alert>
            </m.div>
          )}

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: { xs: 2, sm: 3 },
              p: { xs: 2.5, md: 3 },
              mt: 1,
              borderRadius: `${radius.lg}px`,
              bgcolor: c.surfaceContainerLow,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
              <UserAvatar name={user.username} size={64} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h4" component="h2" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {user.username}
                  <Chip
                    size="small"
                    label={user.isAdmin ? t('Admin') : t('Mitglied')}
                    sx={
                      user.isAdmin
                        ? { bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, fontWeight: 700 }
                        : { border: `1px solid ${c.outlineVariant}`, bgcolor: 'transparent' }
                    }
                  />
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {user.createdAt
                    ? t('Dabei seit {date}', { date: formatDate(new Date(user.createdAt)) })
                    : t('Dabei seit der ersten Version')}
                  {user.lastLoginAt ? t(', zuletzt angemeldet {lastLoginAt}', { lastLoginAt: relativeMs(user.lastLoginAt) }) : ''}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 260 } }}>
              <QuotaMeter usedBytes={limits.usedBytes} quotaBytes={limits.quotaBytes} compact />
            </Box>
          </Box>

          <Box sx={{ mt: 3, mb: 3, borderBottom: `1px solid ${c.outlineVariant}` }}>
            <ScrollTabs value={tab} onChange={select} label={t('Bereiche')}>
              {TABS.map((key) => (
                <Tab
                  key={key}
                  value={key}
                  id={`tab-${key}`}
                  aria-controls={`panel-${key}`}
                  disabled={!!setup && key !== 'sicherheit'}
                  label={key === 'geraete' ? `${LABELS[key]} (${account.sessions.length})` : LABELS[key]}
                />
              ))}
            </ScrollTabs>
          </Box>

          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div
              key={tab}
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
              initial={{ opacity: 0, x: direction * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -28, transition: { duration: 0.14, ease: ease.emphasizedAccelerate } }}
              transition={{ duration: 0.32, ease: ease.emphasizedDecelerate }}
            >
              {tab === 'sicherheit' && (
                <SecurityPanel
                  account={account}
                  siteTitle={boot.site.title}
                  minPasswordLength={account.policy.passwordMinLength}
                  reload={reload}
                  autoOpen={setup}
                />
              )}
              {tab === 'einstellungen' && (
                <PreferencesPanel account={account} onSaved={(preferences) => setAccount((current) => ({ ...current, preferences }))} />
              )}
              {tab === 'domains' && (
                <DomainsPanel
                  initial={account.domains}
                  preferences={account.preferences}
                  onPreferences={(preferences) => setAccount((current) => ({ ...current, preferences }))}
                />
              )}
              {tab === 'geraete' && <SessionsPanel sessions={account.sessions} reload={reload} />}
              {tab === 'sharex' && (
                <ApiPanel
                  tokens={account.tokens}
                  reload={reload}
                  siteTitle={boot.site.title}
                  baseUrl={boot.site.baseUrl}
                  features={{ texts: account.choices.texts, links: account.choices.links }}
                />
              )}
              {tab === 'konto' && <ProfilePanel account={account} />}
            </m.div>
          </AnimatePresence>
        </Box>
      </AppShell>
    </SudoProvider>
  );
}

export function AccountPage() {
  const boot = readBoot<AccountBoot>();
  return (
    <ConfirmProvider>
      <Account boot={boot} />
    </ConfirmProvider>
  );
}
