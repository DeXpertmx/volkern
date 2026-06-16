'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, Zap, MessageCircle, Users, BarChart3,
  TrendingUp, Clock, AlertTriangle, Search, FileText,
  Target, Truck, Layers, ShieldCheck, Eye, MapPin,
} from 'lucide-react';

/* ─── Data ────────────────────────────────────────────────────────────────── */

const PAIN_POINTS = [
  { icon: Eye, text: 'Falta de visibilidad en rutas' },
  { icon: Users, text: 'Dificultad para coordinar equipos' },
  { icon: Layers, text: 'Información dispersa' },
  { icon: AlertTriangle, text: 'Errores en entregas' },
  { icon: Clock, text: 'Poco control sobre operaciones' },
];

const CAPABILITIES = [
  'Gestionar rutas y entregas',
  'Coordinar equipos en tiempo real',
  'Centralizar información',
  'Automatizar procesos',
  'Registrar actividad operativa',
  'Integrar dispositivos GPS (en evolución)',
];

const FLOW_STEPS = [
  { number: '1', title: 'Organizas tu operación', description: 'Rutas, vehículos y tareas asignadas', icon: Layers },
  { number: '2', title: 'Ejecutas con control', description: 'Cada movimiento queda registrado', icon: Zap },
  { number: '3', title: 'Supervisas en tiempo real', description: 'Sabes dónde está cada operación', icon: Eye },
  { number: '4', title: 'Optimiza continuamente', description: 'Mejoras eficiencia y reduces errores', icon: TrendingUp },
];

const MODULES = [
  'Gestión de rutas',
  'Gestión de tareas',
  'CRM operativo',
  'Comunicación en tiempo real',
  'Gestión documental',
  'Automatización de procesos',
  'Dashboard logístico',
  'Reportes y analítica',
  'Integración con GPS (en desarrollo / pruebas)',
];

const BENEFITS = [
  { icon: ShieldCheck, text: 'Mayor control operativo' },
  { icon: TrendingUp, text: 'Reducción de errores' },
  { icon: Users, text: 'Mejor coordinación' },
  { icon: Eye, text: 'Visibilidad en tiempo real' },
  { icon: Zap, text: 'Optimización de recursos' },
];

const COMPETITOR_TOOLS = [
  { name: 'Software logístico', price: 60 },
  { name: 'Gestión de tareas', price: 25 },
  { name: 'Comunicación', price: 20 },
  { name: 'Automatización', price: 40 },
  { name: 'Tracking', price: 30 },
];

const TOTAL_COMPETITOR = COMPETITOR_TOOLS.reduce((sum, t) => sum + t.price, 0);

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

