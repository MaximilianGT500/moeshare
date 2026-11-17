import { useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RssFeedRounded from '@mui/icons-material/RssFeedRounded';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import LockRounded from '@mui/icons-material/LockRounded';
import PhotoLibraryOutlined from '@mui/icons-material/PhotoLibraryOutlined';
import { readBoot } from '../../lib/boot';
import type { AlbumItem, ProfileBoot, PublicAlbum, PublicProfileLink } from '../../lib/types';
import { LinkIcon } from '../../lib/linkIcons';
import { accentOf, useDesign, withDefaults } from '../../lib/design';
import { errorMessage, fetchProfileFiles } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { mix } from '../../lib/color';
import { t, tn } from '../../lib/i18n';
import { CopyTextButton } from '../../components/CopyButton';
import { OwnerPage } from '../../components/OwnerPage';
import { PublicGallery } from '../../components/PublicGallery';
import { UserAvatar } from '../../components/UserAvatar';
import { useToast } from '../../components/Toaster';
import { c, ease, elevation, radius } from '../../theme/tokens';

export function ProfilePage() {
  const boot = readBoot<ProfileBoot>();
  const design = withDefaults(boot.design);
  const items = boot.files?.items || [];
  const cover =
    items.find((item) => item.type === 'image' && item.preview)?.preview ??
    boot.albums.find((album) => album.cover?.url)?.cover?.url ??
    null;
  const accent = accentOf(design, items.find((item) => item.color && item.color !== '#ffffff')?.color ?? null, boot.site.seedColor);
  return (
    <OwnerPage site={boot.site} design={design} css={boot.css} accent={accent} cover={cover} page="profile" report={boot.report}>
      <Profile boot={boot} />
    </OwnerPage>
  );
}

function AlbumCard({ album, index }: { album: PublicAlbum; index: number }) {
  const { r } = useDesign();
  return (
    <m.a
      href={album.url}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 12) * 0.04, ease: ease.emphasizedDecelerate }}
      style={{ display: 'block', color: 'inherit', textDecoration: 'none', minWidth: 0 }}
    >
      <Box
        sx={{
          position: 'relative',
          aspectRatio: '4 / 3',
          borderRadius: `${r(radius.lg)}px`,
          overflow: 'hidden',
          bgcolor: album.cover?.color ? mix(album.cover.color, 40) : c.surfaceContainerHigh,
          transition: 'transform 220ms cubic-bezier(0.2, 0, 0, 1), box-shadow 220ms',
          'a:hover > &': { transform: 'translateY(-3px)', boxShadow: elevation[3] },
          'a:focus-visible > &': { outline: `3px solid ${c.primary}`, outlineOffset: 2 },
        }}
      >
        {album.cover?.url && !album.locked ? (
          <img
            src={album.cover.url}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: c.onSurfaceVariant,
              '& svg': { fontSize: 40 },
            }}
          >
            {album.locked ? <LockRounded /> : <CollectionsOutlined />}
          </Box>
        )}
      </Box>
      <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700, mt: 1.25 }}>
        {album.title}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {album.locked ? t('Mit Passwort geschützt') : tn(album.files, '1 Datei', '{count} Dateien')}
      </Typography>
    </m.a>
  );
}

type LinkItem = Extract<PublicProfileLink, { type: 'link' }>;

interface LinkSection {
  id: number;
  heading: string | null;
  items: LinkItem[];
}

function sectionsOf(links: PublicProfileLink[]) {
  const sections: LinkSection[] = [];
  for (const link of links) {
    if (link.type === 'heading') {
      sections.push({ id: link.id, heading: link.label, items: [] });
      continue;
    }
    if (link.style !== 'button') continue;
    if (!sections.length) sections.push({ id: 0, heading: null, items: [] });
    sections[sections.length - 1].items.push(link);
  }
  return sections.filter((section) => section.items.length);
}

function track(username: string, id: number) {
  const url = `/u/${encodeURIComponent(username)}/links/${id}/click`;
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
  } catch {}
  void fetch(url, { method: 'POST', keepalive: true, credentials: 'same-origin' }).catch(() => {});
}

