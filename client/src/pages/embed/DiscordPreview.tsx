import { AnimatePresence, m } from 'motion/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import type { RenderedEmbed } from '../../lib/embed';
import { UserAvatar } from '../../components/UserAvatar';
import { ease } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const THEMES = {
  dark: {
    chat: '#313338',
    embed: '#2b2d31',
    name: '#f2f3f5',
    text: '#dbdee1',
    muted: '#949ba4',
    provider: '#b5bac1',
    link: '#00a8fc',
    border: '#1e1f22',
  },
  light: {
    chat: '#ffffff',
    embed: '#f2f3f5',
    name: '#060607',
    text: '#313338',
    muted: '#5c5e66',
    provider: '#4e5058',
    link: '#006ce7',
    border: '#e3e5e8',
  },
} as const;

export type ChatTheme = keyof typeof THEMES;

const FONT = '"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';

export interface PreviewMedia {
  type: 'image' | 'video' | 'audio' | 'text' | 'file';
  src: string | null;
  width: number;
  height: number;
}

function Media({ media, large, radius = 4 }: { media: PreviewMedia; large: boolean; radius?: number }) {
  if (!media.src || (media.type !== 'image' && media.type !== 'video')) return null;
  const ratio = media.width > 0 && media.height > 0 ? media.width / media.height : 16 / 9;
  const width = large ? `min(100%, 400px, ${Math.round(300 * ratio)}px)` : '80px';
  return (
    <Box
      sx={{
        position: 'relative',
        width,
        aspectRatio: large ? String(ratio) : '1',
        borderRadius: `${radius}px`,
        overflow: 'hidden',
        bgcolor: 'rgb(0 0 0 / 0.2)',
        flexShrink: 0,
      }}
    >
      <Box component="img" src={media.src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {media.type === 'video' && large && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              bgcolor: 'rgb(0 0 0 / 0.6)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
            }}
          >
            <PlayArrowRounded sx={{ fontSize: 34 }} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

const linkSx = (color: string, href: string) =>
  href ? { color, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } } : { color };

export function DiscordPreview({
  embed,
  color,
  media,
  link,
  username,
  theme,
}: {
  embed: RenderedEmbed;
  color: string;
  media: PreviewMedia;
  link: string;
  username: string;
  theme: ChatTheme;
}) {
  const palette = THEMES[theme];
  const now = new Date();
  const time = t('Heute um {time}', { time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` });
  const hasText = embed.enabled && Boolean(embed.siteName || embed.author || embed.title || embed.description);
  const visualMedia = media.src && (media.type === 'image' || media.type === 'video');
  const large = embed.largeImage || media.type === 'video';

  return (
    <Box
      sx={{
        bgcolor: palette.chat,
        color: palette.text,
        fontFamily: FONT,
        borderRadius: '12px',
        p: { xs: 2, sm: 2.5 },
        transition: 'background-color 240ms ease',
        border: `1px solid ${palette.border}`,
      }}
    >
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ flexShrink: 0, pt: 0.25 }}>
          <UserAvatar name={username} size={40} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography component="span" sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '1rem', color: palette.name }}>
              {username}
            </Typography>
            <Typography component="span" sx={{ fontFamily: FONT, fontSize: '0.75rem', color: palette.muted }}>
              {time}
            </Typography>
          </Box>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.9375rem', color: palette.link, wordBreak: 'break-all', lineHeight: 1.375 }}>
            {link}
          </Typography>

          <AnimatePresence mode="wait" initial={false}>
            {hasText ? (
              <m.div
                key="card"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: ease.standard }}
              >
                <Box
                  sx={{
                    mt: 0.75,
                    maxWidth: 432,
                    bgcolor: palette.embed,
                    borderRadius: '4px',
                    borderLeft: `4px solid ${color}`,
                    transition: 'border-color 220ms ease, background-color 240ms ease',
                    p: '8px 16px 16px 12px',
                    display: 'grid',
                    gridTemplateColumns: !large && visualMedia ? '1fr auto' : '1fr',
                    columnGap: 2,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    {embed.siteName && (
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', mt: 1, ...linkSx(palette.provider, embed.siteUrl) }}>
                        {embed.siteName}
                      </Typography>
                    )}
                    {embed.author && (
                      <Typography
                        sx={{ fontFamily: FONT, fontSize: '0.875rem', fontWeight: 600, mt: 1, ...linkSx(palette.name, embed.authorUrl) }}
                      >
                        {embed.author}
                      </Typography>
                    )}
                    {embed.title && (
                      <Typography
                        sx={{
                          fontFamily: FONT,
                          fontSize: '1rem',
                          fontWeight: 600,
                          mt: 1,
                          color: palette.link,
                          wordBreak: 'break-word',
                          '&:hover': { textDecoration: 'underline' },
                          cursor: 'pointer',
                        }}
                      >
                        {embed.title}
                      </Typography>
                    )}
                    {embed.description && (
                      <Typography
                        sx={{
                          fontFamily: FONT,
                          fontSize: '0.875rem',
                          mt: 1,
                          color: palette.text,
                          whiteSpace: 'pre-line',
                          wordBreak: 'break-word',
                          lineHeight: 1.375,
                        }}
                      >
                        {embed.description}
                      </Typography>
                    )}
                  </Box>
                  {visualMedia && (
                    <Box sx={{ mt: large ? 2 : 1, minWidth: 0, gridRow: large ? 'auto' : '1' }}>
                      <Media media={media} large={large} />
                    </Box>
                  )}
                </Box>
              </m.div>
            ) : (
              <m.div
                key="bare"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: ease.standard }}
              >
                {visualMedia ? (
                  <Box sx={{ mt: 0.75 }}>
                    <Media media={media} large radius={8} />
                  </Box>
                ) : (
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.8125rem', color: palette.muted, mt: 1 }}>
                    {t('Bei Audio und anderen Dateien zeigt Discord in diesem Modus nur den Link.')}
                  </Typography>
                )}
              </m.div>
            )}
          </AnimatePresence>
        </Box>
      </Box>
    </Box>
  );
}