export default function LogisticaLanding() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/produccion-portada.png"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/60 to-slate-950/90" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-yellow-600/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-yellow-500/10 text-yellow-400 text-sm font-medium mb-6 border border-yellow-500/20">
              <Truck className="w-4 h-4" />
              Logística
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Controla tu operación logística en tiempo real{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">
                desde un solo sistema
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-4 leading-relaxed">
              Gestiona rutas, vehículos, entregas y comunicación sin perder visibilidad.
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
              Reduce errores y mejora la eficiencia de tu operación.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup">
                <Button size="lg" className="bg-yellow-600 hover:bg-yellow-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-yellow-600/30 group">
                  Activar mi sistema logístico
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

      {/* ═══ PROBLEMA ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-6 border border-red-500/20">El problema</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              La logística sin control se vuelve{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">costosa e ineficiente</span>
            </h2>
            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {PAIN_POINTS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }}
                    className="flex items-center gap-4 p-5 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-red-500/20 transition-colors">
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
                <span className="text-red-300 font-medium">Cuando la operación crece, el caos también.</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ SOLUCIÓN ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-sm font-medium mb-6 border border-yellow-500/20">La solución</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Un sistema centralizado para toda{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">tu operación logística</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">Con Volkern puedes:</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAPABILITIES.map((cap, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-yellow-500/30 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-500/20 transition-colors">
                    <Check className="w-4 h-4 text-yellow-400" />
                  </div>
                  <span className="text-slate-300 font-medium">{cap}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ FLUJO ═══ */}
      <Section id="flow">
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-sm font-medium mb-6 border border-yellow-500/20">Cómo funciona</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Así funciona Volkern{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">en tu logística</span>
            </h2>
            <div className="relative">
              {FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex items-start gap-6 mb-10 last:mb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-yellow-400">{step.number}</span>
                      </div>
                      {i < FLOW_STEPS.length - 1 && <div className="w-0.5 h-10 bg-gradient-to-b from-yellow-500/30 to-slate-800 mt-2" />}
                    </div>
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

      {/* ═══ MÓDULOS ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-sm font-medium mb-6 border border-yellow-500/20">Valor percibido</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Todo lo que <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">incluye Volkern</span></h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((mod, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-yellow-500/20 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-500/20 transition-colors">
                    <Layers className="w-4 h-4 text-yellow-400" />
                  </div>
                  <span className="text-slate-300">{mod}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ BENEFICIOS ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-6 border border-amber-500/20">Beneficios</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Diseñado para operaciones{' '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">en movimiento</span></h2>
            <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-4xl mx-auto">
              {BENEFITS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }}
                    className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-amber-500/20 transition-all duration-300 group">
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

      {/* ═══ BLOQUE DE VALOR ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-sm font-medium mb-6 border border-yellow-500/20">Todo lo que reemplaza Volkern</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">Todo lo que <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">reemplaza Volkern</span></h2>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Herramienta</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Costo/mes</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Con Volkern</span>
              </div>
              {COMPETITOR_TOOLS.map((tool, i) => (
                <motion.div key={tool.name} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 transition-colors">
                  <span className="text-slate-300 font-medium">{tool.name}</span>
                  <span className="text-red-400 text-right font-mono font-semibold">€{tool.price}</span>
                  <span className="text-yellow-400 text-right font-mono font-semibold flex items-center justify-end gap-2"><Check className="w-4 h-4" /> Incluido</span>
                </motion.div>
              ))}
              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-yellow-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR}+</span>
                <span className="text-yellow-400 text-right font-bold text-lg font-mono">€50/mes</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ DIFERENCIAL ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">Visibilidad total</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Visibilidad y trazabilidad de toda{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">tu operación</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-10 leading-relaxed">En Volkern puedes:</p>
            <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {[
                { icon: Eye, title: 'Ver el estado de cada entrega' },
                { icon: ShieldCheck, title: 'Registrar cada acción' },
                { icon: Users, title: 'Coordinar equipos sin fricción' },
                { icon: MapPin, title: 'Integrar tracking en tiempo real' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                    className="p-8 bg-slate-900/50 border border-slate-800 rounded-2xl text-center hover:border-emerald-500/20 transition-colors group">
                    <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-emerald-500/20 transition-colors">
                      <Icon className="w-7 h-7 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">{item.title}</h3>
                  </motion.div>
                );
              })}
            </div>
            <p className="text-center text-slate-400 mt-8 max-w-lg mx-auto">GPS en evolución — tracking real próximo.</p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CONFIANZA ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <Truck className="w-10 h-10 text-yellow-400 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-white mb-4">La logística eficiente depende de control, no de improvisación</h3>
              <div className="space-y-2 text-lg text-slate-300">
                <p>Las empresas que estructuran su operación logística:</p>
                <ul className="inline-block text-left space-y-1">
                  {['reducen costos', 'mejoran tiempos de entrega', 'escalan con control'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CTA ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-yellow-900/40 via-slate-900 to-amber-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Truck className="w-12 h-12 text-yellow-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Empieza a controlar tu operación{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">logística</span>
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto">Centraliza rutas, equipos y entregas en un solo sistema.</p>
              <Link href="/auth/signup">
                <Button size="lg" className="bg-yellow-600 hover:bg-yellow-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-yellow-600/30 group">
                  Activar Volkern Logística
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CIERRE ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Más control.</p>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Menos errores.</p>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-8">Operaciones eficientes.</p>
            <p className="text-lg text-yellow-400 font-medium mb-8">Volkern conecta tu logística en un solo sistema.</p>
            <Link href="/auth/signup">
              <Button size="lg" className="bg-yellow-600 hover:bg-yellow-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-yellow-600/30 group">
                Activar mi sistema logístico
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </Section>
    </>
  );
}
