'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useInView,
} from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Check,
  TrendingUp,
  Users,
  Building2,
  Calculator,
  PenTool,
  GraduationCap,
  Factory,
  UserCheck,
  Zap,
  Sparkles,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { SOLUTION_MODULES, COLOR_MAP } from '@/lib/soluciones';
import BackToTop from '@/components/public/BackToTop';
import FloatingParticles from '@/components/public/FloatingParticles';

/* ─── TypewriterText ──────────────────────────────────────────────────────── */

/**
 * Scroll-triggered typewriter effect.
 * Types text character by character when the element enters the viewport.
 * For the Hero (above the fold), set heroMode to start immediately.
 */
function TypewriterText({
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

/* ─── CountUp ─────────────────────────────────────────────────────────────── */

function CountUp({
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

/* ─── Data ────────────────────────────────────────────────────────────────── */

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Zap,
  PenTool,
  Building2,
  Calculator,
  UserCheck,
  Factory,
  GraduationCap,
};

const BENEFITS = [
  'Un solo sistema para todo',
  'Menos herramientas externas',
  'Mayor control del negocio',
  'Automatización entre áreas',
  'Escalabilidad real',
];

const STATS = [
  { target: 500, suffix: '+', label: 'Empresas activas', icon: Users },
  { target: 7, suffix: '', label: 'Módulos integrados', icon: Layers },
  { target: 24, suffix: '/7', label: 'Soporte continuo', icon: Zap },
];

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Comienzas con lo que necesitas hoy',
    description: 'Puedes iniciar con CRM y ventas. Sin compromiso, sin complejidad innecesaria.',
    icon: Zap,
  },
  {
    step: '2',
    title: 'Escalas sin cambiar de sistema',
    description: 'Agregas módulos conforme crece tu operación. Todo sobre la misma base.',
    icon: TrendingUp,
  },
  {
    step: '3',
    title: 'Todo conectado',
    description: 'La información fluye entre áreas sin duplicación ni pérdida de datos.',
    icon: Layers,
  },
];



/* ─── Section wrapper ─────────────────────────────────────────────────────── */

const Section = ({
  id,
  dark,
  className,
  children,
}: {
  id?: string;
  dark?: boolean;
  className?: string;
  children: React.ReactNode;
}) => (
  <section
    id={id}
    className={`py-20 md:py-28 ${dark ? 'bg-slate-950' : 'bg-slate-900/50'} ${className ?? ''}`}
  >
    <div className="container mx-auto px-6">{children}</div>
  </section>
);

const FadeIn = ({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.6, delay, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

/* ─── TimelineSection ─────────────────────────────────────────────────────── */

function TimelineSection() {
  const lineRef = useRef<HTMLDivElement>(null);
  const lineInView = useInView(lineRef, { once: true, margin: '-80px' });

  return (
    <div className="relative">
      {/* Animated connector line — draws from left to right */}
      <div ref={lineRef} className="hidden md:block absolute top-10 left-[15%] right-[15%] h-px overflow-hidden">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={lineInView ? { scaleX: 1 } : {}}
          transition={{ duration: 1.2, delay: 0.3, ease: 'easeInOut' }}
          className="h-full bg-gradient-to-r from-blue-500/40 via-purple-500/40 to-emerald-500/40 origin-left"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {[
          {
            step: 'Fase 1',
            title: 'CRM y Ventas',
            description:
              'Un cliente inicia con CRM para gestionar sus oportunidades. Automatiza seguimiento, cierra más negocios y organiza su pipeline.',
            icon: Zap,
            color: COLOR_MAP.blue,
          },
          {
            step: 'Fase 2',
            title: 'Marketing integrado',
            description:
              'Luego agrega marketing para captar más leads. Campañas automatizadas que se conectan directamente con el CRM.',
            icon: PenTool,
            color: COLOR_MAP.purple,
          },
          {
            step: 'Fase 3',
            title: 'Operaciones completas',
            description:
              'Después integra facturación, firma digital y más. Escala sin caos, con todos los datos conectados desde el día uno.',
            icon: Layers,
            color: COLOR_MAP.emerald,
          },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{
                type: 'spring',
                stiffness: 100,
                damping: 14,
                delay: i * 0.2,
              }}
              className="relative p-6 bg-slate-950 border border-slate-800 rounded-3xl hover:border-blue-500/20 transition-colors duration-300"
            >
              {/* Animated dot on the timeline — pulses when entering viewport */}
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 15,
                  delay: 0.5 + i * 0.25,
                }}
                className="hidden md:flex absolute -top-[22px] left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-slate-950 border-2 border-blue-500 items-center justify-center"
              >
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.3, 1] }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    delay: i * 0.3,
                    ease: 'easeInOut',
                  }}
                  className="w-2 h-2 rounded-full bg-blue-500"
                />
              </motion.div>

              <span
                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.color.badge} mb-4`}
              >
                {item.step}
              </span>

              <div
                className={`w-10 h-10 rounded-xl ${item.color.bg} border ${item.color.border} flex items-center justify-center mb-4`}
              >
                <Icon className={`w-5 h-5 ${item.color.icon}`} />
              </div>

              <h3 className="text-white font-bold text-base mb-2">
                {item.title}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function EcosistemaLanding() {
  /* ─── Parallax scroll tracking ─────────────────────────────────────────── */
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const orbY1 = useTransform(scrollYProgress, [0, 1], [0, -180]);
  const orbY2 = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const orbY3 = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const gridY = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const contentY = useTransform(scrollYProgress, [0, 0.7], [0, 60]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0.4]);

  /* ─── Back to top visibility ───────────────────────────────────────────── */

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
         HERO — con parallax
      ════════════════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950"
      >
        {/* Parallax background orbs */}
        <motion.div
          style={{ y: orbY1 }}
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/15 blur-[140px] rounded-full pointer-events-none"
        />
        <motion.div
          style={{ y: orbY2 }}
          className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none"
        />
        <motion.div
          style={{ y: orbY3 }}
          className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-emerald-600/8 blur-[100px] rounded-full pointer-events-none"
        />

        {/* Parallax grid pattern */}
        <motion.div
          style={{
            y: gridY,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
          className="absolute inset-0 opacity-[0.03]"
        />

        {/* Floating glowing particles */}
        <FloatingParticles />

        {/* Content with subtle parallax + fade */}
        <motion.div
          style={{ y: contentY, opacity: contentOpacity }}
          className="container mx-auto px-6 relative z-10 text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              <Layers className="w-4 h-4" />
              Ecosistema Volkern
            </span>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              <TypewriterText
                text="Un solo sistema para gestionar y automatizar\ntodo tu negocio"
                speed={42}
                heroMode
              />
            </h1>

            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Volkern conecta todas las áreas de tu empresa en una sola
              plataforma: ventas, marketing, operaciones y más.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/precios">
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group"
                >
                  Activar sistema
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#modulos">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white px-10 py-7 text-lg rounded-xl"
                >
                  <Sparkles className="mr-2 w-5 h-5" />
                  Explorar soluciones
                </Button>
              </a>
            </div>
          </motion.div>

          {/* Floating module cards preview */}
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 40 }}
            transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
            className="mt-16 relative max-w-4xl mx-auto hidden md:block"
          >
            <div className="grid grid-cols-4 gap-3 opacity-60">
              {SOLUTION_MODULES.slice(0, 4).map((mod, i) => {
                const Icon = ICON_MAP[mod.iconKey];
                const c = COLOR_MAP[mod.color];
                return (
                  <motion.div
                    key={mod.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className={`p-4 rounded-2xl ${c.bg} border ${c.border} text-center`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center mx-auto mb-2`}>
                      <Icon className={`w-4 h-4 ${c.icon}`} />
                    </div>
                    <p className="text-[11px] font-black text-slate-300 uppercase tracking-tight">
                      {mod.name}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         VISIÓN GENERAL
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              Visión general
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              <TypewriterText text="Deja de usar múltiples herramientas desconectadas" speed={35} />
            </h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              Con Volkern puedes comenzar con un módulo y escalar a un ecosistema
              completo conforme crece tu negocio. Sin migraciones. Sin fricción.
            </p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         STATS BAR — animated counters
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-6">
            {STATS.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{
                    type: 'spring',
                    stiffness: 80,
                    damping: 14,
                    delay: i * 0.15,
                  }}
                  className="text-center p-8 rounded-3xl bg-slate-900/40 border border-slate-800 hover:border-blue-500/20 transition-colors duration-500"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <p className="text-4xl md:text-5xl font-black text-white mb-1">
                    <CountUp
                      target={stat.target}
                      suffix={stat.suffix}
                    />
                  </p>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {stat.label}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         ESTRUCTURA DEL ECOSISTEMA — Grid de módulos
      ════════════════════════════════════════════════════════════════════ */}
      <Section id="modulos">
        <FadeIn>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
                Estructura del ecosistema
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                <TypewriterText text="Todos los módulos. Una sola plataforma." speed={35} />
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                Cada área de tu negocio tiene su espacio, pero toda la información
                está conectada de forma nativa.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Large card: CRM & Ventas (spans 2 cols on lg) */}
              {/*
                Column-based stagger (lg: CRM spans cols 0-1):
                  Row 0: CRM(col 0-1) | Marketing(col 2) | Real Estate(col 3)
                  Row 1: Accounting(col 0) | RRHH(col 1) | Industria(col 2) | Academy(col 3)
                delay = col * 0.10 + row * 0.06  → appears by column, top-to-bottom
              */}
              {SOLUTION_MODULES.map((mod, i) => {
                const Icon = ICON_MAP[mod.iconKey];
                const c = COLOR_MAP[mod.color];
                const isLarge = i === 0;
                // lg column & row for this index (4-col grid, CRM spans cols 0-1)
                const col = [0, 2, 3, 0, 1, 2, 3][i];
                const row = [0, 0, 0, 1, 1, 1, 1][i];
                const staggerDelay = col * 0.10 + row * 0.06;
                return (
                  <motion.div
                    key={mod.name}
                    initial={{ opacity: 0, y: 40, scale: 0.92 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: '-60px' }}
                    whileHover={{
                      y: -6,
                      scale: 1.03,
                      transition: { type: 'spring', stiffness: 300, damping: 20 },
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 100,
                      damping: 14,
                      delay: staggerDelay,
                    }}
                    className={`group relative p-6 rounded-3xl border ${c.border} bg-slate-900/40 hover:bg-slate-900/80 transition-all duration-300 ${
                      isLarge ? 'lg:col-span-2' : ''
                    }`}
                  >
                    {/* Subtle glow on hover */}
                    <div className={`absolute inset-0 rounded-3xl ${c.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

                    <div className="relative z-10">
                      <div
                        className={`w-12 h-12 rounded-2xl ${c.bg} border ${c.border} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                      >
                        <Icon className={`w-6 h-6 ${c.icon}`} />
                      </div>

                      <h3 className="text-white font-bold text-lg mb-2">
                        {mod.name}
                      </h3>
                      <p className="text-sm text-slate-400 leading-relaxed mb-5">
                        {mod.description}
                      </p>

                      <Link
                        href={mod.href}
                        className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest ${c.icon} hover:underline underline-offset-4`}
                      >
                        Explorar
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CÓMO FUNCIONA — 3 pasos
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark id="como-funciona">
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
                Cómo funciona
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                <TypewriterText text="Escala sin cambiar de sistema" speed={35} />
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                Tres pasos para transformar tu operación sin fricción.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {HOW_IT_WORKS.map((item, i) => {
                const IconEl = item.icon;
                return (
                  <motion.div
                    key={item.step}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.15 }}
                    className="relative p-8 bg-slate-950 border border-slate-800 rounded-3xl text-center group hover:border-blue-500/30 transition-colors duration-300"
                  >
                    {/* Step number badge */}
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shadow-lg shadow-blue-600/30">
                      {item.step}
                    </div>

                    {/* Connector line between steps */}
                    {i < HOW_IT_WORKS.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-px bg-slate-800" />
                    )}

                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5 mt-2 group-hover:bg-blue-500/20 transition-colors">
                      <IconEl className="w-7 h-7 text-blue-400" />
                    </div>

                    <h3 className="text-white font-bold text-lg mb-2">
                      {item.title}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CASO DE USO — timeline horizontal animado
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
                Caso de uso
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                <TypewriterText text="Crece sin cambiar de sistema" speed={35} />
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                Así escala una empresa real con Volkern.
              </p>
            </div>

            {/* Horizontal timeline with animated line */}
            <TimelineSection />
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         BENEFICIOS + DIFERENCIAL
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Beneficios */}
            <FadeIn>
              <div>
                <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
                  Beneficios del ecosistema
                </span>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">
                  <TypewriterText text="Menos herramientas. Más control." speed={35} />
                </h2>

                <div className="space-y-4">
                  {BENEFITS.map((benefit, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 30, scale: 0.96 }}
                      whileInView={{ opacity: 1, y: 0, scale: 1 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{
                        type: 'spring',
                        stiffness: 120,
                        damping: 14,
                        delay: i * 0.12,
                      }}
                      className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-blue-500/20 transition-colors"
                    >
                      <motion.div
                        initial={{ scale: 0, rotate: -90 }}
                        whileInView={{ scale: 1, rotate: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{
                          type: 'spring',
                          stiffness: 200,
                          damping: 15,
                          delay: i * 0.12 + 0.15,
                        }}
                        className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0"
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                      </motion.div>
                      <span className="text-sm font-medium text-slate-200">
                        {benefit}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </FadeIn>

            {/* Diferencial */}
            <FadeIn delay={0.2}>
              <div className="lg:pt-12">
                <div className="p-8 rounded-3xl bg-gradient-to-br from-blue-900/30 via-slate-900 to-purple-900/30 border border-slate-800 relative overflow-hidden">
                  {/* Glow */}
                  <div className="absolute -top-20 -right-20 w-60 h-60 bg-blue-600/10 blur-[80px] rounded-full pointer-events-none" />

                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
                      <Sparkles className="w-6 h-6 text-blue-400" />
                    </div>

                    <h3 className="text-2xl font-bold text-white mb-4">
                      Volkern no es solo un software
                    </h3>

                    <p className="text-slate-300 leading-relaxed mb-6">
                      Es una{' '}
                      <span className="text-white font-semibold">
                        infraestructura digital
                      </span>{' '}
                      para operar tu negocio de forma eficiente. Mientras otras
                      plataformas te obligan a conectar herramientas externas,
                      Volkern te da todo integrado de fábrica.
                    </p>

                    <div className="flex items-center gap-2 text-sm text-blue-400 font-medium">
                      <Users className="w-4 h-4" />
                      <span>
                        <CountUp target={500} prefix="+" /> empresas ya confían en Volkern
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CTA
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-indigo-900/40 border border-slate-800 rounded-3xl p-12 md:p-16 relative overflow-hidden">
              {/* Glow effects */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

              <div className="relative z-10">
                <Sparkles className="w-14 h-14 text-blue-400 mx-auto mb-6" />

                <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  <TypewriterText text="Empieza con el módulo que necesitas hoy" speed={35} />
                </h2>

                <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
                  Y escala a un ecosistema completo cuando tu negocio lo necesite.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/soluciones">
                    <Button
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group"
                    >
                      Explorar soluciones
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                  <Link href="/precios">
                    <Button
                      variant="outline"
                      size="lg"
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white px-10 py-7 text-lg rounded-xl"
                    >
                      Activar sistema
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         BACK TO TOP
      ════════════════════════════════════════════════════════════════════ */}
      <BackToTop />

      {/* ═══════════════════════════════════════════════════════════════════
         CIERRE
      ════════════════════════════════════════════════════════════════════ */}
      <div className="py-14 bg-slate-950 border-t border-slate-900">
        <div className="container mx-auto px-6 text-center">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-xl md:text-2xl text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed"
          >
            Tu negocio no necesita más herramientas.{' '}
            <br />
            <span className="text-white font-bold">
              Necesita un sistema que conecte todo.
            </span>
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 font-bold">
              Ese sistema es Volkern.
            </span>
          </motion.p>
        </div>
      </div>
    </>
  );
}
