import { useState, type ComponentType } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { t, tn } from '../../lib/i18n';
import { useDesign } from '../../lib/design';
import { formatBytes, formatDate, formatNumber, parseServerDate, relativeFromServer } from '../../lib/format';
import { mix } from '../../lib/color';
import { typeDescription } from '../../components/FileIcons';
import {
  Actions,
  Backdrop,
  MediaStage,
  MetaList,
  NoteBlock,
  Notices,
  Owner,
  PageFooter,
  PageHeader,
  TitleBlock,
  type ViewModel,
} from './parts';
import { c, ease, elevation, radius } from '../../theme/tokens';

export interface LayoutProps {
  model: ViewModel;
  loaded: boolean;
  onLoaded: () => void;
  zooming: boolean;
  onZoom: (rect: DOMRect) => void;
}

const reveal = (loaded: boolean) => ({
  initial: { opacity: 0, scale: 0.97, y: 14, filter: 'blur(8px)' },
  animate: loaded ? { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' } : undefined,
  transition: { duration: 0.7, ease: ease.emphasizedDecelerate },
});

const page = { position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' } as const;

function StandardLayout({ model, loaded, onLoaded, zooming, onZoom }: LayoutProps) {
  const { r } = useDesign();
  return (
    <Box sx={page}>
      <Backdrop model={model} />
      <PageHeader model={model} />
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          maxWidth: 1240,
          mx: 'auto',
          px: { xs: 2, md: 3 },
          pt: { xs: 1, md: 2 },
          pb: 6,
        }}
      >
        <m.figure {...reveal(loaded)} style={{ margin: 0 }}>
          <MediaStage model={model} onLoaded={onLoaded} onZoom={onZoom} hidden={zooming} />
        </m.figure>
        <Notices model={model} sx={{ maxWidth: 720, mx: 'auto', mt: 2 }} />
        <m.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: ease.emphasizedDecelerate }}
          style={{ maxWidth: 860, margin: '0 auto' }}
        >
          <Box
            className="ms-info"
            sx={{
              mt: { xs: 2.5, md: 3.5 },
              p: { xs: 2, sm: 3 },
              borderRadius: `${r(radius.xl)}px`,
              bgcolor: mix(c.surfaceContainerLow, 82),
              backdropFilter: 'blur(24px) saturate(1.2)',
              border: `1px solid ${mix(c.outlineVariant, 55)}`,
              display: 'grid',
              gap: 2.5,
            }}
          >
            <TitleBlock model={model} />
            <Actions model={model} />
            <MetaList model={model} />
            <NoteBlock />
          </Box>
        </m.section>
      </Box>
      <PageFooter model={model} />
    </Box>
  );
}

function MinimalLayout({ model, loaded, onLoaded, zooming, onZoom }: LayoutProps) {
  const { shows } = useDesign();
  return (
    <Box sx={page}>
      <Backdrop model={model} />
      <PageHeader model={model} />
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          maxWidth: 1120,
          mx: 'auto',
          px: { xs: 2, md: 4 },
          pt: { xs: 2, md: 5 },
          pb: 6,
        }}
      >
        <m.figure {...reveal(loaded)} style={{ margin: 0 }}>
          <MediaStage
            model={model}
            fit="flat"
            maxHeight={{ xs: '62vh', md: 'calc(100dvh - 260px)' }}
            onLoaded={onLoaded}
            onZoom={onZoom}
            hidden={zooming}
          />
        </m.figure>
        <Notices model={model} sx={{ mt: 2 }} />
        <Box
          className="ms-info"
          sx={{
            mt: 3,
            pt: 2,
            borderTop: `1px solid ${c.outlineVariant}`,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.75 }}>
            {shows('title') && (
              <Typography component="h1" variant="subtitle1" noWrap className="ms-title" sx={{ fontWeight: 700 }} title={model.label}>
                {model.label}
              </Typography>
            )}
            <MetaList model={model} dense />
          </Box>
          <Actions model={model} style="compact" />
        </Box>
        <Box sx={{ mt: 3 }}>
          <NoteBlock />
        </Box>
      </Box>
      <PageFooter model={model} />
    </Box>
  );
}

