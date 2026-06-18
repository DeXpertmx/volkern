'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useInView } from 'framer-motion';

/**
 * Scroll-triggered typewriter effect.
 * Types text character by character when the element enters the viewport.
 * For above-the-fold elements (Hero), set `heroMode` to start immediately.
 */
export default function TypewriterText({
  text,
  speed = 40,
  className = '',
  cursorColor = 'bg-blue-400',
  heroMode = false,
}: {
  text: string;
  speed?: number;
  className?: string;
  cursorColor?: string;
  heroMode?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const started = heroMode || inView;
  const [displayed, setDisplayed] = useState('');

  // Type character by character once in view
  useEffect(() => {
    if (!started) return;
    if (displayed.length >= text.length) return;
    const t = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, speed);
    return () => clearTimeout(t);
  }, [started, displayed, text, speed]);

  const done = displayed.length >= text.length;
  const lines = displayed.split('\n');

  return (
    <span ref={ref} className={className}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </React.Fragment>
      ))}
      {!done && (
        <span
          className={`inline-block w-[3px] h-[0.85em] ${cursorColor} ml-1 align-middle animate-pulse`}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
