'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Minus, Monitor, Zap, MessageCircle, FileSignature, Users, BarChart3, TrendingUp, Clock, AlertTriangle, Layers, ShieldCheck, Sparkles, ChevronRight, BookOpen, ChevronDown } from 'lucide-react';
import { calcularPrecio, getMensajeLimite, getComparisonTable, type PlanTipo } from '@/lib/pricing-engine';

const SLIDER_USUARIOS_MIN = 1;
const SLIDER_USUARIOS_MAX = 99;
const SLIDER_CONTACTOS_MIN = 1000;
const SLIDER_CONTACTOS_MAX = 99000;
const SLIDER_CONTACTOS_STEP = 1000;

/* ─── Data ────────────────────────────────────────────────────────────────── */

const COMPETITOR_TOOLS = [
  { name: 'CRM', price: 50 },
  { name: 'Email marketing', price: 30 },
  { name: 'Chat en vivo', price: 20 },
  { name: 'Telefonía', price: 25 },
  { name: 'Automatización', price: 40 },
  { name: 'Firma digital', price: 15 },
  { name: 'Gestión interna', price: 30 },
];

const TOTAL_COMPETITOR = COMPETITOR_TOOLS.reduce((sum, t) => sum + t.price, 0);

const PROBLEMS = [
  { icon: Clock, title: 'Pierdes tiempo', desc: 'cambiando entre plataformas' },
  { icon: AlertTriangle, title: 'Información fragmentada', desc: 'tus datos están dispersos' },
  { icon: TrendingUp, title: 'Sin control total', desc: 'del negocio en tiempo real' },
  { icon: Minus, title: 'Pagas más', desc: 'por menos funcionalidad' },
];

const CAPABILITIES = [
  'Gestionar clientes y ventas',
  'Automatizar procesos',
  'Comunicarte con clientes',
  'Firmar documentos',
  'Gestionar pagos',
  'Controlar operaciones',
];

const MODULES = [
  'CRM y gestión de clientes',
  'Automatización de procesos',
  'Email marketing',
  'Chat en vivo',
  'Telefonía integrada',
  'Firma digital',
  'Gestión de tareas',
  'Academia y formación',
  'Integraciones (Stripe, Google, etc.)',
  'Dashboard y reportes',
];

const BENEFITS = [
  { icon: Zap, text: 'No pierdes oportunidades' },
  { icon: MessageCircle, text: 'Respondes más rápido' },
  { icon: ShieldCheck, text: 'Reduces errores' },
  { icon: Clock, text: 'Ahorras tiempo' },
  { icon: BarChart3, text: 'Tomas mejores decisiones' },
];

const TARGETS = [
  'Inmobiliarias',
  'Agencias de marketing',
  'Despachos contables',
  'Academias',
  'Equipos comerciales',
  'Empresas en crecimiento',
];

/* ─── PricingSlider (compartido con /precios) ──────────────────────────────── */

function fmtUsuarios(n: number) {
  if (n === SLIDER_USUARIOS_MAX) return '99+'
  return String(n)
}

function fmtContactos(n: number) {
  if (n >= SLIDER_CONTACTOS_MAX) return '99.000+'
  if (n >= 1000) return `${(n / 1000).toFixed(0)}.000`
  return n.toLocaleString('es-ES')
}

function fmtPrecio(n: number) {
  return n.toLocaleString('es-ES')
}

