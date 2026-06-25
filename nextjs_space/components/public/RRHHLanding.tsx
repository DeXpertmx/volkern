'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, Zap, MessageCircle, Users, BarChart3,
  TrendingUp, Clock, AlertTriangle, FileText,
  UserCheck, FileSignature, Layers, ShieldCheck, History,
  Star, Quote, Building, ClipboardCheck, UserPlus,
} from 'lucide-react';

/* ─── Data ────────────────────────────────────────────────────────────────── */

const PAIN_POINTS = [
  { icon: Layers, text: 'Información de empleados dispersa' },
  { icon: Clock, text: 'Procesos manuales y desorganizados' },
  { icon: AlertTriangle, text: 'Falta de seguimiento' },
  { icon: FileText, text: 'Documentos difíciles de controlar' },
  { icon: MessageCircle, text: 'Comunicación fragmentada' },
];

const CAPABILITIES = [
  'Gestionar empleados y perfiles',
  'Centralizar documentos laborales',
  'Automatizar procesos internos',
  'Controlar tareas y seguimiento',
  'Registrar comunicación',
  'Firmar documentos digitalmente',
];

const FLOW_STEPS = [
  { number: '1', title: 'Centralizas tu equipo', description: 'Toda la información en un solo lugar', icon: Users },
  { number: '2', title: 'Organizas procesos', description: 'Onboarding, tareas y seguimiento estructurado', icon: FileText },
  { number: '3', title: 'Automatizas tareas', description: 'Menos trabajo manual, más eficiencia', icon: Zap },
  { number: '4', title: 'Mantienes control total', description: 'Todo queda registrado y accesible', icon: ShieldCheck },
];

const MODULES = [
  'Gestión de empleados',
  'CRM interno',
  'Gestión documental',
  'Automatización de procesos',
  'Chat y comunicación',
  'Email integrado',
  'Firma digital',
  'Gestión de tareas',
  'Dashboard y reportes',
];

const BENEFITS = [
  { icon: ShieldCheck, text: 'Evitas desorganización interna' },
  { icon: Clock, text: 'Ahorra tiempo en procesos' },
  { icon: MessageCircle, text: 'Mejoras la comunicación' },
  { icon: Users, text: 'Tienes control total del equipo' },
  { icon: TrendingUp, text: 'Reduces errores operativos' },
];

const USE_CASES = [
  { icon: Building, title: 'Empresas de 10-200 empleados', desc: 'Centraliza empleados, documentos y procesos. Ideal para negocios en crecimiento que necesitan estructura.' },
  { icon: ClipboardCheck, title: 'Departamentos de RRHH', desc: 'Onboarding, control documental y firma digital. Todo el ciclo del empleado en un solo sistema.' },
  { icon: UserPlus, title: 'Startups escalando', desc: 'Crece con orden desde el día 1. Procesos claros, documentos al día, equipo organizado.' },
];

const TESTIMONIALS = [
  { quote: 'Pasamos de tener contratos en 3 carpetas distintas a tenerlo todo digital y firmado. El onboarding de nuevos empleados ahora es un proceso de 10 minutos.', name: 'Andrea Fuentes', role: 'Directora de RRHH, Logística Norte', avatar: 'AF' },
  { quote: 'Con 80 empleados necesitábamos orden. Volkern nos dio estructura sin ser un ERP pesado.', name: 'Marcos Vidal', role: 'CEO, Industrias Vidal', avatar: 'MV' },
  { quote: 'Por €39/mes tenemos gestión de empleados + documentos + firma digital. Antes era un caos.', name: 'Claudia Ríos', role: 'Gerente de Personas, TechCo', avatar: 'CR' },
];