function StageLayout({ model, loaded, onLoaded, zooming, onZoom }: LayoutProps) {
  const { shows, r } = useDesign();
  const [details, setDetails] = useState(false);
  const { file } = model;
  const facts = [
    shows('owner') ? model.boot.profile?.name || file.username : null,
    shows('size') ? formatBytes(file.sizeBytes) : null,
    shows('date') ? relativeFromServer(file.date) : null,
  ].filter(Boolean);
  return (
    <Box sx={{ ...page, bgcolor: '#060509', color: '#f4f1f8' }} data-mui-color-scheme="dark">
      <Box
        aria-hidden
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `radial-gradient(70% 45% at 50% 105%, ${mix(model.accent, 34)}, transparent 70%)`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 3,
          background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.55), transparent)',
        }}
      >
        <PageHeader model={model} tone="glass" />
      </Box>
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          px: { xs: 1, md: 3 },
          pt: '72px',
          pb: { xs: '150px', sm: '120px' },
        }}
      >
        <m.figure {...reveal(loaded)} style={{ margin: 0, width: '100%' }}>
          <MediaStage model={model} fit="stage" maxHeight="calc(100dvh - 200px)" onLoaded={onLoaded} onZoom={onZoom} hidden={zooming} />
        </m.figure>
        <Notices model={model} sx={{ mt: 2, maxWidth: 720, width: '100%' }} />
      </Box>
      <Box
        sx={{
          position: 'fixed',
          zIndex: 4,
          left: '50%',
          bottom: 'max(16px, env(safe-area-inset-bottom))',
          transform: 'translateX(-50%)',
          width: 'min(980px, calc(100% - 24px))',
        }}
      >
        <AnimatePresence>
          {details && (
            <m.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12, transition: { duration: 0.16 } }}
              transition={{ duration: 0.32, ease: ease.emphasizedDecelerate }}
            >
              <Box
                sx={{
                  mb: 1,
                  p: { xs: 2, sm: 2.5 },
                  borderRadius: `${r(radius.xl)}px`,
                  bgcolor: 'rgb(22 20 28 / 0.86)',
                  backdropFilter: 'blur(20px) saturate(1.3)',
                  border: '1px solid rgb(255 255 255 / 0.08)',
                  display: 'grid',
                  gap: 2,
                }}
              >
                <MetaList model={model} />
                <NoteBlock />
              </Box>
            </m.div>
          )}
        </AnimatePresence>
        <Box
          className="ms-info"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: { xs: 2, sm: 2.5 },
            pr: 1,
            py: 1,
            borderRadius: `${r(radius.full)}px`,
            bgcolor: 'rgb(22 20 28 / 0.72)',
            backdropFilter: 'blur(20px) saturate(1.3)',
            border: '1px solid rgb(255 255 255 / 0.08)',
            boxShadow: elevation[4],
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {shows('title') && (
              <Typography
                component="h1"
                noWrap
                className="ms-title"
                sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}
                title={model.label}
              >
                {model.label}
              </Typography>
            )}
            {facts.length > 0 && (
              <Typography variant="caption" noWrap component="p" sx={{ color: 'rgb(255 255 255 / 0.68)' }}>
                {facts.join(', ')}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Actions model={model} style="glass" />
          </Box>
          <Tooltip title={details ? t('Angaben ausblenden') : t('Angaben zeigen')}>
            <IconButton
              aria-label={t('Angaben')}
              aria-pressed={details}
              onClick={() => setDetails((value) => !value)}
              sx={{ color: '#fff', '&:hover': { bgcolor: 'rgb(255 255 255 / 0.14)' } }}
            >
              {details ? <CloseRounded /> : <InfoOutlined />}
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, justifyContent: 'center', mt: 1 }}>
          <Actions model={model} style="glass" />
        </Box>
      </Box>
      <PageFooter model={model} sx={{ pb: { xs: 18, sm: 14 }, color: 'rgb(255 255 255 / 0.7)' }} />
    </Box>
  );
}

