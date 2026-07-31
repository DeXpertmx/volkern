'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, Shield, Users, BarChart3,
  TrendingUp, Clock, AlertTriangle, Calendar,
  Lightbulb, FileText, Building2, RefreshCw,
  Star, Quote, BrainCircuit,
} from 'lucide-react';

/* ─── Data ────────────────────────────────────────────────────────────────── */

const PAIN_POINTS = [
  { icon: Calendar, text: 'Renovaciones que pasan desapercibidas' },
  { icon: Users, text: 'Clientes sin seguimiento en meses' },
  { icon: AlertTriangle, text: 'Cartera desorganizada en Excel' },
  { icon: Clock, text: 'Oportunidades de venta cruzada perdidas' },
  { icon: TrendingUp, text: 'Sin visibilidad de la salud de tu negocio' },
];

const CAPABILITIES = [
  'Importar tu cartera desde Excel en minutos',
  'Ver todas tus pólizas organizadas por ramo y aseguradora',
  'Recibir alertas automáticas cuando una póliza vence',
  'Detectar oportunidades de venta cruzada con IA',
  'Gestionar renovaciones desde un calendario visual',
  'Tener un briefing diario de tu cartera cada mañana',
];

const FLOW_STEPS = [
  { number: '1', title: 'Importas tu cartera', description: 'Desde Excel, CSV o Google Sheets en minutos', icon: FileText },
  { number: '2', title: 'La IA analiza', description: 'Detecta vencimientos, riesgos y oportunidades', icon: BrainCircuit },
  { number: '3', title: 'Recibes alertas', description: 'Briefing diario con las acciones que importan', icon: Lightbulb },
  { number: '4', title: 'Gestionas renovaciones', description: 'Calendario visual + recordatorios automáticos', icon: Calendar },
  { number: '5', title: 'Cierras más negocio', description: 'Con cross-sell inteligente y seguimiento proactivo', icon: TrendingUp },
];

const MODULES = [
  'CRM de seguros',
  'Gestión de pólizas',
  'Calendario de renovaciones',
  'AI Portfolio Manager',
  'Detección de venta cruzada',
  'Pipeline comercial dual',
  'Dashboard de cartera',
  'Importador Excel/CSV',
  'Alertas y notificaciones',
];

const BENEFITS = [
  { icon: BrainCircuit, text: 'IA que trabaja tu cartera 24/7' },
  { icon: RefreshCw, text: 'No pierdes una renovación' },
  { icon: Shield, text: 'Control total de tu negocio' },
  { icon: TrendingUp, text: 'Aumentas ventas con cross-sell' },
  { icon: Clock, text: 'Ahorras horas cada semana' },
];

const USE_CASES = [
  { icon: Users, title: 'Agentes independientes', desc: 'Gestiona tu cartera personal sin depender de nadie. IA que te avisa qué hacer cada día. Desde €99/mes.' },
  { icon: Building2, title: 'Corredurías con equipos', desc: 'Múltiples usuarios, roles, pipelines separados por agente. Visibilidad completa del equipo. Desde €199/mes.' },
  { icon: Shield, title: 'Agencias de seguros', desc: 'Marca blanca, equipos comerciales, reporting avanzado. Todo el poder de Volkern para tu agencia. Desde €499/mes.' },
];

const TESTIMONIALS = [
  { quote: 'Con 1,200 pólizas en cartera, Volkern me avisa cada mañana qué tengo que hacer. Antes vivía en Excel. Ahora la IA me dice a quién llamar.', name: 'Carlos Mendoza', role: 'Agente de Seguros, AXA', avatar: 'CM' },
  { quote: 'El calendario de renovaciones y las alertas automáticas cambiaron mi negocio. Dejé de perder clientes por falta de seguimiento.', name: 'Ana García', role: 'Corredora Independiente', avatar: 'AG' },
  { quote: 'La detección de venta cruzada nos ayudó a vender un 40% más de pólizas de hogar a clientes que ya tenían auto con nosotros.', name: 'Roberto Núñez', role: 'Director, Seguros Núñez', avatar: 'RN' },
];

