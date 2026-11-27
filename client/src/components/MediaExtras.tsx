import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import type { AudioMeta } from '../lib/types';
import { copyText } from '../lib/clipboard';
import { useToast } from './Toaster';
import { c } from '../theme/tokens';
import { t } from '../lib/i18n';

export function PaletteSwatches({ colors, size = 28, label }: { colors: string[]; size?: number; label?: string }) {
  const toast = useToast();
  if (!colors.length) return null;
  const copy = async (hex: string) => {
    if (await copyText(hex)) toast(t('Farbe {hex} kopiert', { hex }), { variant: 'success', duration: 2000 });
  };
  return (
    <Box role="list" aria-label={label || t('Farbpalette')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {colors.map((hex) => (
        <Tooltip key={hex} title={hex.toUpperCase()}>
          <ButtonBase
            role="listitem"
            onClick={() => void copy(hex)}
            aria-label={t('Farbe {hex} kopieren', { hex: hex.toUpperCase() })}
            sx={{
              width: size,
              height: size,
              borderRadius: '50%',
              bgcolor: hex,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.onSurface} 18%, transparent)`,
              transition: 'transform 120ms',
              '&:hover': { transform: 'scale(1.12)' },
              '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
            }}
          />
        </Tooltip>
      ))}
    </Box>
  );
}

export function audioByline(meta: AudioMeta | null | undefined) {
  if (!meta) return '';
  const album = meta.album ? (meta.year ? `${meta.album} (${meta.year})` : meta.album) : meta.year || '';
  return [meta.artist || meta.albumArtist || '', album].filter(Boolean).join(' – ');
}

export const hasAudioMeta = (meta: AudioMeta | null | undefined): meta is AudioMeta =>
  Boolean(meta && (meta.title || meta.artist || meta.album || meta.year || meta.genre || meta.track));
