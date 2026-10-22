import type { ReactNode } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined';
import EditRounded from '@mui/icons-material/EditRounded';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import UpdateRounded from '@mui/icons-material/UpdateRounded';
import { readBoot } from '../../lib/boot';
import type { AlbumBoot, AlbumItem } from '../../lib/types';
import { formatBytes, formatDateTime, relativeMs } from '../../lib/format';
import { meaningfulColor } from '../../lib/color';
import { accentOf, useDesign, withDefaults } from '../../lib/design';
import { t, tn } from '../../lib/i18n';
import { CopyTextButton } from '../../components/CopyButton';
import { LockedScreen } from '../../components/LockedScreen';
import { OwnerPage } from '../../components/OwnerPage';
import { PublicGallery } from '../../components/PublicGallery';
import { UserAvatar } from '../../components/UserAvatar';
import { ease, radius } from '../../theme/tokens';

type AlbumData = NonNullable<AlbumBoot['album']>;

export function AlbumPage() {
  const boot = readBoot<AlbumBoot>();
  if (boot.locked || !boot.album) {
    return <LockedScreen site={boot.site} locked={boot.locked ?? { kind: 'album', state: 'locked', slug: '', password: true }} />;
  }
  const items = boot.items || [];
  const design = withDefaults(boot.design);
  const cover = items.find((item) => item.type === 'image' && item.preview)?.preview ?? null;
  const accent = accentOf(design, meaningfulColor(items.find((item) => item.color)?.color), boot.site.seedColor);
  return (
    <OwnerPage site={boot.site} design={design} css={boot.css} accent={accent} cover={cover} page="album" report={boot.report}>
      <AlbumView album={boot.album} items={items} owner={!!boot.owner} />
    </OwnerPage>
  );
}

function Meta({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <Box
      component="li"
      title={title}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', '& svg': { fontSize: 18 } }}
    >
      {icon}
      <Typography variant="body2" component="span" sx={{ color: 'text.primary' }}>
        {children}
      </Typography>
    </Box>
  );
}

function AlbumView({ album, items, owner }: { album: AlbumData; items: AlbumItem[]; owner: boolean }) {
  const { shows, r } = useDesign();
  const totalBytes = items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
  const link = album.url || `${window.location.origin}${window.location.pathname}`;

  return (
    <>
      <m.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: ease.emphasizedDecelerate }}
        style={{ padding: '24px 0 28px' }}
      >
        {shows('title') && (
          <Typography
            variant="h3"
            component="h1"
            className="ms-title"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.02em',
              fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem' },
              lineHeight: 1.08,
              maxWidth: '22ch',
            }}
          >
            {album.title}
          </Typography>
        )}
        {album.description && (
          <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1.5, maxWidth: '68ch', whiteSpace: 'pre-line' }}>
            {album.description}
          </Typography>
        )}
        <Box
          component="ul"
          className="ms-meta"
          sx={{ listStyle: 'none', p: 0, m: 0, mt: 2.5, display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 1.25 }}
        >
          {album.owner && shows('owner') && (
            <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <UserAvatar name={album.owner} size={24} />
              <Typography variant="body2">{album.owner}</Typography>
            </Box>
          )}
          <Meta icon={<CollectionsOutlined />}>
            {tn(items.length, '1 Datei', '{count} Dateien')}
            {totalBytes > 0 && shows('size') ? `, ${formatBytes(totalBytes)}` : ''}
          </Meta>
          {shows('date') && (
            <Meta icon={<UpdateRounded />} title={formatDateTime(new Date(album.updatedAt))}>
              {t('aktualisiert {when}', { when: relativeMs(album.updatedAt) })}
            </Meta>
          )}
        </Box>
        <Box className="ms-actions" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2.5 }}>
          {shows('copy') && (
            <CopyTextButton value={link} variant="contained" message={t('Link kopiert')} sx={{ borderRadius: `${r(radius.full)}px` }}>
              {t('Link kopieren')}
            </CopyTextButton>
          )}
          {album.zip && shows('download') && (
            <Button
              variant="tonal"
              startIcon={<FolderZipOutlined />}
              href={`/a/${encodeURIComponent(album.code)}/zip`}
              sx={{ borderRadius: `${r(radius.full)}px` }}
            >
              {t('Alle als ZIP')}
            </Button>
          )}
          {owner && (
            <Button variant="outlined" startIcon={<EditRounded />} href="/dashboard#alben" sx={{ borderRadius: `${r(radius.full)}px` }}>
              {t('Im Dashboard bearbeiten')}
            </Button>
          )}
        </Box>
      </m.section>

      <PublicGallery items={items} />

      {!items.length && (
        <Box sx={{ textAlign: 'center', py: 10, color: 'text.secondary' }}>
          <CollectionsOutlined sx={{ fontSize: 48, opacity: 0.6 }} />
          <Typography variant="h6" sx={{ mt: 1.5, color: 'text.primary' }}>
            {t('Dieses Album ist noch leer.')}
          </Typography>
          {owner && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {t('Füge im Dashboard Dateien hinzu, dann erscheinen sie hier.')}
            </Typography>
          )}
        </Box>
      )}
    </>
  );
}
