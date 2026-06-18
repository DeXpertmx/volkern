'use client';

import { useRef, useEffect, useState } from 'react';
import { useInView } from 'framer-motion';

export default function CountUp({
  target,
  suffix = '',
  prefix = '',
}: {
  target: number;
  suffix?: string;
  prefix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const durationMs = 2000;
    const stepMs = 16;
    const increment = target / (durationMs / stepMs);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, stepMs);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {count.toLocaleString('es-ES')}
      {suffix}
    </span>
  );
}
