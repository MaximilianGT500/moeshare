import { useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded';
import PhotoLibraryOutlined from '@mui/icons-material/PhotoLibraryOutlined';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import BrushRounded from '@mui/icons-material/BrushRounded';
import BrushOutlined from '@mui/icons-material/BrushOutlined';
import AccountCircleRounded from '@mui/icons-material/AccountCircleRounded';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import ManageAccountsRounded from '@mui/icons-material/ManageAccountsRounded';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';
import { ThemeModeSelector, ThemeToggleButton } from './ThemeToggle';
import { LanguageSelector } from './LanguageSwitch';
import { UserAvatar } from './UserAvatar';
import type { SessionUser, SiteInfo } from '../lib/types';
import { mix } from '../lib/color';
import { c, css, elevation, radius } from '../theme/tokens';
import { t } from '../lib/i18n';

export const RAIL_WIDTH = 88;

type Destination = 'dashboard' | 'design' | 'account' | 'admin';

interface NavItem {
  key: Destination;
  href: string;
  label: string;
  icon: ReactNode;
  activeIcon: ReactNode;
}

const navItems = (user: SessionUser): NavItem[] => [
  { key: 'dashboard', href: '/dashboard', label: t('Übersicht'), icon: <PhotoLibraryOutlined />, activeIcon: <PhotoLibraryRounded /> },
  ...(user.canDesign || user.canCustomizeEmbed
    ? [{ key: 'design' as const, href: '/design', label: t('Gestalten'), icon: <BrushOutlined />, activeIcon: <BrushRounded /> }]
    : []),
  { key: 'account', href: '/account', label: t('Konto'), icon: <AccountCircleOutlined />, activeIcon: <AccountCircleRounded /> },
  ...(user.isAdmin
    ? [
        {
          key: 'admin' as const,
          href: '/admin',
          label: t('Admin'),
          icon: <AdminPanelSettingsOutlined />,
          activeIcon: <AdminPanelSettingsRounded />,
        },
      ]
    : []),
];

function NavButton({ item, active, compact = false }: { item: NavItem; active: boolean; compact?: boolean }) {
  return (
    <ButtonBase
      component="a"
      href={item.href}
      aria-current={active ? 'page' : undefined}
      nativeButton={false}
      sx={{
        flexDirection: 'column',
        gap: 0.5,
        width: compact ? 'auto' : 72,
        flex: compact ? 1 : 'none',
        py: compact ? 1.5 : 0.5,
        borderRadius: `${radius.md}px`,
        color: active ? c.onSurface : c.onSurfaceVariant,
        '&:hover .nav-pill': {
          bgcolor: active ? `color-mix(in srgb, ${c.onSecondaryContainer} 8%, ${c.secondaryContainer})` : mix(c.onSurface, 8),
        },
        '& .MuiTouchRipple-root': { display: 'none' },
      }}
    >
      <Box
        className="nav-pill"
        sx={{
          width: 56,
          height: 32,
          borderRadius: `${radius.full}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: active ? c.secondaryContainer : 'transparent',
          color: active ? c.onSecondaryContainer : 'inherit',
          transition: `background-color 200ms ${css.standard}`,
          '& svg': { fontSize: 24 },
        }}
      >
        {active ? item.activeIcon : item.icon}
      </Box>
      <Typography variant="caption" sx={{ fontWeight: active ? 700 : 500, letterSpacing: '0.01em' }}>
        {item.label}
      </Typography>
    </ButtonBase>
  );
}

function AccountMenu({
  user,
  summary,
  anchor,
  onClose,
}: {
  user: SessionUser;
  summary?: string;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  return (
    <Menu
      anchorEl={anchor}
      open={!!anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 300 } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, pt: 1, pb: 1.5 }}>
        <UserAvatar name={user.username} size={44} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {user.username}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {user.isAdmin ? t('Administrator') : t('Mitglied')}
          </Typography>
        </Box>
      </Box>
      {summary && (
        <Typography variant="body2" sx={{ px: 1.5, pb: 1.5, color: 'text.secondary' }}>
          {summary}
        </Typography>
      )}
      <Divider sx={{ my: 0.5 }} />
      <Box sx={{ px: 1.5, py: 1.25 }}>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1 }}>
          {t('Darstellung')}
        </Typography>
        <ThemeModeSelector />
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5, mb: 1 }}>
          {t('Sprache')}
        </Typography>
        <LanguageSelector />
      </Box>
      <Divider sx={{ my: 0.5 }} />
      <MenuItem component="a" href="/account">
        <ListItemIcon>
          <ManageAccountsRounded />
        </ListItemIcon>
        {t('Konto und Sicherheit')}
      </MenuItem>
      <MenuItem component="a" href="/logout">
        <ListItemIcon>
          <LogoutRounded />
        </ListItemIcon>
        {t('Abmelden')}
      </MenuItem>
    </Menu>
  );
}

function AccountButton({ user, summary, size = 40 }: { user: SessionUser; summary?: string; size?: number }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={t('Konto')} placement="right">
        <IconButton
          aria-label={t('Konto von {username}', { username: user.username })}
          aria-haspopup="menu"
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ p: 0.5 }}
        >
          <UserAvatar name={user.username} size={size} />
        </IconButton>
      </Tooltip>
      <AccountMenu user={user} summary={summary} anchor={anchor} onClose={() => setAnchor(null)} />
    </>
  );
}

interface AppShellProps {
  site: SiteInfo;
  user: SessionUser;
  active: Destination;
  topBar: ReactNode;
  railAction?: ReactNode;
  mobileAction?: ReactNode;
  accountSummary?: string;
  contextual?: boolean;
  children: ReactNode;
}

export function AppShell({
  site,
  user,
  active,
  topBar,
  railAction,
  mobileAction,
  accountSummary,
  contextual = false,
  children,
}: AppShellProps) {
  const items = navItems(user);
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 4 });
  const bottomNav = items.length > 1;

  return (
    <Box sx={{ minHeight: '100dvh' }}>
      <Box
        component="nav"
        aria-label={t('Hauptnavigation')}
        sx={{
          position: 'fixed',
          insetBlock: 0,
          left: 0,
          width: RAIL_WIDTH,
          zIndex: 1200,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          pt: 2,
          pb: 2,
          bgcolor: c.surface,
        }}
      >
        <ButtonBase
          component="a"
          href="/dashboard"
          nativeButton={false}
          aria-label={t('{title} – Übersicht', { title: site.title })}
          sx={{ borderRadius: '50%', mb: 1.5 }}
        >
          <BrandMark src={site.favicon} title={site.title} size={44} />
        </ButtonBase>
        {railAction}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, mt: railAction ? 2.5 : 1 }}>
          {items.map((item) => (
            <NavButton key={item.key} item={item} active={item.key === active} />
          ))}
        </Box>
        <Box sx={{ flex: 1 }} />
        <ThemeToggleButton />
        <AccountButton user={user} summary={accountSummary} />
        <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.7, mt: 0.5, fontSize: '0.6875rem' }}>
          v{site.version}
        </Typography>
      </Box>

      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          ml: { md: `${RAIL_WIDTH}px` },
          height: { xs: 64, md: 76 },
          px: { xs: 1, sm: 2, md: 3 },
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: scrolled ? mix(c.surfaceContainer, 92) : c.surface,
          backdropFilter: scrolled ? 'blur(16px) saturate(1.3)' : 'none',
          boxShadow: scrolled ? elevation[1] : 'none',
          transition: `background-color 260ms ${css.standard}, box-shadow 260ms ${css.standard}`,
        }}
      >
        <Box sx={{ display: { xs: contextual ? 'none' : 'flex', md: 'none' }, alignItems: 'center', pl: 0.5 }}>
          <ButtonBase component="a" href="/dashboard" nativeButton={false} aria-label={site.title} sx={{ borderRadius: '50%' }}>
            <BrandMark src={site.favicon} title={site.title} size={36} />
          </ButtonBase>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>{topBar}</Box>
        <Box sx={{ display: { xs: contextual ? 'none' : 'flex', md: 'none' }, alignItems: 'center' }}>
          <AccountButton user={user} summary={accountSummary} size={34} />
        </Box>
      </Box>

      <Box
        component="main"
        sx={{
          ml: { md: `${RAIL_WIDTH}px` },
          px: { xs: 1.5, sm: 2, md: 3 },
          pb: { xs: bottomNav ? 22 : 14, md: 8 },
          minWidth: 0,
        }}
      >
        {children}
        <SiteFooter site={site} sx={{ mt: 8 }} />
      </Box>

      {mobileAction && !contextual && (
        <Box
          sx={{
            position: 'fixed',
            right: 16,
            bottom: `calc(${bottomNav ? 96 : 16}px + env(safe-area-inset-bottom))`,
            zIndex: 1150,
            display: { xs: 'block', md: 'none' },
          }}
        >
          {mobileAction}
        </Box>
      )}

      {bottomNav && (
        <Box
          component="nav"
          aria-label={t('Hauptnavigation')}
          sx={{
            position: 'fixed',
            insetInline: 0,
            bottom: 0,
            zIndex: 1200,
            display: { xs: 'flex', md: 'none' },
            bgcolor: c.surfaceContainer,
            pb: 'env(safe-area-inset-bottom)',
            px: 1,
          }}
        >
          {items.map((item) => (
            <NavButton key={item.key} item={item} active={item.key === active} compact />
          ))}
        </Box>
      )}
    </Box>
  );
}
