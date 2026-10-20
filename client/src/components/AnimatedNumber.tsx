import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';

export function AnimatedNumber({
  value,
  format = (n: number) => String(Math.round(n)),
  duration = 0.9,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      from.current = value;
      return undefined;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.05, 0.7, 0.1, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration]);
  return <>{format(display)}</>;
}
