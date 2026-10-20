const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = HEX.exec(String(value).trim());
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  return `#${hex}`;
}

export function meaningfulColor(value: string | null | undefined): string | null {
  const hex = normalizeHex(value);
  if (!hex || hex === '#ffffff') return null;
  return hex;
}

export const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

export function hueFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}
