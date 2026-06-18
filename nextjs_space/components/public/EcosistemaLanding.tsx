'use client';

import React from 'react';
import { motion } from 'framer-motion';
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

/* ─── Data ────────────────────────────────────────────────────────────────── */

const ECOSYSTEM_MODULES = [
  {
    icon: Zap,
    color: 'blue',
    name: 'CRM & Ventas',
    description: 'Gestiona oportunidades, automatiza seguimiento y cierra más negocios.',
    href: '/soluciones/crm-ventas',
  },
  {
    icon: PenTool,
    color: 'purple',
    name: 'Marketing',
    description: 'Captación de leads, automatización de campañas y gestión de comunicación.',
    href: '/soluciones/marketing',
  },
  {
    icon: Building2,
    color: 'emerald',
    name: 'Real Estate',
    description: 'Gestión de propiedades, clientes y procesos comerciales inmobiliarios.',
    href: '/soluciones/real-estate',
  },
  {
    icon: Calculator,
    color: 'amber',
    name: 'Accounting',
    description: 'Control financiero, facturación y organización administrativa.',
    href: '/soluciones/accounting',
  },
  {
    icon: UserCheck,
    color: 'rose',
    name: 'Recursos Humanos',
    description: 'Gestión de personal, procesos internos y seguimiento organizacional.',
    href: '/soluciones/rrhh',
  },
  {
    icon: Factory,
    color: 'slate',
    name: 'Industria',
    description: 'Optimización de procesos operativos y control de producción.',
    href: '/soluciones/industria',
  },
  {
    icon: GraduationCap,
    color: 'yellow',
    name: 'Academy',
    description: 'Formación, gestión de contenido y capacitación interna o externa.',
    href: '/soluciones/academy',
  },
];

const BENEFITS = [
  'Un solo sistema para todo',
  'Menos herramientas externas',
  'Mayor control del negocio',
  'Automatización entre áreas',
  'Escalabilidad real',
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

/* ─── Color helpers ───────────────────────────────────────────────────────── */

const colorMap: Record<string, { bg: string; border: string; icon: string; glow: string; badge: string }> = {
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20 hover:border-blue-500/40', icon: 'text-blue-400', glow: 'bg-blue-500/5', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20 hover:border-purple-500/40', icon: 'text-purple-400', glow: 'bg-purple-500/5', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20 hover:border-emerald-500/40', icon: 'text-emerald-400', glow: 'bg-emerald-500/5', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20 hover:border-amber-500/40', icon: 'text-amber-400', glow: 'bg-amber-500/5', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/20 hover:border-rose-500/40', icon: 'text-rose-400', glow: 'bg-rose-500/5', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  slate: { bg: 'bg-slate-500/10', border: 'border-slate-500/20 hover:border-slate-500/40', icon: 'text-slate-400', glow: 'bg-slate-500/5', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20 hover:border-yellow-500/40', icon: 'text-yellow-400', glow: 'bg-yellow-500/5', badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
};

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

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function EcosistemaLanding() {
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
         HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        {/* Animated background orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-emerald-600/8 blur-[100px] rounded-full pointer-events-none" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className="container mx-auto px-6 relative z-10 text-center">
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
              Un solo sistema para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-500">
                gestionar y automatizar
              </span>
              <br />
              todo tu negocio
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
              {ECOSYSTEM_MODULES.slice(0, 4).map((mod, i) => {
                const Icon = mod.icon;
                const c = colorMap[mod.color];
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
        </div>
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
              Deja de usar múltiples{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                herramientas desconectadas
              </span>
            </h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              Con Volkern puedes comenzar con un módulo y escalar a un ecosistema
              completo conforme crece tu negocio. Sin migraciones. Sin fricción.
            </p>
          </div>
        </FadeIn>
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
                Todos los módulos.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                  Una sola plataforma.
                </span>
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                Cada área de tu negocio tiene su espacio, pero toda la información
                está conectada de forma nativa.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Large card: CRM & Ventas (spans 2 cols on lg) */}
              {ECOSYSTEM_MODULES.map((mod, i) => {
                const Icon = mod.icon;
                const c = colorMap[mod.color];
                const isLarge = i === 0;
                return (
                  <motion.div
                    key={mod.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
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
                Escala sin cambiar de sistema
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
         CASO DE USO — timeline horizontal
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
                Caso de uso
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Crece sin{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                  cambiar de sistema
                </span>
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                Así escala una empresa real con Volkern.
              </p>
            </div>

            {/* Horizontal timeline */}
            <div className="relative">
              {/* Line connector */}
              <div className="hidden md:block absolute top-10 left-[15%] right-[15%] h-px bg-gradient-to-r from-blue-500/40 via-purple-500/40 to-emerald-500/40" />

              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    step: 'Fase 1',
                    title: 'CRM y Ventas',
                    description:
                      'Un cliente inicia con CRM para gestionar sus oportunidades. Automatiza seguimiento, cierra más negocios y organiza su pipeline.',
                    icon: Zap,
                    color: colorMap.blue,
                  },
                  {
                    step: 'Fase 2',
                    title: 'Marketing integrado',
                    description:
                      'Luego agrega marketing para captar más leads. Campañas automatizadas que se conectan directamente con el CRM.',
                    icon: PenTool,
                    color: colorMap.purple,
                  },
                  {
                    step: 'Fase 3',
                    title: 'Operaciones completas',
                    description:
                      'Después integra facturación, firma digital y más. Escala sin caos, con todos los datos conectados desde el día uno.',
                    icon: Layers,
                    color: colorMap.emerald,
                  },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.step}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.15 }}
                      className="relative p-6 bg-slate-950 border border-slate-800 rounded-3xl hover:border-blue-500/20 transition-colors duration-300"
                    >
                      {/* Dot on the timeline */}
                      <div className="hidden md:flex absolute -top-[22px] left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-slate-950 border-2 border-blue-500 items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      </div>

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
                  Menos herramientas.{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                    Más control.
                  </span>
                </h2>

                <div className="space-y-4">
                  {BENEFITS.map((benefit, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: i * 0.1 }}
                      className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-blue-500/20 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
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
                      <span>+500 empresas ya confían en Volkern</span>
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
                  Empieza con el módulo{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                    que necesitas hoy
                  </span>
                </h2>

                <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
                  Y escala a un ecosistema completo cuando tu negocio lo necesite.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/#modulos">
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
