import { Fragment, type ReactNode } from 'react';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { readBoot } from '../../lib/boot';
import type { LegalBoot } from '../../lib/types';
import { AmbientBackdrop } from '../../components/Ambient';
import { BrandMark } from '../../components/BrandMark';
import { SiteFooter } from '../../components/SiteFooter';
import { ThemeToggleButton } from '../../components/ThemeToggle';
import { mix } from '../../lib/color';
import { c, ease, radius } from '../../theme/tokens';

const TOKEN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function linkify(line: string): ReactNode[] {
  return line.split(TOKEN).map((part, index) => {
    if (index % 2 === 0) return part;
    const email = !part.startsWith('http');
    return (
      <Link
        key={index}
        href={email ? `mailto:${part}` : part}
        target={email ? undefined : '_blank'}
        rel={email ? undefined : 'noopener noreferrer'}
        underline="hover"
        sx={{ wordBreak: 'break-word' }}
      >
        {part}
      </Link>
    );
  });
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((block) => block.trim())
        .map((block, index) => (
          <Typography key={index} variant="body1" sx={{ mt: index ? 2 : 0, lineHeight: 1.7 }}>
            {block.split('\n').map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {linkify(line)}
              </Fragment>
            ))}
          </Typography>
        ))}
    </>
  );
}

export function LegalPage() {
  const boot = readBoot<LegalBoot>();
  const { site, legal } = boot;
  return (
    <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AmbientBackdrop src={site.favicon || null} color={c.primary} strength={0.5} />
      <Box
        component="header"
        sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 3 }, height: 64 }}
      >
        <ButtonBase component="a" href="/" nativeButton={false} aria-label={site.title} sx={{ borderRadius: '50%' }}>
          <BrandMark src={site.favicon} title={site.title} size={34} />
        </ButtonBase>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
          {site.title}
        </Typography>
        <ThemeToggleButton />
      </Box>
      <Box component="main" sx={{ position: 'relative', zIndex: 1, flex: 1, px: 2, pt: { xs: 3, md: 6 }, pb: 8 }}>
        <m.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: ease.emphasizedDecelerate }}
          style={{ maxWidth: 720, margin: '0 auto' }}
        >
          <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.5rem' }, mb: 3 }}>
            {legal.title}
          </Typography>
          <Box
            sx={{
              p: { xs: 2.5, sm: 4 },
              borderRadius: `${radius.xl}px`,
              bgcolor: mix(c.surfaceContainerLow, 85),
              border: `1px solid ${mix(c.outlineVariant, 60)}`,
              maxWidth: '75ch',
            }}
          >
            <Paragraphs text={legal.text} />
          </Box>
        </m.article>
      </Box>
      <SiteFooter site={site} sx={{ position: 'relative', zIndex: 1, px: 2, pb: 3 }} />
    </Box>
  );
}