function PricingSlider() {
  const [users, setUsers] = useState(5)
  const [contacts, setContacts] = useState(5000)
  const [plan, setPlan] = useState<PlanTipo>('scale')
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [showComparison, setShowComparison] = useState(false)

  const result = useMemo(
    () => calcularPrecio({ usuarios: users, contactos: contacts, plan }),
    [users, contacts, plan]
  )

  const mensajeLimite = getMensajeLimite(result.esMaximo, result.esAltoVolumen)
  const comparison = useMemo(() => getComparisonTable(result.nivel), [result.nivel])
  const precioMostrar = billingInterval === 'yearly' ? Math.round(result.precio * 0.8) : result.precio
  
  const usuariosPct = ((users - SLIDER_USUARIOS_MIN) / (SLIDER_USUARIOS_MAX - SLIDER_USUARIOS_MIN)) * 100
  const contactosPct = ((contacts - SLIDER_CONTACTOS_MIN) / (SLIDER_CONTACTOS_MAX - SLIDER_CONTACTOS_MIN)) * 100

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-10 mb-10">
        {/* IZQUIERDA — Controles */}
        <div className="space-y-6">
          {/* Slider: Usuarios */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase tracking-tight">Usuarios</p>
                  <p className="text-xs text-slate-500">Miembros del equipo</p>
                </div>
              </div>
              <span className="text-2xl font-black text-white tabular-nums">{fmtUsuarios(users)}</span>
            </div>
            <input
              type="range"
              min={1}
              max={99}
              step={1}
              value={users}
              onChange={(e) => setUsers(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-slate-800 appearance-none cursor-pointer accent-purple-500"
              style={{ background: `linear-gradient(to right, #A855F7 0%, #A855F7 ${usuariosPct}%, #1E293B ${usuariosPct}%, #1E293B 100%)` }}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] font-bold text-slate-600">1</span>
              <span className="text-[10px] font-bold text-slate-600">99+</span>
            </div>
          </div>

          {/* Slider: Contactos */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase tracking-tight">Contactos</p>
                  <p className="text-xs text-slate-500">Base de datos activa</p>
                </div>
              </div>
              <span className="text-2xl font-black text-white tabular-nums">{fmtContactos(contacts)}</span>
            </div>
            <input
              type="range"
              min={1000}
              max={99000}
              step={1000}
              value={contacts}
              onChange={(e) => setContacts(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-slate-800 appearance-none cursor-pointer accent-blue-500"
              style={{ background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${contactosPct}%, #1E293B ${contactosPct}%, #1E293B 100%)` }}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] font-bold text-slate-600">1.000</span>
              <span className="text-[10px] font-bold text-slate-600">99.000+</span>
            </div>
          </div>

          {/* Toggle: Scale / Compliance Pro */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <p className="text-sm font-black text-white uppercase tracking-tight mb-4">Modalidad</p>
            <div className="flex gap-3">
              <button
                onClick={() => setPlan('scale')}
                className={`flex-1 p-3 rounded-xl border transition-all text-left ${
                  plan === 'scale' ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap className={`h-4 w-4 ${plan === 'scale' ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span className={`text-xs font-black uppercase ${plan === 'scale' ? 'text-white' : 'text-slate-400'}`}>Scale</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">Funcionalidades base</p>
              </button>
              <button
                onClick={() => setPlan('compliance')}
                className={`flex-1 p-3 rounded-xl border transition-all text-left ${
                  plan === 'compliance' ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className={`h-4 w-4 ${plan === 'compliance' ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className={`text-xs font-black uppercase ${plan === 'compliance' ? 'text-white' : 'text-slate-400'}`}>Compliance Pro</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">+25% control y auditoría</p>
              </button>
            </div>
          </div>

          {/* Toggle: Mensual / Anual */}
          <div className="flex justify-center">
            <div className="bg-slate-800/50 rounded-full p-1 flex gap-1">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  billingInterval === 'monthly' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25' : 'text-slate-400 hover:text-white'
                }`}
              >Mensual</button>
              <button
                onClick={() => setBillingInterval('yearly')}
                className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  billingInterval === 'yearly' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25' : 'text-slate-400 hover:text-white'
                }`}
              >Anual <span className="text-[9px] text-purple-300 ml-0.5">-20%</span></button>
            </div>
          </div>
        </div>

        {/* DERECHA — Precio + Features */}
        <div className="flex flex-col justify-center">
          <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                plan === 'compliance' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              }`}>{plan === 'compliance' ? 'Compliance Pro' : 'Scale'}</span>
              {billingInterval === 'yearly' && (
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">-20%</span>
              )}
            </div>

            <div className="mb-2">
              <span className="text-6xl font-black text-white tracking-tight">€{fmtPrecio(precioMostrar)}</span>
              <span className="text-slate-500 text-lg ml-1">/mes</span>
            </div>
            {billingInterval === 'yearly' && (
              <p className="text-[11px] text-emerald-500 font-bold mb-4">Facturado anualmente · 20% de ahorro</p>
            )}
            <p className="text-sm text-slate-400 mb-6">{result.mensaje}</p>

            {mensajeLimite && (
              <div className={`p-4 rounded-xl border mb-6 ${
                result.esMaximo ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
              }`}>
                <p className="text-xs font-bold">{mensajeLimite}</p>
                {result.esMaximo && (
                  <a href="mailto:ventas@volkern.com" className="mt-2 inline-block text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2">
                    Contactar para plan personalizado
                  </a>
                )}
              </div>
            )}

            <div className="space-y-3 mb-8">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Incluye</p>
              {result.features.map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-slate-300">{feature}</span>
                </div>
              ))}
            </div>

            <Link href={`/signup?usuarios=${users}&contactos=${contacts}&plan=${plan}&interval=${billingInterval}&precio=${precioMostrar}`}>
              <Button size="lg" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                Activar mi sistema
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <p className="text-xs text-slate-600 mt-4 text-center">Sin permanencia. Cancela cuando quieras.</p>
          </div>
        </div>
      </div>

      {/* Tabla comparativa colapsable */}
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-slate-400" />
            <span className="text-sm font-black text-white uppercase tracking-tight">Comparativa de funcionalidades</span>
          </div>
          <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${showComparison ? 'rotate-180' : ''}`} />
        </button>

        {showComparison && (
          <div className="mt-4 rounded-2xl bg-slate-950/80 border border-slate-800 overflow-hidden animate-in fade-in duration-300">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Funcionalidad</th>
                  <th className="text-center p-4 text-[10px] font-black text-purple-400 uppercase tracking-widest bg-purple-500/5">Scale</th>
                  <th className="text-center p-4 text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/5">Compliance Pro</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                    <td className="p-4 text-sm font-medium text-slate-300">{row.feature}</td>
                    <td className={`p-4 text-center text-sm font-bold bg-purple-500/5 ${row.scale === '✔' ? 'text-emerald-400' : row.scale === '—' ? 'text-slate-600' : 'text-slate-300'}`}>{row.scale}</td>
                    <td className={`p-4 text-center text-sm font-bold bg-indigo-500/5 ${row.compliance === '✔' ? 'text-emerald-400' : row.compliance === '—' ? 'text-slate-600' : 'text-slate-300'}`}>{row.compliance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

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

export default function SimplifiedLanding() {
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
         HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/assets/landing/laptop-volkern-1.png"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950/95" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/15 blur-[140px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              <Zap className="w-4 h-4" />
              Tu Hub Operativo
            </span>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Centraliza todo tu negocio{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                en un solo lugar
              </span>
            </h1>

            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              Gestiona clientes, ventas, comunicación, pagos y operaciones sin cambiar de herramienta.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-white mb-10">
              Todo lo que necesitas para operar y crecer, desde <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">€50/mes</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Activar mi sistema
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#como-funciona">
                <Button variant="outline" size="lg" className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white px-10 py-7 text-lg rounded-xl">
                  <Monitor className="mr-2 w-5 h-5" />
                  Ver cómo funciona
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         PRUEBA RÁPIDA — Comparación de costos
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark id="como-funciona">
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
              Prueba rápida
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
              Todo lo que dejas de pagar
            </h2>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Herramienta</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Costo/mes</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Con Volkern</span>
              </div>

              {/* Rows */}
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

              {/* Total Row */}
              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-emerald-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR}+</span>
                <span className="text-emerald-400 text-right font-bold text-lg font-mono">€50/mes</span>
              </div>
            </div>

            <p className="text-center text-slate-400 mt-6 text-sm">
              Reemplaza más de <span className="text-white font-semibold">{COMPETITOR_TOOLS.length} herramientas</span> por una sola plataforma
            </p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         PROBLEMA
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-6 border border-red-500/20">
              El problema
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Estás usando <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">demasiadas herramientas</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">
              Cada herramienta que añades promete solucionar un problema… pero añade tres más.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {PROBLEMS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                    className="flex items-start gap-4 p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-red-500/20 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg mb-1">{p.title}</h3>
                      <p className="text-slate-400">{p.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
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
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              La solución
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Un sistema para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">todo tu negocio</span>
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
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-blue-500/30 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                    <Check className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-slate-300 font-medium">{cap}</span>
                </motion.div>
              ))}
            </div>

            <p className="text-center text-slate-400 mt-8 text-sm">
              Todo en un solo lugar. Sin integraciones complejas. Sin duplicar datos.
            </p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         MÓDULOS (Volumen = Valor)
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">
              Volumen = Valor
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Todo lo que incluye{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">Volkern</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">
              No vendemos módulos por separado. Todo está incluido desde el primer día.
            </p>

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
         BENEFICIOS
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-6 border border-amber-500/20">
              Beneficios reales
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Diseñado para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">operar mejor</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
              No es un CRM, no es un ERP. Es la forma de operar tu negocio.
            </p>

            <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
         PARA QUIÉN ES
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
              Para quién es
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
              Diseñado para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">distintos negocios</span>
            </h2>

            <div className="flex flex-wrap justify-center gap-3">
              {TARGETS.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                  className="px-6 py-3 bg-slate-900/50 border border-slate-800 rounded-full text-slate-300 font-medium hover:border-emerald-500/30 hover:text-emerald-300 transition-all duration-300"
                >
                  {t}
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CTA INTERMEDIO
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-900/30 via-slate-900 to-purple-900/30 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Sparkles className="w-12 h-12 text-blue-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Empieza a centralizar tu negocio hoy
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
                Todo en un solo sistema. Sin complicaciones.
              </p>
              <Link href="/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Empezar con Volkern
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         PRICING (sliders interactivos — mismo motor que /precios)
      ════════════════════════════════════════════════════════════════════ */}
      <Section id="pricing">
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
                Pricing
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Un solo plan.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Todo incluido.</span>
              </h2>
              <p className="text-slate-400 text-lg">Ajusta los controles y descubre tu precio ideal</p>
            </div>

            <PricingSlider />
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CONFIANZA
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-6" />
              <p className="text-lg text-slate-300 leading-relaxed mb-4">
                Empresas están comenzando a reemplazar múltiples herramientas por Volkern.
              </p>
              <p className="text-slate-500 text-sm max-w-lg mx-auto">
                Centralizar ya no es una opción, es una ventaja competitiva.
              </p>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CTA FINAL
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-indigo-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Deja de usar{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">múltiples herramientas</span>
              </h2>
              <p className="text-xl text-slate-400 mb-10">
                Empieza a operar con un solo sistema
              </p>
              <Link href="/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-14 py-8 text-xl rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Activar mi sistema
                  <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         FOOTER PHRASE
      ════════════════════════════════════════════════════════════════════ */}
      <div className="py-10 bg-slate-950 border-t border-slate-900">
        <div className="container mx-auto px-6 text-center">
          <p className="text-xl text-slate-500 font-medium">
            Volkern no es otro software.{' '}
            <span className="text-slate-300">Es la forma de operar tu negocio.</span>
          </p>
        </div>
      </div>
    </>
  );
}