const PRICING_TIERS = [
  {
  name: 'Starter',
  price: 99,
  color: 'sky',
  borderClass: 'border-sky-500/30',
  bgClass: 'bg-sky-500/10',
  textClass: 'text-sky-400',
  btnClass: 'bg-slate-800 hover:bg-slate-700',
  description: 'Para agentes que quieren controlar su cartera',
    features: [
      'CRM de seguros completo',
      'Gestión de pólizas ilimitadas',
      'Calendario de renovaciones',
      'Importador Excel/CSV',
      'Alertas de vencimiento',
      'Dashboard de cartera',
      '1 usuario',
    ],
    cta: 'Empezar prueba gratis',
  },
  {
  name: 'Professional',
  price: 199,
  color: 'purple',
  borderClass: 'border-sky-500/50',
  bgClass: 'bg-sky-500/10',
  textClass: 'text-sky-400',
  btnClass: 'bg-sky-600 hover:bg-sky-500',
  description: 'Para agentes que quieren una IA trabajando su cartera',
    popular: true,
    features: [
      'Todo lo de Starter',
      'AI Portfolio Manager',
      'Detección de venta cruzada',
      'Pipeline comercial dual',
      'Briefing diario automático',
      'WhatsApp integrado',
      'Hasta 5 usuarios',
    ],
    cta: 'Empezar prueba gratis',
  },
  {
  name: 'Agency',
  price: 499,
  color: 'emerald',
  borderClass: 'border-emerald-500/30',
  bgClass: 'bg-emerald-500/10',
  textClass: 'text-emerald-400',
  btnClass: 'bg-slate-800 hover:bg-slate-700',
  description: 'Para corredurías con equipos comerciales',
    features: [
      'Todo lo de Professional',
      'Usuarios ilimitados',
      'Roles y permisos',
      'Marca blanca',
      'API de integración',
      'Reporting avanzado',
      'Soporte prioritario',
    ],
    cta: 'Hablar con ventas',
  },
];

const COMPETITOR_COSTS = [
  { name: 'CRM', price: 50 },
  { name: 'Excel + recordatorios manuales', price: 0 },
  { name: 'Horas perdidas en seguimiento', price: 500 },
  { name: 'Renovaciones perdidas (coste)', price: 2000 },
  { name: 'Cross-sell no detectado', price: 1500 },
];

const TOTAL_COMPETITOR = COMPETITOR_COSTS.reduce((sum, t) => sum + t.price, 0);

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

