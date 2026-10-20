import { Blend, Hct, SchemeContent, TonalPalette, argbFromHex, hexFromArgb, type DynamicScheme } from '@material/material-color-utilities';
import { normalizeHex } from '../lib/color';

export interface M3Tokens {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;
  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  scrim: string;
  shadow: string;
}

const ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'surface',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'onSurface',
  'onSurfaceVariant',
  'outline',
  'outlineVariant',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'scrim',
  'shadow',
] as const;

function customGroup(designHex: string, sourceArgb: number, dark: boolean) {
  const palette = TonalPalette.fromInt(Blend.harmonize(argbFromHex(designHex), sourceArgb));
  const tone = (t: number) => hexFromArgb(palette.tone(t));
  return dark
    ? { color: tone(80), on: tone(20), container: tone(30), onContainer: tone(90) }
    : { color: tone(40), on: tone(100), container: tone(90), onContainer: tone(10) };
}

const BRAND_SEED = '#8b5cf6';

export function buildScheme(seedHex: string, dark: boolean): M3Tokens {
  const seed = normalizeHex(seedHex) || BRAND_SEED;
  const sourceArgb = argbFromHex(seed);
  const scheme: DynamicScheme = new SchemeContent(Hct.fromInt(sourceArgb), dark, 0);
  const tokens = {} as Record<(typeof ROLES)[number], string>;
  for (const role of ROLES) tokens[role] = hexFromArgb(scheme[role]);

  const success = customGroup('#2e9d58', sourceArgb, dark);
  const warning = customGroup('#c98a00', sourceArgb, dark);

  return {
    ...tokens,
    success: success.color,
    onSuccess: success.on,
    successContainer: success.container,
    onSuccessContainer: success.onContainer,
    warning: warning.color,
    onWarning: warning.on,
    warningContainer: warning.container,
    onWarningContainer: warning.onContainer,
  };
}

export const FILE_TYPE_COLORS = {
  dark: { image: '#9085e9', video: '#199e70', audio: '#d95926', other: '#8a8494' },
  light: { image: '#6250d6', video: '#1baf7a', audio: '#eb6834', other: '#8f8a97' },
} as const;
