'use client';

import React from 'react';
import { motion, type Variants } from 'framer-motion';

/* ─── Types ───────────────────────────────────────────────────────────────── */

export type RevealVariant =
  | 'fadeIn'
  | 'fadeInUp'
  | 'fadeInUpScale'
  | 'fadeInLeft'
  | 'fadeInRight'
  | 'scalePop';

/** HTML elements that ScrollReveal can render as */
export type RevealAs =
  | 'div'
  | 'section'
  | 'li'
  | 'p'
  | 'span'
  | 'article'
  | 'header'
  | 'footer'
  | 'main'
  | 'aside'
  | 'nav';

interface ScrollRevealProps {
  children: React.ReactNode;
  /** Animation variant. Default: 'fadeIn' */
  variant?: RevealVariant;
  /** HTML element to render as. Default: 'div' */
  as?: RevealAs;
  /** Delay in seconds before animation starts */
  delay?: number;
  /** Use spring physics instead of ease-based transition */
  spring?: boolean;
  /** Spring stiffness (default: 100) */
  stiffness?: number;
  /** Spring damping (default: 14) */
  damping?: number;
  /** Custom viewport margin for intersection observer */
  viewportMargin?: string;
  /** Additional CSS classes on the motion wrapper */
  className?: string;
}

/* ─── Variant presets ─────────────────────────────────────────────────────── */

const variantMap: Record<RevealVariant, Variants> = {
  fadeIn: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0 },
  },
  fadeInUp: {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
  },
  fadeInUpScale: {
    hidden: { opacity: 0, y: 40, scale: 0.92 },
    visible: { opacity: 1, y: 0, scale: 1 },
  },
  fadeInLeft: {
    hidden: { opacity: 0, x: -30 },
    visible: { opacity: 1, x: 0 },
  },
  fadeInRight: {
    hidden: { opacity: 0, x: 30 },
    visible: { opacity: 1, x: 0 },
  },
  scalePop: {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
  },
};

/* ─── Component ───────────────────────────────────────────────────────────── */

/**
 * Scroll-triggered reveal animation.
 *
 * Wraps children in a motion element (default `<div>`) that animates in
 * when entering the viewport (once, with configurable margin).
 *
 * @example
 * // Basic fade-in
 * <ScrollReveal><Section /></ScrollReveal>
 *
 * // Render as a semantic element
 * <ScrollReveal as="section"><Content /></ScrollReveal>
 *
 * // Spring fade-up with delay
 * <ScrollReveal variant="fadeInUp" delay={0.2} spring><Card /></ScrollReveal>
 *
 * // Staggered list — compute delay from index
 * {items.map((item, i) => (
 *   <ScrollReveal key={i} variant="fadeInUpScale" delay={i * 0.12} spring as="li">
 *     <Card />
 *   </ScrollReveal>
 * ))}
 */
export default function ScrollReveal({
  children,
  variant = 'fadeIn',
  as: Tag = 'div',
  delay = 0,
  spring = false,
  stiffness = 100,
  damping = 14,
  viewportMargin = '-80px',
  className,
}: ScrollRevealProps) {
  const variants = variantMap[variant];

  const transition = spring
    ? { type: 'spring' as const, stiffness, damping, delay }
    : { duration: variant === 'fadeIn' ? 0.6 : 0.4, delay, ease: 'easeOut' as const };

  const MotionTag = motion[Tag] as typeof motion.div;

  return (
    <MotionTag
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: viewportMargin }}
      transition={transition}
      className={className}
    >
      {children}
    </MotionTag>
  );
}
