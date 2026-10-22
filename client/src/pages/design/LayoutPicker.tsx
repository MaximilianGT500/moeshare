import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import type { DesignLayout } from '../../lib/types';
import { LAYOUT_HINTS, LAYOUT_LABELS } from '../../lib/design';
import { mix } from '../../lib/color';
import { c, css, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

const block = (sx: object) => <Box sx={{ position: 'absolute', ...sx }} />;

const media = (sx: object) => block({ bgcolor: c.primary, opacity: 0.85, borderRadius: '3px', ...sx });
const line = (sx: object) => block({ bgcolor: c.onSurfaceVariant, opacity: 0.45, height: '4px', borderRadius: '2px', ...sx });
const pill = (sx: object) => block({ bgcolor: c.primary, height: '7px', borderRadius: '4px', ...sx });

const SKETCHES: Record<DesignLayout, () => ReactNode> = {
  standard: () => (
    <>
      {block({ inset: 0, background: `radial-gradient(80% 60% at 50% 0%, ${mix(c.primary, 30)}, transparent 70%)` })}
      {line({ top: '8%', left: '6%', width: '22%' })}
      {media({ top: '18%', left: '24%', width: '52%', height: '40%' })}
      {block({ top: '64%', left: '14%', width: '72%', height: '28%', borderRadius: '5px', bgcolor: c.surfaceContainerHighest })}
      {line({ top: '70%', left: '19%', width: '30%' })}
      {pill({ top: '79%', left: '19%', width: '18%' })}
      {pill({ top: '79%', left: '39%', width: '14%', opacity: 0.5 })}
    </>
  ),
  minimal: () => (
    <>
      {media({ top: '12%', left: '12%', width: '76%', height: '58%' })}
      {block({ top: '78%', left: '12%', width: '76%', height: '1px', bgcolor: c.outlineVariant })}
      {line({ top: '84%', left: '12%', width: '34%' })}
      {pill({ top: '82.5%', left: '68%', width: '20%' })}
    </>
  ),
  stage: () => (
    <>
      {block({ inset: 0, bgcolor: '#08070b' })}
      {media({ top: '10%', left: '8%', width: '84%', height: '64%', borderRadius: 0 })}
      {block({ top: '80%', left: '16%', width: '68%', height: '12%', borderRadius: '8px', bgcolor: 'rgb(255 255 255 / 0.16)' })}
      {block({ top: '84%', left: '22%', width: '26%', height: '4px', borderRadius: '2px', bgcolor: 'rgb(255 255 255 / 0.6)' })}
      {block({ top: '83%', left: '64%', width: '15%', height: '7px', borderRadius: '4px', bgcolor: '#fff' })}
    </>
  ),
  split: () => (
    <>
      {block({ top: '10%', left: '6%', width: '58%', height: '80%', borderRadius: '5px', bgcolor: c.surfaceContainerHighest })}
      {media({ top: '22%', left: '12%', width: '46%', height: '56%' })}
      {line({ top: '14%', left: '70%', width: '24%', height: '6px' })}
      {line({ top: '26%', left: '70%', width: '16%' })}
      {pill({ top: '38%', left: '70%', width: '24%' })}
      {pill({ top: '49%', left: '70%', width: '24%', opacity: 0.5 })}
      {line({ top: '64%', left: '70%', width: '20%' })}
      {line({ top: '72%', left: '70%', width: '14%' })}
    </>
  ),
  polaroid: () => (
    <>
      {block({ inset: 0, backgroundImage: `radial-gradient(${mix(c.onSurface, 22)} 1px, transparent 1.2px)`, backgroundSize: '8px 8px' })}
      <Box
        sx={{
          position: 'absolute',
          top: '10%',
          left: '27%',
          width: '46%',
          height: '66%',
          bgcolor: '#fbfaf6',
          borderRadius: '2px',
          transform: 'rotate(-4deg)',
          boxShadow: '0 6px 12px rgb(0 0 0 / 0.25)',
        }}
      >
        <Box sx={{ position: 'absolute', top: '7%', left: '8%', right: '8%', height: '66%', bgcolor: c.primary, opacity: 0.85 }} />
        <Box sx={{ position: 'absolute', top: '82%', left: '28%', width: '44%', height: '4px', borderRadius: '2px', bgcolor: '#6b6575' }} />
      </Box>
      {pill({ top: '84%', left: '38%', width: '24%' })}
    </>
  ),
  magazine: () => (
    <>
      {line({ top: '9%', left: '8%', width: '14%', bgcolor: c.primary, opacity: 0.9 })}
      {line({ top: '17%', left: '8%', width: '70%', height: '9px', opacity: 0.75 })}
      {line({ top: '29%', left: '8%', width: '48%', height: '9px', opacity: 0.75 })}
      {line({ top: '41%', left: '8%', width: '24%' })}
      {media({ top: '50%', left: '8%', width: '84%', height: '38%', borderRadius: 0 })}
    </>
  ),
};

export function LayoutPicker({
  value,
  options,
  onChange,
  disabled,
}: {
  value: DesignLayout;
  options: DesignLayout[];
  onChange: (layout: DesignLayout) => void;
  disabled?: boolean;
}) {
  return (
    <Box
      role="radiogroup"
      aria-label={t('Aufbau')}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
        gap: 1.5,
        p: { xs: 2, sm: 2.5 },
      }}
    >
      {options.map((layout) => {
        const active = layout === value;
        return (
          <ButtonBase
            key={layout}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(layout)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              justifyContent: 'flex-start',
              textAlign: 'left',
              borderRadius: `${radius.md}px`,
              p: 1,
              bgcolor: active ? c.secondaryContainer : 'transparent',
              color: active ? c.onSecondaryContainer : 'inherit',
              boxShadow: active ? `inset 0 0 0 2px ${c.primary}` : `inset 0 0 0 1px ${c.outlineVariant}`,
              transition: `background-color 200ms ${css.standard}, box-shadow 200ms ${css.standard}`,
              '&:hover': { bgcolor: active ? c.secondaryContainer : mix(c.onSurface, 5) },
              '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: 'relative',
                aspectRatio: '4 / 3',
                borderRadius: `${radius.sm}px`,
                overflow: 'hidden',
                bgcolor: c.surfaceContainer,
              }}
            >
              {SKETCHES[layout]()}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, px: 0.25 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                {LAYOUT_LABELS[layout]()}
              </Typography>
              {active && <CheckCircleRounded sx={{ fontSize: 18, color: c.primary }} />}
            </Box>
            <Typography
              variant="caption"
              component="p"
              sx={{ color: active ? 'inherit' : 'text.secondary', opacity: active ? 0.85 : 1, px: 0.25, mt: 0.25 }}
            >
              {LAYOUT_HINTS[layout]()}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
