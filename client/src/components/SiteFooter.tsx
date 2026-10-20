import type { MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import type { SiteInfo, SiteLink } from '../lib/types';

const isExternal = (url: string) => /^https?:\/\//.test(url);

export function FooterLinks({
  links,
  inert,
  strong = false,
}: {
  links: SiteLink[];
  inert?: (event: MouseEvent) => void;
  strong?: boolean;
}) {
  if (!links.length) return null;
  return (
    <Box component="nav" aria-label="Links" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: strong ? 3 : 2, rowGap: 0.75 }}>
      {links.map((link) => (
        <Link
          key={`${link.label}-${link.url}`}
          href={link.url}
          onClick={inert}
          target={isExternal(link.url) ? '_blank' : undefined}
          rel={isExternal(link.url) ? 'noopener noreferrer' : undefined}
          underline="hover"
          color="inherit"
          variant={strong ? 'body2' : 'caption'}
          sx={{ fontWeight: strong ? 700 : 600 }}
        >
          {link.label}
        </Link>
      ))}
    </Box>
  );
}

export function SiteFooter({
  site,
  version = false,
  inert,
  sx,
}: {
  site: SiteInfo;
  version?: boolean;
  inert?: (event: MouseEvent) => void;
  sx?: SxProps<Theme>;
}) {
  const links = [...(site.links || []), ...(site.legal || [])];
  const showVersion = version && Boolean(site.version);
  if (!links.length && !site.copyright && !showVersion) return null;
  return (
    <Box
      component="footer"
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.75,
          textAlign: 'center',
          color: 'text.secondary',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <FooterLinks links={links} inert={inert} />
      {(site.copyright || showVersion) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 1.5, opacity: 0.8 }}>
          {site.copyright && <Typography variant="caption">{site.copyright}</Typography>}
          {showVersion && <Typography variant="caption">MoeShare {site.version}</Typography>}
        </Box>
      )}
    </Box>
  );
}
