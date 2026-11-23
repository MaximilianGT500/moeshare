import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FontDownloadOutlined from '@mui/icons-material/FontDownloadOutlined';
import { language, t } from '../lib/i18n';
import { c, radius } from '../theme/tokens';

export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];

export const isFontName = (name: string) => FONT_EXTENSIONS.includes((/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase());

const PANGRAM = () =>
  language === 'en' ? 'The quick brown fox jumps over the lazy dog' : 'Franz jagt im komplett verwahrlosten Taxi quer durch Bayern';
const ROWS = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789 !?&@€%()', 'ÄÖÜ äöü ß « » „“ – …'];

let counter = 0;

export function useUploadedFont(url: string | null) {
  const [state, setState] = useState<{ family: string | null; failed: boolean }>({ family: null, failed: false });
  useEffect(() => {
    if (!url || typeof FontFace === 'undefined') {
      setState({ family: null, failed: Boolean(url) });
      return undefined;
    }
    let alive = true;
    counter += 1;
    const family = `moeshare-preview-${counter}`;
    const face = new FontFace(family, `url("${url.replace(/"/g, '%22')}")`);
    setState({ family: null, failed: false });
    face
      .load()
      .then((loaded) => {
        if (!alive) return;
        document.fonts.add(loaded);
        setState({ family, failed: false });
      })
      .catch(() => alive && setState({ family: null, failed: true }));
    return () => {
      alive = false;
      document.fonts.delete(face);
    };
  }, [url]);
  return state;
}

const stemOf = (name: string) => name.replace(/\.[^.]+$/, '') || name;

export function FontSample({ url, name }: { url: string; name: string }) {
  const { family, failed } = useUploadedFont(url);
  if (failed || !family) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', '& svg': { fontSize: 52 } }}>
        <FontDownloadOutlined />
      </Box>
    );
  }
  return (
    <Box sx={{ textAlign: 'center', fontFamily: `"${family}", sans-serif` }}>
      <Box component="p" aria-hidden sx={{ m: 0, fontSize: 64, lineHeight: 1.05 }}>
        Aa
      </Box>
      <Box component="p" sx={{ m: 0, mt: 1, fontSize: 18, lineHeight: 1.3 }} title={stemOf(name)}>
        {PANGRAM()}
      </Box>
    </Box>
  );
}

export function FontStage({ src }: { src: string }) {
  const { family, failed } = useUploadedFont(src);
  const [text, setText] = useState(PANGRAM);
  const [scale, setScale] = useState(56);
  const fontFamily = family ? `"${family}", sans-serif` : 'inherit';
  return (
    <Box
      sx={{
        width: 'min(960px, 100%)',
        mx: 'auto',
        p: { xs: 2.5, sm: 4 },
        borderRadius: `${radius.xl}px`,
        bgcolor: c.surfaceContainerLow,
        color: c.onSurface,
      }}
    >
      {failed ? (
        <Typography variant="body1" sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
          {t('Diese Schrift kann der Browser nicht anzeigen. Lade sie herunter, um sie anzusehen.')}
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 220px' }, gap: 2, alignItems: 'center', mb: 3 }}>
            <TextField
              size="small"
              label={t('Eigener Text')}
              value={text}
              onChange={(event) => setText(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {t('Größe')}
              </Typography>
              <Slider
                size="small"
                min={14}
                max={128}
                value={scale}
                onChange={(_event, value) => setScale(value as number)}
                aria-label={t('Schriftgröße')}
                valueLabelDisplay="auto"
              />
            </Box>
          </Box>
          <Box
            component="p"
            sx={{
              m: 0,
              minHeight: scale * 1.3,
              fontFamily,
              fontSize: scale,
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
              opacity: family ? 1 : 0.3,
              transition: 'opacity 200ms',
            }}
          >
            {text || PANGRAM()}
          </Box>
          <Box sx={{ mt: 3, display: 'grid', gap: 1.5, fontFamily, opacity: family ? 1 : 0.3 }}>
            {ROWS.map((row) => (
              <Box key={row} component="p" sx={{ m: 0, fontSize: 24, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                {row}
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              mt: 3,
              pt: 2,
              borderTop: `1px solid ${c.outlineVariant}`,
              display: 'grid',
              gap: 1,
              fontFamily,
              opacity: family ? 1 : 0.3,
            }}
          >
            {[12, 16, 20, 32].map((px) => (
              <Box key={px} sx={{ display: 'flex', alignItems: 'baseline', gap: 2, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', width: 40, flexShrink: 0 }}>
                  {px} px
                </Typography>
                <Box
                  component="span"
                  sx={{ fontSize: px, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
                >
                  {text || PANGRAM()}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