function SplitLayout({ model, loaded, onLoaded, zooming, onZoom }: LayoutProps) {
  const { r, shows } = useDesign();
  return (
    <Box sx={page}>
      <Backdrop model={model} />
      <PageHeader model={model} />
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          maxWidth: 1480,
          mx: 'auto',
          px: { xs: 2, md: 3 },
          pb: 6,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 380px' },
          gap: { xs: 3, lg: 4 },
          alignItems: 'start',
        }}
      >
        <Box
          sx={{
            position: { lg: 'sticky' },
            top: { lg: 16 },
            minHeight: { lg: 'calc(100dvh - 112px)' },
            display: 'grid',
            placeItems: 'center',
            p: { xs: 1, md: 2.5 },
            borderRadius: `${r(radius.xl)}px`,
            bgcolor: mix(c.surfaceContainerLow, 72),
            border: `1px solid ${mix(c.outlineVariant, 50)}`,
          }}
        >
          <m.figure {...reveal(loaded)} style={{ margin: 0, width: '100%' }}>
            <MediaStage
              model={model}
              fit="flat"
              maxHeight={{ xs: '60vh', lg: 'calc(100dvh - 170px)' }}
              onLoaded={onLoaded}
              onZoom={onZoom}
              hidden={zooming}
            />
          </m.figure>
        </Box>
        <m.aside
          className="ms-info"
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: ease.emphasizedDecelerate }}
          style={{ display: 'grid', gap: 24, alignContent: 'start' }}
        >
          <TitleBlock model={model} size="large" />
          {shows('owner') && <Owner model={model} size={36} />}
          <Box sx={{ '& .ms-actions': { display: 'grid', gridTemplateColumns: '1fr', '& > *': { justifyContent: 'center' } } }}>
            <Actions model={model} />
          </Box>
          <Divider />
          <Box sx={{ '& .ms-meta': { flexDirection: 'column', alignItems: 'flex-start' } }}>
            <MetaList model={model} owner={false} />
          </Box>
          <NoteBlock />
          <Notices model={model} />
        </m.aside>
      </Box>
      <PageFooter model={model} />
    </Box>
  );
}

function PolaroidLayout({ model, loaded, onLoaded, zooming, onZoom }: LayoutProps) {
  const { r, shows, font } = useDesign();
  const { file } = model;
  const date = parseServerDate(file.date);
  return (
    <Box sx={page}>
      <Backdrop model={model} />
      <PageHeader model={model} />
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          maxWidth: 1040,
          mx: 'auto',
          px: { xs: 2.5, md: 3 },
          pt: { xs: 3, md: 5 },
          pb: 8,
          display: 'grid',
          justifyItems: 'center',
          alignContent: 'start',
        }}
      >
        <m.div
          initial={{ opacity: 0, rotate: -6, y: 40 }}
          animate={loaded ? { opacity: 1, rotate: -1.6, y: 0 } : undefined}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          style={{ maxWidth: '100%' }}
        >
          <Box
            data-mui-color-scheme="light"
            sx={{
              bgcolor: '#fbfaf6',
              color: '#24212b',
              p: { xs: 1.25, sm: 2 },
              pb: { xs: 2, sm: 2.5 },
              borderRadius: `${r(6)}px`,
              boxShadow: '0 28px 60px -22px rgb(0 0 0 / 0.55), 0 2px 8px rgb(0 0 0 / 0.18)',
              maxWidth: 'min(920px, 100%)',
            }}
          >
            <Box
              sx={{
                borderRadius: `${r(3)}px`,
                overflow: 'hidden',
                bgcolor: '#e8e5dc',
                lineHeight: 0,
                '& .ms-media': { borderRadius: 0, boxShadow: 'none' },
              }}
            >
              <MediaStage
                model={model}
                fit="flat"
                maxHeight={{ xs: '56vh', md: '64vh' }}
                onLoaded={onLoaded}
                onZoom={onZoom}
                hidden={zooming}
              />
            </Box>
            <Box sx={{ pt: { xs: 2, sm: 3 }, px: 1, textAlign: 'center', minHeight: 56 }}>
              {shows('title') && (
                <Typography
                  component="h1"
                  className="ms-title"
                  sx={{
                    fontFamily: font,
                    fontSize: { xs: '1.25rem', sm: '1.6rem' },
                    fontWeight: 700,
                    color: '#24212b',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {model.label}
                </Typography>
              )}
              {shows('date') && date && (
                <Typography variant="body2" sx={{ color: '#6b6575', mt: 0.5 }}>
                  {formatDate(date)}
                </Typography>
              )}
            </Box>
          </Box>
        </m.div>
        <Notices model={model} sx={{ mt: 3, maxWidth: 640, width: '100%' }} />
        <Box className="ms-info" sx={{ mt: { xs: 4, md: 5 }, display: 'grid', justifyItems: 'center', gap: 2.5, textAlign: 'center' }}>
          <Actions model={model} />
          <Box sx={{ '& .ms-meta': { justifyContent: 'center' } }}>
            <MetaList model={model} />
          </Box>
          <NoteBlock align="center" />
        </Box>
      </Box>
      <PageFooter model={model} />
    </Box>
  );
}

