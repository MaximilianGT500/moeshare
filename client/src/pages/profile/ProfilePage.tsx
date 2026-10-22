import { useState } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import LockRounded from '@mui/icons-material/LockRounded';
import PhotoLibraryOutlined from '@mui/icons-material/PhotoLibraryOutlined';
import { readBoot } from '../../lib/boot';
import type { AlbumItem, ProfileBoot, PublicAlbum } from '../../lib/types';
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
          <UserAvatar name={profile.username} size={96} />
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
        <Box className="ms-actions" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3 }}>
          {profile.links.map((link) => (
            <Button
              key={`${link.label}-${link.url}`}
              variant="tonal"
              href={link.url}
              target="_blank"
              rel="noopener me"
              endIcon={<ArrowOutwardRounded />}
              sx={{ borderRadius: `${r(radius.full)}px` }}
            >
              {link.label}
            </Button>
          ))}
          <CopyTextButton value={profile.url} variant="outlined" message={t('Link kopiert')} sx={{ borderRadius: `${r(radius.full)}px` }}>
            {t('Profil-Link kopieren')}
          </CopyTextButton>
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
