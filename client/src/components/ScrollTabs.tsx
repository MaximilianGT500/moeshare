import type { ReactNode } from 'react';
import Tabs from '@mui/material/Tabs';
import { useEdgeFade } from '../lib/hooks';

export function ScrollTabs<T extends string>({
  value,
  onChange,
  label,
  children,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  children: ReactNode;
}) {
  const fade = useEdgeFade<HTMLDivElement>();
  return (
    <Tabs
      value={value}
      onChange={(_event, next: T) => onChange(next)}
      aria-label={label}
      variant="scrollable"
      scrollButtons={false}
      slotProps={{ scroller: { ref: fade.ref, onScroll: fade.onScroll, style: fade.style } }}
    >
      {children}
    </Tabs>
  );
}
