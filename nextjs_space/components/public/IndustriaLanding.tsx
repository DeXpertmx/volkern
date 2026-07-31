'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, Zap, MessageCircle, Users, BarChart3,
  TrendingUp, Clock, AlertTriangle, FileText,
  Factory, Layers, ShieldCheck, Eye, Settings,
  Star, Quote, Cog, PackageSearch, Gauge,
} from 'lucide-react';

/* ─── Data ────────────────────────────────────────────────────────────────── */

const PAIN_POINTS = [
  { icon: Clock, text: 'Procesos manuales y desorganizados' },
  { icon: AlertTriangle, text: 'Falta de seguimiento en tareas' },
  { icon: Layers, text: 'Información dispersa' },
  { icon: TrendingUp, text: 'Errores operativos frecuentes' },
  { icon: Eye, text: 'Difícil trazabilidad' },
];

const CAPABILITIES = [
  'Gestionar procesos operativos',
  'Asignar y controlar tareas',
  'Centralizar documentación',
  'Registrar cada actividad',
  'Coordinar equipos',
  'Tener visibilidad total en tiempo real',
];

const FLOW_STEPS = [
  { number: '1', title: 'Estructuras procesos', description: 'Define tareas, flujos y responsables', icon: Settings },
  { number: '2', title: 'Ejecutas con control', description: 'Cada acción queda registrada', icon: Zap },
  { number: '3', title: 'Supervisas en tiempo real', description: 'Sabes qué está pasando en todo momento', icon: Eye },
  { number: '4', title: 'Optimiza continuamente', description: 'Identificas errores y mejoras procesos', icon: TrendingUp },
];

const MODULES = [
  'Gestión de procesos',
  'Gestión de tareas',
  'CRM interno',
  'Gestión documental',
  'Automatización de flujos',
  'Comunicación interna',
  'Firma digital',
  'Dashboard operativo',
  'Reportes y analítica',
];

const BENEFITS = [
  { icon: ShieldCheck, text: 'Reduces errores' },
  { icon: Zap, text: 'Mejoras eficiencia' },
  { icon: Eye, text: 'Tienes control total' },
  { icon: FileText, text: 'Estandarizas procesos' },
  { icon: BarChart3, text: 'Aumentas productividad' },
];

const USE_CASES = [
  { icon: Cog, title: 'Plantas de producción', desc: 'Controla líneas de producción, asigna tareas y haz seguimiento en tiempo real. Ideal para manufactura.' },
  { icon: PackageSearch, title: 'Empresas de logística', desc: 'Gestiona inventario, envíos y equipos. Trazabilidad completa de cada operación.' },
  { icon: Gauge, title: 'Industria con control de calidad', desc: 'Documenta procesos, registra incidencias y mantén estándares de calidad con trazabilidad total.' },
];

const TESTIMONIALS = [
  { quote: 'Teníamos procesos en papel y Excel. Volkern nos dio control real de la planta. Ahora sabemos qué pasa en cada turno.', name: 'Gonzalo Prieto', role: 'Director de Operaciones, MetalPack', avatar: 'GP' },
  { quote: 'Redujimos los errores operativos un 40% en 3 meses. Tener todo documentado cambió nuestra forma de trabajar.', name: 'Raquel Ibáñez', role: 'Gerente de Planta, TexIndustria', avatar: 'RI' },
  { quote: 'Por €59/mes tenemos gestión de procesos + tareas + documentación. Nuestro ERP antiguo costaba 10 veces más.', name: 'Alberto Serrano', role: 'CEO, Logística Serrano', avatar: 'AS' },
];