export default function InsuranceLanding() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-950/60 via-slate-950 to-purple-950/60" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.15),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(168,85,247,0.1),transparent_50%)]" />
        </div>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-sky-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-sky-500/10 text-sky-400 text-sm font-medium mb-4 border border-sky-500/20">
              <Shield className="w-4 h-4" />
              Para agentes, corredores y agencias de seguros
            </span>
            <span className="block mb-6">
              <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
                ⚡ 14 días gratis · Sin tarjeta
              </span>
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              El primer agente IA que trabaja{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-400">
                tu cartera mientras duermes
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-4 leading-relaxed">
              Detecta renovaciones, encuentra oportunidades de venta cruzada y te dice cada mañana qué hacer.
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
              Desde <span className="text-white font-bold">€99/mes</span>. 14 días gratis. Sin tarjeta.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup?vertical=insurance">
                <Button size="lg" className="bg-sky-600 hover:bg-sky-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-sky-600/30 group">
                  Probar 14 días gratis
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#pricing">
                <Button variant="outline" size="lg" className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white px-10 py-7 text-lg rounded-xl">
                  Ver precios
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
              Tu cartera vale miles de euros{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">y la gestionas en Excel</span>
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
                <span className="text-red-300 font-medium">Cada póliza que no renuevas es un cliente que pierdes para siempre.</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ SOLUCIÓN ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-sky-500/10 text-sky-400 text-sm font-medium mb-6 border border-sky-500/20">La solución</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Una IA que analiza tu cartera{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-400">y te dice qué hacer cada día</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">Con Volkern Insurance puedes:</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAPABILITIES.map((cap, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-sky-500/30 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-sky-500/20 transition-colors">
                    <Check className="w-4 h-4 text-sky-400" />
                  </div>
                  <span className="text-slate-300 font-medium">{cap}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CÓMO FUNCIONA ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">Cómo funciona</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Así de simple es tener{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">una IA trabajando para ti</span>
            </h2>
            <div className="relative">
              {FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex items-start gap-6 mb-10 last:mb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-sky-400">{step.number}</span>
                      </div>
                      {i < FLOW_STEPS.length - 1 && <div className="w-0.5 h-10 bg-gradient-to-b from-sky-500/30 to-slate-800 mt-2" />}
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

      {/* ═══ DIFERENCIAL: AI ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-sky-900/40 via-slate-900 to-purple-900/40 border border-slate-800 rounded-3xl p-10 md:p-14">
              <BrainCircuit className="w-14 h-14 text-sky-400 mx-auto mb-6" />
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Cada mañana,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-purple-400">tu AI Portfolio Manager</span>
                {' '}te dice:
              </h2>
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 md:p-8 text-left max-w-xl mx-auto mb-8">
                <p className="text-slate-300 leading-relaxed text-lg">
                  &ldquo;Buenos días. Revisé tu cartera:<br /><br />
                  📋 <strong className="text-sky-400">18 pólizas</strong> vencen en los próximos 60 días.<br />
                  💡 <strong className="text-purple-400">5 clientes</strong> tienen oportunidad de venta cruzada.<br />
                  ⚠️ <strong className="text-amber-400">3 clientes</strong> llevan más de 6 meses sin contacto.<br /><br />
                  He preparado las acciones recomendadas.&rdquo;
                </p>
              </div>
              <p className="text-slate-400">Todo esto pasa <span className="text-white font-semibold">automáticamente</span>. Sin que muevas un dedo.</p>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ MÓDULOS ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">Todo incluido</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Todo lo que{' '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">necesitas para tu cartera</span></h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((mod, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-purple-500/20 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                    <Check className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-slate-300">{mod}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ PRICING ═══ */}
      <Section dark id="pricing">
        <FadeIn>
          <div className="max-w-5xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">Precios</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 text-center">
              Elige el plan{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">que tu negocio necesita</span>
            </h2>
            <p className="text-slate-400 text-center mb-12 max-w-xl mx-auto">14 días gratis en todos los planes. Sin tarjeta. Sin compromiso.</p>
            <div className="grid md:grid-cols-3 gap-6">
              {PRICING_TIERS.map((tier, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                  className={`relative p-8 bg-slate-900/50 border rounded-2xl flex flex-col ${tier.borderClass} ${tier.popular ? 'shadow-xl shadow-sky-500/10' : ''} hover:${tier.borderClass} transition-colors`}>
                  {tier.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                      Más popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold text-white mb-1">{tier.name}</h3>
                  <p className="text-slate-400 text-sm mb-4">{tier.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-white">€{tier.price}</span>
                    <span className="text-slate-500">/mes</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-slate-300">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/signup?vertical=insurance&plan=${tier.name.toLowerCase()}`}>
                    <Button className={`w-full ${tier.btnClass} text-white`}>
                      {tier.cta}
                    </Button>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ COMPARACIÓN DE COSTES ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">El coste de no tenerlo</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">Lo que te cuesta{' '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">no tener Volkern</span></h2>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Sin Volkern</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Coste estimado/mes</span>
              </div>
              {COMPETITOR_COSTS.map((tool, i) => (
                <motion.div key={tool.name} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 transition-colors">
                  <span className="text-slate-300 font-medium">{tool.name}</span>
                  <span className="text-red-400 text-right font-mono font-semibold">{tool.price === 0 ? 'Gratis' : `€${tool.price.toLocaleString('es-ES')}`}</span>
                </motion.div>
              ))}
              <div className="grid grid-cols-2 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-emerald-500/30">
                <span className="text-white font-bold text-lg">Coste de oportunidad total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR.toLocaleString('es-ES')}+</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 mt-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <p className="text-slate-400 text-sm">Con Volkern</p>
                <p className="text-emerald-400 text-2xl font-bold">desde €99/mes</p>
              </div>
              <ArrowRight className="w-6 h-6 text-slate-600" />
              <div className="bg-slate-900/50 border border-emerald-500/20 rounded-xl p-4">
                <p className="text-slate-400 text-sm">Ahorro potencial</p>
                <p className="text-emerald-400 text-2xl font-bold">€{TOTAL_COMPETITOR - 99}/mes+</p>
              </div>
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
              Diseñado para el{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">profesional de seguros</span>
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

      {/* ═══ TESTIMONIOS ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">Lo que dicen</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-10 text-center">
              Agentes y corredores{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">ya confían en Volkern</span>
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

      {/* ═══ BENEFICIOS ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-6 border border-amber-500/20">Beneficios</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Resultados{' '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">que hablan solos</span></h2>
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

      {/* ═══ CTA ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-sky-900/40 via-slate-900 to-purple-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Shield className="w-14 h-14 text-sky-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Deja que la IA trabaje tu cartera{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-purple-400">mientras tú cierras más negocio</span>
              </h2>
              <p className="text-lg text-slate-400 mb-4 max-w-xl mx-auto">
                <span className="text-white font-bold">14 días gratis</span>. Sin tarjeta. Sin compromiso.
              </p>
              <p className="text-slate-500 text-sm mb-10">Luego desde €99/mes. Incluye CRM de seguros, IA, renovaciones y más.</p>
              <Link href="/signup?vertical=insurance">
                <Button size="lg" className="bg-sky-600 hover:bg-sky-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-sky-600/30 group">
                  Empezar prueba gratis
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
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Tu cartera vale demasiado para gestionarla en Excel.</p>
            <p className="text-xl text-sky-400 font-semibold">Pon una IA a trabajar para ti.</p>
            <div className="mt-8">
              <Link href="/signup?vertical=insurance">
                <Button size="lg" className="bg-sky-600 hover:bg-sky-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-sky-600/30 group">
                  Probar 14 días gratis
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
