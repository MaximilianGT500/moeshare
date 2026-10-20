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
import { c, ease, radius } from '../../theme/tokens';

type TabKey = 'sicherheit' | 'geraete' | 'sharex' | 'konto';
const TABS: TabKey[] = ['sicherheit', 'geraete', 'sharex', 'konto'];
const LABELS: Record<TabKey, string> = { sicherheit: 'Sicherheit', geraete: 'Geräte', sharex: 'ShareX und API', konto: 'Konto' };

const tabFromHash = (): TabKey => {
  const hash = window.location.hash.replace('#', '') as TabKey;
  return TABS.includes(hash) ? hash : 'sicherheit';
};

const OAUTH_MESSAGES: Record<string, { text: (label: string) => string; variant: 'success' | 'error' }> = {
  linked: { text: (label) => `${label} ist jetzt verknüpft`, variant: 'success' },
  taken: { text: (label) => `Dieses ${label}-Konto ist schon mit einem anderen Benutzer verknüpft.`, variant: 'error' },
  mismatch: { text: (label) => `Das war ein anderes ${label}-Konto als das verknüpfte.`, variant: 'error' },
  disabled: { text: (label) => `Die Anmeldung mit ${label} ist auf diesem Server nicht aktiviert.`, variant: 'error' },
  failed: { text: (label) => `${label} ist gerade nicht erreichbar. Versuche es später erneut.`, variant: 'error' },
};

function Account({ boot }: { boot: AccountBoot }) {
  const toast = useToast();
  const [account, setAccount] = useState<AccountOverview>(boot.account);
  const [tab, setTab] = useState<TabKey>(account.setup ? 'sicherheit' : tabFromHash);
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
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    const params = new URLSearchParams(window.location.search);
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
  }, [toast, boot.account.security.providers]);

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
            Konto
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
                  ? 'Lege zuerst ein eigenes Passwort fest. Danach geht es direkt weiter.'
                  : 'Auf diesem Server ist die Zwei-Faktor-Anmeldung Pflicht. Richte sie ein, danach geht es direkt weiter.'}
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
                    label={user.isAdmin ? 'Admin' : 'Mitglied'}
                    sx={
                      user.isAdmin
                        ? { bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, fontWeight: 700 }
                        : { border: `1px solid ${c.outlineVariant}`, bgcolor: 'transparent' }
                    }
                  />
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {user.createdAt ? `Dabei seit ${formatDate(new Date(user.createdAt))}` : 'Dabei seit der ersten Version'}
                  {user.lastLoginAt ? `, zuletzt angemeldet ${relativeMs(user.lastLoginAt)}` : ''}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 260 } }}>
              <QuotaMeter usedBytes={limits.usedBytes} quotaBytes={limits.quotaBytes} compact />
            </Box>
          </Box>

          <Box sx={{ mt: 3, mb: 3, borderBottom: `1px solid ${c.outlineVariant}` }}>
            <ScrollTabs value={tab} onChange={select} label="Bereiche">
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
              {tab === 'geraete' && <SessionsPanel sessions={account.sessions} reload={reload} />}
              {tab === 'sharex' && (
                <ApiPanel tokens={account.tokens} reload={reload} siteTitle={boot.site.title} baseUrl={boot.site.baseUrl} />
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
