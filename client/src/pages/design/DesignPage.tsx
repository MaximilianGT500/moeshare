import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import { readBoot } from '../../lib/boot';
import type { DesignBoot } from '../../lib/types';
import { storageSummary } from '../../lib/format';
import { AppShell } from '../../components/AppShell';
import { ConfirmProvider } from '../../components/ConfirmDialog';
import { ScrollTabs } from '../../components/ScrollTabs';
import { SudoProvider } from '../../components/Sudo';
import { EmbedPanel } from '../embed/EmbedPanel';
import { ProfileEditor } from './ProfileEditor';
import { ViewDesigner } from './ViewDesigner';
import { WatermarkEditor } from './WatermarkEditor';
import { c, ease } from '../../theme/tokens';
import { t } from '../../lib/i18n';

type TabKey = 'vorschauseite' | 'profil' | 'embed' | 'wasserzeichen';

function tabsFor(boot: DesignBoot): TabKey[] {
  const tabs: TabKey[] = [];
  if (boot.user.isAdmin || boot.view.allowCustom) tabs.push('vorschauseite');
  if (boot.profile.available) tabs.push('profil');
  if (boot.user.canCustomizeEmbed) tabs.push('embed');
  if (boot.watermark?.allowed) tabs.push('wasserzeichen');
  return tabs.length ? tabs : ['vorschauseite'];
}

function Design({ boot }: { boot: DesignBoot }) {
  const tabs = tabsFor(boot);
  const fromHash = () => {
    const hash = window.location.hash.replace('#', '') as TabKey;
    return tabs.includes(hash) ? hash : tabs[0];
  };
  const [tab, setTab] = useState<TabKey>(fromHash);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (next: TabKey) => {
    setDirection(tabs.indexOf(next) > tabs.indexOf(tab) ? 1 : -1);
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  const labels: Record<TabKey, string> = {
    vorschauseite: t('Vorschauseite'),
    profil: t('Profilseite'),
    embed: t('Embed'),
    wasserzeichen: t('Wasserzeichen'),
  };

  return (
    <AppShell
      site={boot.site}
      user={boot.user}
      active="design"
      topBar={
        <Typography variant="h5" component="h1" sx={{ pl: { xs: 1, md: 0 } }}>
          {t('Gestalten')}
        </Typography>
      }
      accountSummary={storageSummary(boot.userStats)}
    >
      {tabs.length > 1 && (
        <Box sx={{ mt: 1, mb: 3, borderBottom: `1px solid ${c.outlineVariant}` }}>
          <ScrollTabs value={tab} onChange={select} label={t('Bereiche')}>
            {tabs.map((key) => (
              <Tab key={key} value={key} label={labels[key]} id={`tab-${key}`} aria-controls={`panel-${key}`} />
            ))}
          </ScrollTabs>
        </Box>
      )}
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
          {tab === 'vorschauseite' && <ViewDesigner user={boot.user} data={boot.view} />}
          {tab === 'profil' && <ProfileEditor user={boot.user} initial={boot.profile} />}
          {tab === 'embed' && <EmbedPanel site={boot.site} user={boot.user} data={boot.embed} />}
          {tab === 'wasserzeichen' && <WatermarkEditor initial={boot.watermark} />}
        </m.div>
      </AnimatePresence>
    </AppShell>
  );
}

export function DesignPage() {
  const boot = readBoot<DesignBoot>();
  return (
    <ConfirmProvider>
      <SudoProvider methods={boot.sudo}>
        <Design boot={boot} />
      </SudoProvider>
    </ConfirmProvider>
  );
}
