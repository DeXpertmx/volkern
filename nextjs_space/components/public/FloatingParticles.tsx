'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Subtle floating glowing particles for hero backgrounds.
 * 16 randomized dots that float upward with parallax, drift, and opacity pulse.
 * Uses pointer-events-none so it never interferes with clicks.
 */
export default function FloatingParticles() {
  // Generate stable random particles on first render
  const [particles] = useState(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      // Random position within the viewport
      x: Math.random() * 100,
      y: Math.random() * 100,
      // Random size (2-6px)
      size: 2 + Math.random() * 4,
      // Random opacity (0.1-0.35)
      opacity: 0.1 + Math.random() * 0.25,
      // Random duration for float animation (12-28s)
      duration: 12 + Math.random() * 16,
      // Random horizontal drift range (-40 to +40 vw)
      drift: -40 + Math.random() * 80,
      // Staggered start
      delay: Math.random() * 8,
      // Color tint: mostly blue, some purple, some emerald (hex values for glow)
      color:
        i < 10
          ? '#93C5FD'
          : i < 14
            ? '#C4B5FD'
            : '#6EE7B7',
    }))
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: p.opacity,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          }}
          animate={{
            y: ['0vh', '-120vh'],
            x: [`${p.x}%`, `${p.x + p.drift}%`],
            opacity: [p.opacity, p.opacity * 0.3, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}