const COMPETITOR_TOOLS = [
  { name: 'Gestión de procesos', price: 60 },
  { name: 'Gestión de tareas', price: 25 },
  { name: 'Documentación', price: 30 },
  { name: 'Comunicación interna', price: 20 },
  { name: 'Automatización', price: 40 },
  { name: 'Reporting', price: 30 },
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

export default function IndustriaLanding() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <img src="/industria.png" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950/95" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-orange-600/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-4 border border-orange-500/20">
              <Factory className="w-4 h-4" />
              Ideal para industria y operaciones
            </span>
            <span className="block mb-6">
              <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
                ⚡ 14 días gratis · Sin tarjeta
              </span>
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Controla tu operación industrial{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">
                con procesos claros y centralizados
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-4 leading-relaxed">
              Gestiona tareas, equipos, procesos y documentación desde un solo sistema.
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
              Desde <span className="text-white font-bold">€59/mes</span>. 14 días gratis. Sin tarjeta.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup?vertical=industria">
                <Button size="lg" className="bg-orange-600 hover:bg-orange-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-orange-600/30 group">
                  Probar 14 días gratis
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
              La operación crece…{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">pero el control se pierde</span>
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
                <span className="text-red-300 font-medium">Sin control, la operación se vuelve costosa e ineficiente.</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ SOLUCIÓN ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-6 border border-orange-500/20">La solución</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Un sistema para organizar{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">toda tu operación</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">Con Volkern puedes:</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAPABILITIES.map((cap, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-orange-500/30 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/20 transition-colors">
                    <Check className="w-4 h-4 text-orange-400" />
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
            <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-6 border border-orange-500/20">Cómo funciona</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Así funciona Volkern{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">en tu operación</span>
            </h2>
            <div className="relative">
              {FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex items-start gap-6 mb-10 last:mb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-orange-400">{step.number}</span>
                      </div>
                      {i < FLOW_STEPS.length - 1 && <div className="w-0.5 h-10 bg-gradient-to-b from-orange-500/30 to-slate-800 mt-2" />}
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
            <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-6 border border-orange-500/20">Valor percibido</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Todo lo que <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">incluye Volkern</span></h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((mod, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-orange-500/20 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/20 transition-colors">
                    <Layers className="w-4 h-4 text-orange-400" />
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
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Diseñado para operaciones{' '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">exigentes</span></h2>
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

      {/* ═══ CASOS DE USO ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">¿Para quién es?</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-10">
              Hecho para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">operaciones industriales</span>
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {USE_CASES.map((uc, i) => {
                const Icon = uc.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                    className="p-8 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-blue-500/20 transition-colors group text-center">
                    <div className="w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/20 transition-colors">
                      <Icon className="w-7 h-7 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{uc.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{uc.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ BLOQUE DE VALOR ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-6 border border-orange-500/20">Comparación de costos</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">Todo lo que <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">reemplaza Volkern</span></h2>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Alternativa</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Coste/mes</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Con Volkern</span>
              </div>
              {COMPETITOR_TOOLS.map((tool, i) => (
                <motion.div key={tool.name} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 transition-colors">
                  <span className="text-slate-300 font-medium">{tool.name}</span>
                  <span className="text-red-400 text-right font-mono font-semibold">€{tool.price}</span>
                  <span className="text-orange-400 text-right font-mono font-semibold flex items-center justify-end gap-2"><Check className="w-4 h-4" /> Incluido</span>
                </motion.div>
              ))}
              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-orange-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR}+</span>
                <span className="text-orange-400 text-right font-bold text-lg font-mono">€59/mes</span>
              </div>
            </div>
            <p className="text-center text-slate-500 text-sm mt-4">14 días de prueba gratis. Sin compromiso. Cancela cuando quieras.</p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ TESTIMONIOS ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">Lo que dicen</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-10 text-center">
              Industrias y operaciones{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">ya usan Volkern</span>
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="p-8 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-purple-500/20 transition-colors flex flex-col">
                  <Quote className="w-8 h-8 text-purple-500/30 mb-4 flex-shrink-0" />
                  <p className="text-slate-300 leading-relaxed mb-6 flex-1 italic">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-1 mb-1">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-sm font-bold text-purple-400 flex-shrink-0">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{t.name}</p>
                      <p className="text-slate-500 text-xs">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ DIFERENCIAL ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">Trazabilidad total</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Trazabilidad total{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">de tu operación</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-10 leading-relaxed">En Volkern:</p>
            <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              {[
                { icon: FileText, title: 'Cada tarea queda registrada' },
                { icon: Settings, title: 'Cada proceso tiene seguimiento' },
                { icon: Eye, title: 'Cada acción es visible' },
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
            <p className="text-center text-slate-400 mt-8 max-w-lg mx-auto">Esto permite control real y mejora continua.</p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CONFIANZA ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <ShieldCheck className="w-10 h-10 text-orange-400 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-white mb-4">Las operaciones eficientes no dependen de personas, dependen de sistemas</h3>
              <div className="space-y-2 text-lg text-slate-300">
                <p>Las empresas que estructuran su operación:</p>
                <ul className="inline-block text-left space-y-1">
                  {['reducen costos', 'mejoran calidad', 'escalan con control'].map((item, i) => (
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
            <div className="bg-gradient-to-r from-orange-900/40 via-slate-900 to-red-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Factory className="w-12 h-12 text-orange-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Empieza a operar{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">con control total</span>
              </h2>
              <p className="text-lg text-slate-400 mb-4 max-w-xl mx-auto">
                <span className="text-white font-bold">14 días gratis</span>. Sin tarjeta. Sin compromiso.
              </p>
              <p className="text-slate-500 text-sm mb-10">Luego €59/mes. Incluye procesos, tareas, documentación y más.</p>
              <Link href="/signup?vertical=industria">
                <Button size="lg" className="bg-orange-600 hover:bg-orange-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-orange-600/30 group">
                  Probar 14 días gratis
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
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Menos errores.</p>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Más control.</p>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-8">Mejor operación.</p>
            <p className="text-lg text-orange-400 font-medium mb-8">Volkern convierte tu operación en un sistema eficiente.</p>
            <Link href="/signup?vertical=industria">
              <Button size="lg" className="bg-orange-600 hover:bg-orange-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-orange-600/30 group">
                Probar 14 días gratis
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </Section>
    </>
  );
}
