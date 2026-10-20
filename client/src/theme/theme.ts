import { createTheme, type Shadows } from '@mui/material/styles';
import { buildScheme, FILE_TYPE_COLORS, type M3Tokens } from './scheme';
import { c, css, elevation, fonts, radius } from './tokens';
import { mix } from '../lib/color';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
};

function overlay(base: string, layer: string, amount: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(layer);
  const ch = (i: number) => Math.round(a[i] * (1 - amount) + b[i] * amount);
  return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function paletteFor(m: M3Tokens, mode: 'light' | 'dark') {
  const group = (main: string, on: string) => ({
    main,
    light: overlay(main, '#ffffff', 0.12),
    dark: overlay(main, on, 0.1),
    contrastText: on,
  });
  return {
    mode,
    primary: group(m.primary, m.onPrimary),
    secondary: group(m.secondary, m.onSecondary),
    error: group(m.error, m.onError),
    warning: group(m.warning, m.onWarning),
    success: group(m.success, m.onSuccess),
    info: group(m.tertiary, m.onTertiary),
    background: { default: m.surface, paper: m.surfaceContainerLow },
    text: { primary: m.onSurface, secondary: m.onSurfaceVariant, disabled: rgba(m.onSurface, 0.38) },
    divider: m.outlineVariant,
    action: {
      active: m.onSurfaceVariant,
      hover: rgba(m.onSurface, 0.08),
      hoverOpacity: 0.08,
      selected: rgba(m.onSurface, 0.1),
      selectedOpacity: 0.1,
      focus: rgba(m.onSurface, 0.1),
      focusOpacity: 0.1,
      disabled: rgba(m.onSurface, 0.38),
      disabledBackground: rgba(m.onSurface, 0.12),
      disabledOpacity: 0.38,
      activatedOpacity: 0.1,
    },
    m3: m,
    fileTypes: { ...FILE_TYPE_COLORS[mode] },
    Tooltip: { bg: m.inverseSurface },
    SnackbarContent: { bg: m.inverseSurface, color: m.inverseOnSurface },
    Skeleton: { bg: m.surfaceContainerHigh },
    TableCell: { border: m.outlineVariant },
    Avatar: { defaultBg: m.secondaryContainer },
    LinearProgress: {
      primaryBg: m.secondaryContainer,
      secondaryBg: m.secondaryContainer,
      errorBg: m.errorContainer,
      infoBg: m.tertiaryContainer,
      successBg: m.successContainer,
      warningBg: m.warningContainer,
    },
  };
}

const shadows = Array.from({ length: 25 }, (_, i) =>
  i === 0 ? 'none' : elevation[Math.min(5, Math.ceil(i / 3)) as 1 | 2 | 3 | 4 | 5]
) as Shadows;

export function createAppTheme(seed: string) {
  const dark = buildScheme(seed, true);
  const light = buildScheme(seed, false);

  return createTheme({
    cssVariables: { colorSchemeSelector: 'data-mui-color-scheme', nativeColor: true },
    defaultColorScheme: 'dark',
    colorSchemes: {
      dark: { palette: paletteFor(dark, 'dark') },
      light: { palette: paletteFor(light, 'light') },
    },
    shape: { borderRadius: radius.tile },
    shadows,
    focusVisible: { outlineColor: c.primary, outlineWidth: 2, outlineOffset: 2 },
    motion: { reducedMotion: 'system' },
    typography: {
      fontFamily: fonts.sans,
      fontWeightLight: 300,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 700,
      h1: { fontSize: '2.5rem', lineHeight: 1.2, fontWeight: 800, letterSpacing: '-0.012em' },
      h2: { fontSize: '2rem', lineHeight: 1.25, fontWeight: 800, letterSpacing: '-0.008em' },
      h3: { fontSize: '1.75rem', lineHeight: 1.29, fontWeight: 700 },
      h4: { fontSize: '1.5rem', lineHeight: 1.33, fontWeight: 700 },
      h5: { fontSize: '1.25rem', lineHeight: 1.4, fontWeight: 700 },
      h6: { fontSize: '1.125rem', lineHeight: 1.33, fontWeight: 700 },
      subtitle1: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 500 },
      subtitle2: { fontSize: '0.875rem', lineHeight: 1.43, fontWeight: 700 },
      body1: { fontSize: '1rem', lineHeight: 1.5 },
      body2: { fontSize: '0.875rem', lineHeight: 1.5 },
      caption: { fontSize: '0.75rem', lineHeight: 1.4, letterSpacing: '0.01em' },
      overline: { fontSize: '0.75rem', lineHeight: 1.4, fontWeight: 500, letterSpacing: '0.02em', textTransform: 'none' },
      button: { fontSize: '0.875rem', lineHeight: 1.43, fontWeight: 500, letterSpacing: '0.01em', textTransform: 'none' },
    },
    transitions: {
      easing: { easeInOut: css.standard, easeOut: css.decelerate, easeIn: css.accelerate, sharp: css.standard },
      duration: { shortest: 120, shorter: 180, short: 220, standard: 280, complex: 380, enteringScreen: 320, leavingScreen: 200 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'optimizeLegibility' },
          body: { backgroundColor: c.surface, color: c.onSurface, minHeight: '100dvh', overflowX: 'hidden' },
          '::selection': { backgroundColor: mix(c.primary, 32), color: c.onSurface },
          '*': { scrollbarColor: `${c.outlineVariant} transparent`, scrollbarWidth: 'thin' },
          'img, video': { maxWidth: '100%' },
          '::view-transition-old(root), ::view-transition-new(root)': { animation: 'none', mixBlendMode: 'normal' },
          '::view-transition-new(root)': { zIndex: 9999 },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: radius.md } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: radius.full, minHeight: 40, paddingInline: 24, whiteSpace: 'nowrap' },
          sizeSmall: { minHeight: 32, paddingInline: 14, fontSize: '0.8125rem' },
          sizeLarge: { minHeight: 52, paddingInline: 28, fontSize: '0.9375rem' },
          startIcon: { marginLeft: -6, marginRight: 8 },
          endIcon: { marginRight: -6, marginLeft: 8 },
        },
        variants: [
          { props: { variant: 'text' }, style: { paddingInline: 14 } },
          { props: { variant: 'text', size: 'small' }, style: { paddingInline: 10 } },
          {
            props: { variant: 'outlined' },
            style: { borderColor: c.outline, '&:hover': { borderColor: c.outline } },
          },
          {
            props: { variant: 'contained' },
            style: { '@media (hover: hover)': { '&:hover': { boxShadow: elevation[1] } } },
          },
          {
            props: { variant: 'tonal' },
            style: {
              backgroundColor: c.secondaryContainer,
              color: c.onSecondaryContainer,
              '@media (hover: hover)': {
                '&:hover': {
                  backgroundColor: `color-mix(in srgb, ${c.onSecondaryContainer} 8%, ${c.secondaryContainer})`,
                  boxShadow: elevation[1],
                },
              },
              '&.Mui-disabled': { backgroundColor: mix(c.onSurface, 12), color: mix(c.onSurface, 38) },
            },
          },
        ],
      },
      MuiIconButton: {
        styleOverrides: {
          root: { transition: `background-color 160ms ${css.standard}, color 160ms ${css.standard}, transform 200ms ${css.standard}` },
          sizeSmall: { padding: 6 },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            boxShadow: elevation[3],
            backgroundColor: c.primaryContainer,
            color: c.onPrimaryContainer,
            textTransform: 'none',
            fontWeight: 700,
            '&:hover': {
              backgroundColor: `color-mix(in srgb, ${c.onPrimaryContainer} 8%, ${c.primaryContainer})`,
              boxShadow: elevation[4],
            },
            '&:active': { boxShadow: elevation[3] },
          },
          extended: { height: 56, borderRadius: radius.md, paddingInline: 20, gap: 10, fontSize: '0.9375rem' },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: radius.xl,
            backgroundColor: c.surfaceContainerHigh,
            backgroundImage: 'none',
            boxShadow: elevation[3],
            padding: 8,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: '1.5rem', lineHeight: 1.33, fontWeight: 700, padding: '16px 16px 8px' } },
      },
      MuiDialogContent: { styleOverrides: { root: { padding: '8px 16px', color: c.onSurfaceVariant } } },
      MuiDialogContentText: { styleOverrides: { root: { color: c.onSurfaceVariant, fontSize: '0.875rem', lineHeight: 1.5 } } },
      MuiDialogActions: { styleOverrides: { root: { padding: 16, gap: 8, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } } },
      MuiBackdrop: {
        styleOverrides: { root: { backgroundColor: mix(c.scrim, 45) }, invisible: { backgroundColor: 'transparent' } },
      },
      MuiPopover: {
        styleOverrides: { paper: { borderRadius: radius.tile, backgroundColor: c.surfaceContainer, boxShadow: elevation[2] } },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: radius.tile, backgroundColor: c.surfaceContainer, boxShadow: elevation[2], minWidth: 220 },
          list: { padding: 6 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
            minHeight: 44,
            gap: 12,
            fontSize: '0.875rem',
            paddingInline: 12,
            '&.Mui-selected': { backgroundColor: mix(c.secondaryContainer, 100) },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: { root: { minWidth: 0, color: c.onSurfaceVariant, '& .MuiSvgIcon-root': { fontSize: 20 } } },
      },
      MuiListItemText: { styleOverrides: { secondary: { color: c.onSurfaceVariant } } },
      MuiDivider: { styleOverrides: { root: { borderColor: c.outlineVariant } } },
      MuiTooltip: {
        defaultProps: { enterDelay: 350, enterNextDelay: 150 },
        styleOverrides: {
          tooltip: {
            backgroundColor: c.inverseSurface,
            color: c.inverseOnSurface,
            fontSize: '0.75rem',
            fontWeight: 500,
            borderRadius: radius.sm,
            padding: '6px 10px',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: radius.sm, height: 32, fontWeight: 500, fontSize: '0.875rem' },
          label: { paddingInline: 12 },
          outlined: { borderColor: c.outlineVariant },
          sizeSmall: { height: 24, fontSize: '0.75rem' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius.tile,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: c.outline },
            '&:hover:not(.Mui-focused):not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: c.onSurface },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.primary, borderWidth: 2 },
          },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { color: c.onSurfaceVariant, '&.Mui-focused': { color: c.primary } } } },
      MuiFormHelperText: { styleOverrides: { root: { marginInline: 16 } } },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 48 },
          indicator: { height: 3, borderRadius: '3px 3px 0 0' },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
            minHeight: 48,
            paddingInline: 16,
            color: c.onSurfaceVariant,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${c.outlineVariant}`, padding: '10px 16px', fontSize: '0.875rem' },
          head: { color: c.onSurfaceVariant, fontWeight: 500, fontSize: '0.8125rem', whiteSpace: 'nowrap' },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: `background-color 160ms ${css.standard}`,
            '&.MuiTableRow-hover:hover': { backgroundColor: mix(c.onSurface, 4) },
          },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: { color: c.onSurfaceVariant, borderBottom: 'none' },
          selectLabel: { margin: 0 },
          displayedRows: { margin: 0 },
        },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: radius.full, height: 4 }, bar: { borderRadius: radius.full } },
      },
      MuiSkeleton: { styleOverrides: { root: { backgroundColor: c.surfaceContainerHigh }, rounded: { borderRadius: radius.tile } } },
      MuiAvatar: {
        styleOverrides: {
          root: { fontWeight: 700, fontSize: '1rem' },
          colorDefault: { backgroundColor: c.secondaryContainer, color: c.onSecondaryContainer },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: radius.tile,
            alignItems: 'center',
            variants: [
              {
                props: { variant: 'standard', severity: 'error' },
                style: { backgroundColor: c.errorContainer, color: c.onErrorContainer, '& .MuiAlert-icon': { color: c.error } },
              },
              {
                props: { variant: 'standard', severity: 'warning' },
                style: { backgroundColor: c.warningContainer, color: c.onWarningContainer, '& .MuiAlert-icon': { color: c.warning } },
              },
              {
                props: { variant: 'standard', severity: 'success' },
                style: { backgroundColor: c.successContainer, color: c.onSuccessContainer, '& .MuiAlert-icon': { color: c.success } },
              },
              {
                props: { variant: 'standard', severity: 'info' },
                style: { backgroundColor: c.secondaryContainer, color: c.onSecondaryContainer, '& .MuiAlert-icon': { color: c.secondary } },
              },
            ],
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { borderRadius: radius.full },
          firstButton: { borderTopLeftRadius: radius.full, borderBottomLeftRadius: radius.full, paddingLeft: 18 },
          lastButton: { borderTopRightRadius: radius.full, borderBottomRightRadius: radius.full, paddingRight: 18 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            borderColor: c.outline,
            color: c.onSurface,
            paddingBlock: 8,
            paddingInline: 14,
            gap: 8,
            '&.Mui-selected': {
              backgroundColor: c.secondaryContainer,
              color: c.onSecondaryContainer,
              '&:hover': { backgroundColor: `color-mix(in srgb, ${c.onSecondaryContainer} 8%, ${c.secondaryContainer})` },
            },
          },
        },
      },
      MuiSnackbarContent: { styleOverrides: { root: { borderRadius: radius.tile } } },
      MuiBadge: { styleOverrides: { badge: { fontWeight: 700 } } },
    },
  });
}
