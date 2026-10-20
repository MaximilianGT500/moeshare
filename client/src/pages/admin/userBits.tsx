import type { ReactNode } from 'react';
import { providerIcon, providerLabel } from '../../lib/providers';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import type { AdminUser } from '../../lib/types';
import { c } from '../../theme/tokens';

export function RoleChip({ role }: { role: string }) {
  const admin = role === 'admin';
  return (
    <Chip
      size="small"
      label={admin ? 'Admin' : 'Mitglied'}
      sx={{
        fontWeight: 700,
        bgcolor: admin ? c.tertiaryContainer : 'transparent',
        color: admin ? c.onTertiaryContainer : c.onSurfaceVariant,
        border: admin ? 'none' : `1px solid ${c.outlineVariant}`,
      }}
    />
  );
}

export function StatusChip({ user }: { user: Pick<AdminUser, 'status' | 'mustChangePassword'> }) {
  if (user.status === 'suspended') {
    return <Chip size="small" label="Gesperrt" sx={{ bgcolor: c.errorContainer, color: c.onErrorContainer, fontWeight: 700 }} />;
  }
  if (user.mustChangePassword) {
    return <Chip size="small" label="Wartet auf Passwort" sx={{ bgcolor: c.warningContainer, color: c.onWarningContainer }} />;
  }
  return (
    <Chip size="small" label="Aktiv" sx={{ bgcolor: 'transparent', color: c.onSurfaceVariant, border: `1px solid ${c.outlineVariant}` }} />
  );
}

export function SecurityBadges({ user }: { user: Pick<AdminUser, 'totp' | 'passkeys' | 'identities'> }) {
  const items = [
    user.totp && { key: 'totp', title: 'Zwei-Faktor-Anmeldung aktiv', icon: <PhonelinkLockRounded /> },
    user.passkeys > 0 && {
      key: 'pk',
      title: user.passkeys === 1 ? 'Ein Passkey' : `${user.passkeys} Passkeys`,
      icon: <FingerprintRounded />,
    },
    ...(user.identities || []).map((identity) => ({
      key: `id-${identity.provider}`,
      title: `${providerLabel(identity.provider)}: ${identity.name}`,
      icon: providerIcon(identity.provider),
    })),
  ].filter(Boolean) as Array<{ key: string; title: string; icon: ReactNode }>;
  if (!items.length) return null;
  return (
    <Box sx={{ display: 'inline-flex', gap: 0.5, color: c.onSurfaceVariant, '& svg': { fontSize: 16 } }}>
      {items.map((item) => (
        <Tooltip key={item.key} title={item.title}>
          <Box component="span" sx={{ display: 'inline-flex' }} aria-label={item.title} role="img">
            {item.icon}
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}