function linkProps(username: string, link: LinkItem) {
  const web = /^https?:/i.test(link.url);
  return {
    href: link.url,
    ...(web ? { target: '_blank', rel: 'noopener me' } : {}),
    onClick: () => track(username, link.id),
    onAuxClick: (event: { button: number }) => event.button === 1 && track(username, link.id),
  };
}

function IconRow({ username, links }: { username: string; links: LinkItem[] }) {
  return (
    <Box component="nav" aria-label={t('Kanäle')} className="ms-link-icons" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3 }}>
      {links.map((link) => (
        <Tooltip key={link.id} title={link.label}>
          <IconButton
            component="a"
            {...linkProps(username, link)}
            aria-label={link.label}
            className="ms-link-icon"
            sx={{
              width: 48,
              height: 48,
              bgcolor: link.highlight ? c.primary : mix(c.secondaryContainer, 88),
              color: link.highlight ? c.onPrimary : c.onSecondaryContainer,
              transition: 'transform 160ms cubic-bezier(0.2, 0, 0, 1), background-color 160ms',
              '&:hover': { bgcolor: c.secondaryContainer, transform: 'translateY(-2px)' },
            }}
          >
            <LinkIcon icon={link.icon ?? 'auto'} url={link.url} iconUrl={link.iconUrl} size={24} />
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
}

function LinkList({ username, sections, layout }: { username: string; sections: LinkSection[]; layout: 'row' | 'list' }) {
  const { r } = useDesign();
  const list = layout === 'list';
  return (
    <Box className={`ms-links ms-links-${layout}`} sx={{ display: 'grid', gap: 2.5, mt: 3, maxWidth: list ? 600 : 'none' }}>
      {sections.map((section) => (
        <Box key={section.id} component="section" aria-label={section.heading || undefined}>
          {section.heading && (
            <Typography
              variant="subtitle1"
              component="h2"
              className="ms-link-heading"
              sx={{ fontWeight: 700, mb: 1.25, color: 'text.secondary', textAlign: 'left' }}
            >
              {section.heading}
            </Typography>
          )}
          <Box sx={list ? { display: 'grid', gap: 1.25 } : { display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {section.items.map((link) => {
              const icon = link.icon ? <LinkIcon icon={link.icon} url={link.url} iconUrl={link.iconUrl} size={list ? 24 : 20} /> : null;
              return (
                <Button
                  key={link.id}
                  {...linkProps(username, link)}
                  className={link.highlight ? 'ms-link ms-link-highlight' : 'ms-link'}
                  variant={link.highlight ? 'contained' : 'tonal'}
                  size={list ? 'large' : 'medium'}
                  startIcon={!list ? icon : undefined}
                  endIcon={!list && !icon ? <ArrowOutwardRounded /> : undefined}
                  sx={
                    list
                      ? {
                          position: 'relative',
                          minHeight: 58,
                          px: 7,
                          borderRadius: `${r(radius.lg)}px`,
                          fontSize: '1rem',
                          fontWeight: 700,
                          textAlign: 'center',
                          overflowWrap: 'anywhere',
                          transition: 'transform 160ms cubic-bezier(0.2, 0, 0, 1)',
                          '&:hover': { transform: 'translateY(-2px)' },
                        }
                      : { borderRadius: `${r(radius.full)}px` }
                  }
                >
                  {list && icon && (
                    <Box
                      component="span"
                      sx={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}
                    >
                      {icon}
                    </Box>
                  )}
                  {link.label}
                </Button>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Profile({ boot }: { boot: ProfileBoot }) {
  const toast = useToast();
  const { r } = useDesign();
  const { profile, albums } = boot;
  const [items, setItems] = useState<AlbumItem[]>(boot.files?.items || []);
  const [page, setPage] = useState(boot.files?.page || 1);
  const [hasNext, setHasNext] = useState(!!boot.files?.hasNext);
  const [busy, setBusy] = useState(false);

  const more = async () => {
    setBusy(true);
    try {
      const next = await fetchProfileFiles(profile.username, page + 1);
      setItems((current) => [...current, ...next.items.filter((item) => !current.some((known) => known.id === item.id))]);
      setPage(next.page);
      setHasNext(next.hasNext);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const empty = !albums.length && !items.length;
  const iconLinks = profile.links.filter((link): link is LinkItem => link.type === 'link' && link.style === 'icon');
  const sections = sectionsOf(profile.links);

  return (
    <>
      <m.section
        className="ms-profile-head"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: ease.emphasizedDecelerate }}
        style={{ padding: '32px 0 36px' }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: { xs: 2, sm: 3 },
          }}
        >
          <UserAvatar name={profile.username} src={profile.avatar} size={96} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h1"
              className="ms-title"
              sx={{
                fontSize: { xs: '2.1rem', sm: '2.75rem', md: '3.25rem' },
                fontWeight: 800,
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
                overflowWrap: 'anywhere',
              }}
            >
              {profile.name}
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', mt: 0.75 }}>
              {profile.name !== profile.username ? `@${profile.username}` : ''}
              {profile.name !== profile.username && profile.since ? ', ' : ''}
              {profile.since ? t('dabei seit {date}', { date: formatDate(new Date(profile.since)) }) : ''}
            </Typography>
          </Box>
        </Box>
        {profile.bio && (
          <Typography
            variant="body1"
            sx={{ mt: 3, maxWidth: '62ch', whiteSpace: 'pre-line', fontSize: { md: '1.075rem' }, lineHeight: 1.65 }}
          >
            {profile.bio}
          </Typography>
        )}
        {iconLinks.length > 0 && <IconRow username={profile.username} links={iconLinks} />}
        {sections.length > 0 && <LinkList username={profile.username} sections={sections} layout={profile.linkLayout} />}
        <Box className="ms-actions" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3 }}>
          {profile.contactCard && (
            <Button
              variant="outlined"
              href={profile.contactCard}
              download
              startIcon={<PersonAddAlt1Rounded />}
              className="ms-contact"
              sx={{ borderRadius: `${r(radius.full)}px` }}
            >
              {t('Kontakt speichern')}
            </Button>
          )}
          <CopyTextButton value={profile.url} variant="outlined" message={t('Link kopiert')} sx={{ borderRadius: `${r(radius.full)}px` }}>
            {t('Profil-Link kopieren')}
          </CopyTextButton>
          {boot.feed && (
            <Tooltip title={t('RSS-Feed abonnieren')}>
              <IconButton component="a" href={boot.feed} aria-label={t('RSS-Feed')} sx={{ color: 'text.secondary' }}>
                <RssFeedRounded />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </m.section>

      {albums.length > 0 && (
        <Box component="section" aria-labelledby="profile-albums" sx={{ mb: 6 }}>
          <Typography id="profile-albums" variant="h5" component="h2" sx={{ mb: 2 }}>
            {t('Alben')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
              gap: { xs: 2, md: 3 },
            }}
          >
            {albums.map((album, index) => (
              <AlbumCard key={album.code} album={album} index={index} />
            ))}
          </Box>
        </Box>
      )}

      {items.length > 0 && (
        <Box component="section" aria-labelledby="profile-files">
          <Typography id="profile-files" variant="h5" component="h2" sx={{ mb: 2 }}>
            {t('Dateien')}
          </Typography>
          <PublicGallery items={items} />
          {hasNext && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Button
                variant="tonal"
                onClick={more}
                disabled={busy}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {t('Mehr laden')}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {empty && (
        <Box sx={{ textAlign: 'center', py: 10, color: 'text.secondary' }}>
          <PhotoLibraryOutlined sx={{ fontSize: 48, opacity: 0.6 }} />
          <Typography variant="h6" sx={{ mt: 1.5, color: 'text.primary' }}>
            {t('Hier ist noch nichts zu sehen.')}
          </Typography>
          {boot.owner && (
            <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 420, mx: 'auto' }}>
              {t('Markiere im Dashboard Dateien mit „Im Profil zeigen“ oder stelle ein Album auf „Öffentlich“.')}
            </Typography>
          )}
        </Box>
      )}
    </>
  );
}