const COMPETITOR_TOOLS = [
  { name: 'CRM interno', price: 50 },
  { name: 'Gestión documental', price: 30 },
  { name: 'Comunicación', price: 20 },
  { name: 'Automatización', price: 40 },
  { name: 'Firma digital', price: 15 },
  { name: 'Gestión de tareas', price: 25 },
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

export default function RRHHLanding() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <img src="/rrhh-portada.png" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950/95" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-rose-600/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-rose-500/10 text-rose-400 text-sm font-medium mb-4 border border-rose-500/20">
              <UserCheck className="w-4 h-4" />
              Ideal para empresas con equipo
            </span>
            <span className="block mb-6">
              <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
                ⚡ 14 días gratis · Sin tarjeta
              </span>
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Gestiona tu equipo{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">
                sin caos ni procesos improvisados
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-4 leading-relaxed">
              Centraliza empleados, procesos, comunicación y documentación en un solo sistema.
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
              Desde <span className="text-white font-bold">€39/mes</span>. 14 días gratis. Sin tarjeta.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup?vertical=rrhh">
                <Button size="lg" className="bg-rose-600 hover:bg-rose-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-rose-600/30 group">
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
              El desorden interno{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">frena el crecimiento</span>
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
                <span className="text-red-300 font-medium">Cuando el equipo crece, el caos también.</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ SOLUCIÓN ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-rose-500/10 text-rose-400 text-sm font-medium mb-6 border border-rose-500/20">La solución</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Todo tu equipo{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">en un solo sistema</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">Con Volkern puedes:</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAPABILITIES.map((cap, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-rose-500/30 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-rose-500/20 transition-colors">
                    <Check className="w-4 h-4 text-rose-400" />
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
            <span className="inline-block py-1 px-3 rounded-full bg-rose-500/10 text-rose-400 text-sm font-medium mb-6 border border-rose-500/20">Cómo funciona</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Así funciona Volkern{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">en tu operación diaria</span>
            </h2>
            <div className="relative">
              {FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex items-start gap-6 mb-10 last:mb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-rose-400">{step.number}</span>
                      </div>
                      {i < FLOW_STEPS.length - 1 && <div className="w-0.5 h-10 bg-gradient-to-b from-rose-500/30 to-slate-800 mt-2" />}
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
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">Valor percibido</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Todo lo que <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">incluye Volkern</span></h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((mod, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-purple-500/20 transition-colors group">
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

      {/* ═══ BENEFICIOS ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-6 border border-amber-500/20">Beneficios</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Diseñado para equipos que quieren crecer <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">con orden</span></h2>
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
              Hecho para empresas{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">que gestionan personas</span>
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
            <span className="inline-block py-1 px-3 rounded-full bg-rose-500/10 text-rose-400 text-sm font-medium mb-6 border border-rose-500/20">Comparación de costos</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">Todo lo que <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">reemplaza Volkern</span></h2>
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
                  <span className="text-rose-400 text-right font-mono font-semibold flex items-center justify-end gap-2"><Check className="w-4 h-4" /> Incluido</span>
                </motion.div>
              ))}
              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-rose-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR}+</span>
                <span className="text-rose-400 text-right font-bold text-lg font-mono">€39/mes</span>
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
              Empresas con equipo{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">ya gestionan con Volkern</span>
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
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">Control total</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Procesos claros{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">y trazables</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-10 leading-relaxed">Cada acción queda registrada:</p>
            <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {[
                { icon: UserCheck, title: 'Altas de empleados' },
                { icon: FileSignature, title: 'Documentos firmados' },
                { icon: History, title: 'Cambios realizados' },
                { icon: Check, title: 'Procesos completados' },
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
            <p className="text-center text-slate-400 mt-8 max-w-lg mx-auto">Todo listo para control interno y auditoría.</p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CONFIANZA ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <ShieldCheck className="w-10 h-10 text-rose-400 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-white mb-4">El crecimiento sin estructura genera problemas</h3>
              <div className="space-y-2 text-lg text-slate-300">
                <p>Las empresas que organizan su equipo:</p>
                <ul className="inline-block text-left space-y-1">
                  {['operan mejor', 'escalan más rápido', 'reducen errores'].map((item, i) => (
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
            <div className="bg-gradient-to-r from-rose-900/40 via-slate-900 to-pink-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <UserCheck className="w-12 h-12 text-rose-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Empieza a gestionar tu equipo{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">como un sistema</span>
              </h2>
              <p className="text-lg text-slate-400 mb-4 max-w-xl mx-auto">
                <span className="text-white font-bold">14 días gratis</span>. Sin tarjeta. Sin compromiso.
              </p>
              <p className="text-slate-500 text-sm mb-10">Luego €39/mes. Incluye gestión de empleados, documentos y más.</p>
              <Link href="/auth/signup?vertical=rrhh">
                <Button size="lg" className="bg-rose-600 hover:bg-rose-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-rose-600/30 group">
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
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Menos desorden.</p>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Más control.</p>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-8">Mejores equipos.</p>
            <p className="text-lg text-rose-400 font-medium mb-8">Volkern es la base de una operación interna eficiente.</p>
            <Link href="/auth/signup?vertical=rrhh">
              <Button size="lg" className="bg-rose-600 hover:bg-rose-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-rose-600/30 group">
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