function MagazineLayout({ model, loaded, onLoaded, zooming, onZoom }: LayoutProps) {
  const { shows, design } = useDesign();
  const { file } = model;
  const date = parseServerDate(file.date);
  const byline = [
    shows('date') && date ? formatDate(date) : null,
    shows('views') ? tn(file.views, '1 Aufruf', '{count} Aufrufe') : null,
  ].filter(Boolean);
  const facts = [
    shows('size') ? formatBytes(file.sizeBytes) : null,
    shows('resolution') && file.width ? `${formatNumber(file.width)} × ${formatNumber(file.height)}` : null,
  ].filter(Boolean);
  return (
    <Box sx={page}>
      <Backdrop model={model} />
      <PageHeader model={model} />
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          maxWidth: 1180,
          mx: 'auto',
          px: { xs: 2.5, md: 4 },
          pt: { xs: 3, md: 6 },
          pb: 8,
        }}
      >
        <m.header
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: ease.emphasizedDecelerate }}
        >
          <Typography variant="body2" sx={{ color: c.primary, fontWeight: 800, mb: 1.5 }}>
            {typeDescription(file.filename, file.type, file.isGif)}
          </Typography>
          <TitleBlock model={model} size="display" />
          <Box sx={{ mt: 2.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2.5, rowGap: 1 }}>
            {shows('owner') && <Owner model={model} size={28} />}
            {byline.length > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {byline.join(', ')}
              </Typography>
            )}
          </Box>
        </m.header>
        <m.figure {...reveal(loaded)} style={{ margin: 0, marginTop: 40 }}>
          <MediaStage
            model={model}
            fit="flat"
            maxHeight={{ xs: '64vh', md: '80vh' }}
            onLoaded={onLoaded}
            onZoom={onZoom}
            hidden={zooming}
          />
          <Box
            component="figcaption"
            className="ms-info"
            sx={{
              mt: 1.5,
              pt: 1.5,
              borderTop: `1px solid ${c.outlineVariant}`,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {facts.join(', ')}
            </Typography>
            <Actions model={model} style="links" />
          </Box>
        </m.figure>
        <Notices model={model} sx={{ mt: 3 }} />
        {(design.note || design.button.url) && (
          <Box
            sx={{
              mt: { xs: 4, md: 6 },
              pl: { xs: 2, md: 3 },
              borderLeft: `3px solid ${c.primary}`,
              maxWidth: 760,
              '& .ms-note p': { fontSize: { xs: '1.1rem', md: '1.3rem' }, fontStyle: 'italic', color: 'text.primary' },
            }}
          >
            <NoteBlock />
          </Box>
        )}
      </Box>
      <PageFooter model={model} />
    </Box>
  );
}

export const LAYOUTS: Record<string, ComponentType<LayoutProps>> = {
  standard: StandardLayout,
  minimal: MinimalLayout,
  stage: StageLayout,
  split: SplitLayout,
  polaroid: PolaroidLayout,
  magazine: MagazineLayout,
};
