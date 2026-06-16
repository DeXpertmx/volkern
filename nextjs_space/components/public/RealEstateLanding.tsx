'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, Zap, MessageCircle, Users, BarChart3,
  TrendingUp, Clock, AlertTriangle, Search, CalendarCheck,
  Target, Home, FileSignature, Layers, ShieldCheck,
} from 'lucide-react';

/* ─── Data ────────────────────────────────────────────────────────────────── */

const PAIN_POINTS = [
  { icon: Users, text: 'Leads que no reciben seguimiento' },
  { icon: TrendingUp, text: 'Clientes que se enfrían' },
  { icon: AlertTriangle, text: 'Información dispersa' },
  { icon: Clock, text: 'Procesos manuales' },
  { icon: Layers, text: 'Demasiadas herramientas' },
];

const CAPABILITIES = [
  'Captar y organizar leads automáticamente',
  'Dar seguimiento sin olvidar ningún cliente',
  'Gestionar propiedades y estados',
  'Comunicarte desde un solo sistema',
  'Automatizar procesos de venta',
  'Firmar documentos digitalmente',
];

const FLOW_STEPS = [
  {
    number: '1',
    title: 'Captas leads',
    description: 'Desde web, campañas o formularios',
    icon: Search,
  },
  {
    number: '2',
    title: 'Se organizan automáticamente',
    description: 'Todo entra al CRM sin perder información',
    icon: Layers,
  },
  {
    number: '3',
    title: 'Das seguimiento',
    description: 'Llamadas, mensajes y recordatorios centralizados',
    icon: MessageCircle,
  },
  {
    number: '4',
    title: 'Cierras más ventas',
    description: 'Con procesos claros y sin perder oportunidades',
    icon: TrendingUp,
  },
];

const MODULES = [
  'CRM inmobiliario',
  'Gestión de propiedades',
  'Automatización de seguimiento',
  'Email marketing',
  'Chat en vivo',
  'Telefonía integrada',
  'Firma digital',
  'Gestión de tareas',
  'Dashboard y reportes',
];

const BENEFITS = [
  { icon: Zap, text: 'No pierdes leads' },
  { icon: MessageCircle, text: 'Respondes más rápido' },
  { icon: ShieldCheck, text: 'Mantienes el control' },
  { icon: Clock, text: 'Reduces errores' },
  { icon: BarChart3, text: 'Cierras más operaciones' },
];

const COMPETITOR_TOOLS = [
  { name: 'CRM', price: 50 },
  { name: 'Email marketing', price: 30 },
  { name: 'Chat', price: 20 },
  { name: 'Telefonía', price: 25 },
  { name: 'Automatización', price: 40 },
  { name: 'Firma digital', price: 15 },
];

const TOTAL_COMPETITOR = COMPETITOR_TOOLS.reduce((sum, t) => sum + t.price, 0);

/* ─── Section Wrapper ──────────────────────────────────────────────────────── */

const Section = ({ id, className, children, dark }: { id?: string; className?: string; children: React.ReactNode; dark?: boolean }) => (
  <section id={id} className={`py-20 md:py-28 ${dark ? 'bg-slate-950' : 'bg-slate-900/50'} ${className ?? ''}`}>
    <div className="container mx-auto px-6">{children}</div>
  </section>
);

const FadeIn = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
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

