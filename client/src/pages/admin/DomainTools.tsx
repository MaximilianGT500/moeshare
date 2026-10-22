import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { UserDomain } from '../../lib/types';
import { errorMessage, fetchAdminDomains, revokeDomain } from '../../lib/api';
import { relativeMs } from '../../lib/format';
import { t } from '../../lib/i18n';
import { CopyIconButton } from '../../components/CopyButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { c, fonts, radius } from '../../theme/tokens';

export function CaddyHint({ upstream }: { upstream: string }) {
  const snippet = `{\n  on_demand_tls {\n    ask http://${upstream}/api/domains/tls\n  }\n}\n\nhttps:// {\n  tls {\n    on_demand\n  }\n  reverse_proxy ${upstream}\n}`;
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.25, maxWidth: 680 }}>
        {t(
          'Für eigene Domains braucht der Reverse-Proxy Zertifikate auf Abruf. Mit Caddy reicht dieser Block. Caddy fragt MoeShare vor jedem Zertifikat, ob die Domain bestätigt ist.'
        )}
      </Typography>
      <Box sx={{ position: 'relative', borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHighest }}>
        <Box component="pre" sx={{ m: 0, p: 2, pr: 6, fontFamily: fonts.mono, fontSize: '0.8125rem', overflowX: 'auto' }}>
          {snippet}
        </Box>
        <Box sx={{ position: 'absolute', top: 6, right: 6 }}>
          <CopyIconButton value={snippet} size="small" label={t('Caddy-Block kopieren')} icon={<ContentCopyRounded fontSize="inherit" />} />
        </Box>
      </Box>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
        {t('Die Caddyfile aus dem Docker-Stack bringt diesen Block schon mit, dort heißt das Ziel moeshare:3000 statt {upstream}.', {
          upstream,
        })}
      </Typography>
    </Box>
  );
}

export function DomainList() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<UserDomain[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    fetchAdminDomains()
      .then((result) => setItems(result.domains))
      .catch((failure) => {
        setItems([]);
        toast(errorMessage(failure), { variant: 'error' });
      });
  }, [toast]);

  const revoke = async (item: UserDomain) => {
    const ok = await confirm({
      title: t('Domain entfernen?'),
      message: t('{domain} gehört dann nicht mehr zu {user}. Links über diese Domain funktionieren nicht mehr.', {
        domain: item.domain,
        user: item.username || t('einem gelöschten Konto'),
      }),
      confirmLabel: t('Entfernen'),
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      const result = await revokeDomain(item.id);
      setItems(result.domains);
      toast(t('Domain entfernt'), { variant: 'success' });
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (!items) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>
        <Skeleton variant="rounded" height={56} />
      </Box>
    );
  }

  if (!items.length) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', px: { xs: 2, sm: 3 }, py: 2.25 }}>
        {t('Noch hat niemand eine eigene Domain verbunden.')}
      </Typography>
    );
  }

  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: { xs: 2, sm: 3 },
            py: 1.5,
            flexWrap: 'wrap',
            '& + li': { borderTop: `1px solid ${c.outlineVariant}` },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontWeight: 600, wordBreak: 'break-all' }}>
              {item.domain}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {item.username || t('Gelöschtes Konto')}
              {', '}
              {item.status === 'verified'
                ? t('bestätigt {when}', { when: relativeMs(item.verifiedAt) })
                : t('hinzugefügt {when}', { when: relativeMs(item.createdAt) })}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={item.status === 'verified' ? t('Verbunden') : t('Wartet')}
            sx={item.status === 'verified' ? { bgcolor: c.primaryContainer, color: c.onPrimaryContainer } : undefined}
          />
          <Button size="small" color="error" onClick={() => revoke(item)} disabled={busy === item.id}>
            {t('Entfernen')}
          </Button>
        </Box>
      ))}
    </Box>
  );
}
