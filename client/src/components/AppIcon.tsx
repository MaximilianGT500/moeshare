import { useId } from 'react';

export const APP_ICON_GRADIENT = ['#67e8f9', '#0e7490'] as const;

export function AppIcon({ size = 40, title }: { size?: number | string; title?: string }) {
  const id = `app-icon-${useId().replace(/:/g, '')}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={APP_ICON_GRADIENT[0]} />
          <stop offset="1" stopColor={APP_ICON_GRADIENT[1]} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 41.5 V27.5 L19 14 L27.5 21 H36.5 L45 14 L47.5 27.5 V41.5 C47.5 46.7 43.2 51 38 51 H26 C20.8 51 16.5 46.7 16.5 41.5 Z" />
        <path d="M32 43 V29.5" />
        <path d="M25.8 35.5 L32 29.3 L38.2 35.5" />
      </g>
    </svg>
  );
}