export default function RealEstateLanding() {
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
         HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/real-estate.png"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/60 to-slate-950/90" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-600/15 blur-[140px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
              <Home className="w-4 h-4" />
              Inmobiliarias
            </span>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Cierra más propiedades{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                sin perder clientes en el proceso
              </span>
            </h1>

            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-4 leading-relaxed">
              Centraliza leads, propiedades, seguimiento y comunicación en un solo sistema.
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
              Deja de usar múltiples herramientas y empieza a vender con control.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-emerald-600/30 group">
                  Activar mi sistema inmobiliario
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#flow">
                <Button variant="outline" size="lg" className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white px-10 py-7 text-lg rounded-xl">
                  Ver cómo funciona
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         PROBLEMA (Conexión)
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-6 border border-red-500/20">
              El problema
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Estás perdiendo oportunidades{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">sin darte cuenta</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {PAIN_POINTS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                    className="flex items-center gap-4 p-5 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-red-500/20 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-red-400" />
                    </div>
                    <span className="text-slate-300 font-medium">{p.text}</span>
                  </motion.div>
                );
              })}
            </div>

            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-6 py-3">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-red-300 font-medium">Cada oportunidad perdida es dinero que no vuelve.</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         SOLUCIÓN
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
              La solución
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Todo tu negocio inmobiliario{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">en un solo lugar</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">
              Con Volkern puedes:
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAPABILITIES.map((cap, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-emerald-500/30 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-slate-300 font-medium">{cap}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         FLUJO (Clave para conversión)
      ════════════════════════════════════════════════════════════════════ */}
      <Section id="flow">
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              Cómo funciona
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Así funciona Volkern{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">en tu día a día</span>
            </h2>

            <div className="relative">
              {FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex items-start gap-6 mb-10 last:mb-0"
                  >
                    {/* Number + Connector */}
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-emerald-400">{step.number}</span>
                      </div>
                      {i < FLOW_STEPS.length - 1 && (
                        <div className="w-0.5 h-10 bg-gradient-to-b from-emerald-500/30 to-slate-800 mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-2">
                      <h3 className="text-xl font-bold text-white mb-1">{step.title}</h3>
                      <p className="text-slate-400">{step.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         MÓDULOS (Valor percibido)
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">
              Valor percibido
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Todo lo que{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">incluye</span>
            </h2>

            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((mod, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-purple-500/20 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                    <Layers className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-slate-300">{mod}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         BENEFICIOS (Emoción)
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-6 border border-amber-500/20">
              Beneficios
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Diseñado para vender más,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">no para complicarte</span>
            </h2>

            <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-4xl mx-auto">
              {BENEFITS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                    className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-amber-500/20 transition-all duration-300 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-amber-500/20 transition-colors">
                      <Icon className="w-6 h-6 text-amber-400" />
                    </div>
                    <p className="text-white font-semibold">{b.text}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         BLOQUE DE VALOR — Comparación de costos
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
              Todo lo que reemplaza Volkern
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
              Todo lo que{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">reemplaza Volkern</span>
            </h2>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Herramienta</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Costo/mes</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Con Volkern</span>
              </div>

              {COMPETITOR_TOOLS.map((tool, i) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 transition-colors"
                >
                  <span className="text-slate-300 font-medium">{tool.name}</span>
                  <span className="text-red-400 text-right font-mono font-semibold">€{tool.price}</span>
                  <span className="text-emerald-400 text-right font-mono font-semibold flex items-center justify-end gap-2">
                    <Check className="w-4 h-4" /> Incluido
                  </span>
                </motion.div>
              ))}

              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-emerald-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR}+</span>
                <span className="text-emerald-400 text-right font-bold text-lg font-mono">€50/mes</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         PRUEBA / CONFIANZA
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-white mb-4">
                Centralizar ya no es una opción
              </h3>
              <p className="text-lg text-slate-300 leading-relaxed max-w-lg mx-auto">
                Las inmobiliarias que organizan su operación venden más.
              </p>
              <p className="text-slate-500 mt-2">
                Volkern te da la estructura para hacerlo.
              </p>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CTA FUERTE
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-emerald-900/40 via-slate-900 to-teal-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Home className="w-12 h-12 text-emerald-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Empieza a gestionar tu inmobiliaria{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">como un sistema</span>
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto">
                Todo en un solo lugar. Sin complicaciones.
              </p>
              <Link href="/auth/signup">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-emerald-600/30 group">
                  Activar Volkern para inmobiliarias
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CIERRE
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">
              Deja de perder oportunidades por falta de seguimiento.
            </p>
            <p className="text-xl text-emerald-400 font-semibold">
              Empieza a operar con control, velocidad y claridad.
            </p>
            <div className="mt-8">
              <Link href="/auth/signup">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-emerald-600/30 group">
                  Activar mi sistema inmobiliario
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>
    </>
  );
}
