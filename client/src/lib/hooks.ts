import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height ?? 0;
      setHeight((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

export function useInView(onHit: () => void, enabled: boolean, rootMargin = '800px') {
  const ref = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onHit);
  callback.current = onHit;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);
  return ref;
}

export const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

export function useHotkey(
  key: string,
  handler: (event: KeyboardEvent) => void,
  { enabled = true, allowInInputs = false }: { enabled?: boolean; allowInInputs?: boolean } = {}
) {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== key || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!allowInInputs && isTypingTarget(event.target)) return;
      saved.current(event);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, enabled, allowInInputs]);
}

export function useNow(interval = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

export function useEdgeFade<T extends HTMLElement>(fade = 36) {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onScroll();
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [onScroll]);

  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'}, #000 ${edges.start ? fade : 0}px, #000 calc(100% - ${edges.end ? fade : 0}px), ${edges.end ? 'transparent' : '#000'})`
      : undefined;
  const style = mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined;
  return { ref, onScroll, style };
}
