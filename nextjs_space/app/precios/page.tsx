'use client'

import { useState, useMemo } from 'react'
import { PublicLayout } from '@/components/public/PublicLayout'
import {
  calcularPrecio,
  getMensajeLimite,
  type PlanTipo,
  type PricingResult,
} from '@/lib/pricing-engine'
import {
  Check,
  ArrowRight,
  Users,
  BookOpen,
  Shield,
  Zap,
  Sparkles,
  HelpCircle,
  ChevronDown,
  Lock,
  TrendingUp,
  Layers,
  FileSignature,
  MessageCircle,
  Monitor,
  BarChart3,
} from 'lucide-react'

/* ─── Constantes ───────────────────────────────────────────────────────────── */

const USUARIOS_MIN = 1
const USUARIOS_MAX = 99
const CONTACTOS_MIN = 1000
const CONTACTOS_MAX = 99000
const CONTACTOS_STEP = 1000

const ALL_INCLUDED = [
  { label: 'CRM', icon: Users },
  { label: 'Marketing automation', icon: TrendingUp },
  { label: 'Ventas', icon: BarChart3 },
  { label: 'Facturación', icon: FileSignature },
  { label: 'Firma digital', icon: FileSignature },
  { label: 'Telefonía', icon: Monitor },
  { label: 'Hub social', icon: MessageCircle },
  { label: 'Academia', icon: BookOpen },
  { label: 'RRHH', icon: Users },
  { label: 'Integraciones', icon: Zap },
  { label: 'Webhooks', icon: Layers },
  { label: 'Compliance base', icon: Shield },
]

const COMPARISON_ROWS = [
  { feature: 'CRM', scale: '✔', compliance: '✔' },
  { feature: 'Marketing', scale: '✔', compliance: '✔' },
  { feature: 'Ventas', scale: '✔', compliance: '✔' },
  { feature: 'Facturación', scale: '✔', compliance: '✔' },
  { feature: 'Firma digital', scale: '✔', compliance: '✔' },
  { feature: 'Módulo Compliance PRO', scale: '—', compliance: '✔' },
  { feature: 'Auditoría', scale: '—', compliance: '✔' },
  { feature: 'Trazabilidad', scale: '—', compliance: '✔' },
  { feature: 'Control fiscal', scale: '—', compliance: '✔' },
]

/* ─── Formateo ─────────────────────────────────────────────────────────────── */

function fmtUsuarios(n: number) {
  if (n === USUARIOS_MAX) return '99+'
  return String(n)
}

function fmtContactos(n: number) {
  if (n >= CONTACTOS_MAX) return '99.000+'
  if (n >= 1000) return `${(n / 1000).toFixed(0)}.000`
  return n.toLocaleString('es-ES')
}

function fmtPrecio(n: number) {
  return n.toLocaleString('es-ES')
}

/* ─── DynamicSummary ───────────────────────────────────────────────────────── */

function DynamicSummary({
  usuarios,
  contactos,
  plan,
  billingInterval,
  precioMostrar,
  precioOriginal,
  mensajeLimite,
  result,
}: {
  usuarios: number
  contactos: number
  plan: PlanTipo
  billingInterval: 'monthly' | 'yearly'
  precioMostrar: number
  precioOriginal: number
  mensajeLimite: string | null
  result: PricingResult
}) {
  const isCompliance = plan === 'compliance'
  const isMaximo = result.esMaximo

  const BASE_FEATURES = [
    { label: `Hasta ${fmtUsuarios(usuarios)} usuarios` },
    { label: `Hasta ${fmtContactos(contactos)} contactos` },
    { label: 'CRM completo' },
    { label: 'Marketing automation' },
    { label: 'Ventas' },
    { label: 'Facturación' },
    { label: 'Firma digital' },
    { label: 'Integraciones' },
    { label: 'Telefonía' },
    { label: 'Academia' },
    { label: 'RRHH' },
    { label: 'Webhooks básicos' },
  ]

  const SCALE_EXTRAS = [
    { label: 'Operación centralizada' },
    { label: 'Automatización avanzada' },
    { label: 'Escalabilidad completa' },
  ]

  const COMPLIANCE_EXTRAS = [
    { label: 'Módulo Compliance PRO' },
    { label: 'Auditoría completa' },
    { label: 'Trazabilidad de acciones' },
    { label: 'Control operativo' },
    { label: 'Validaciones internas' },
    { label: 'Gestión documental certificada' },
    { label: 'Preparación fiscal' },
    { label: 'Webhooks avanzados' },
  ]

  return (
    <div className={`p-8 rounded-3xl border shadow-2xl transition-all duration-500 ${
      isCompliance
        ? 'bg-gradient-to-br from-indigo-950/80 to-slate-950 border-indigo-500/30 shadow-indigo-500/5'
        : 'bg-gradient-to-br from-slate-900 to-slate-900/80 border-slate-800'
    }`}>
      {/* Plan badge */}
      <div className="flex items-center gap-2 mb-4">
        {isCompliance && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-in fade-in duration-300">
            <Lock className="h-3 w-3" />
            Modo Compliance activado
          </span>
        )}
        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
          isCompliance
            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
            : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
        }`}>
          {isCompliance ? 'Compliance Pro' : 'Scale'}
        </span>
        {billingInterval === 'yearly' && (
          <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">-20%</span>
        )}
      </div>

      {/* Price */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          {billingInterval === 'yearly' && (
            <span className="text-2xl font-black text-slate-500 line-through">€{fmtPrecio(precioOriginal)}/mes</span>
          )}
          <span className="text-6xl font-black text-white tracking-tight">€{fmtPrecio(precioMostrar)}</span>
          <span className="text-slate-500 text-lg">/mes</span>
        </div>
        {billingInterval === 'yearly' && (
          <p className="text-[11px] text-emerald-500 font-bold mt-1">
            Ahorra hasta 40% · Pago anual equivalente a €{fmtPrecio(Math.round(precioMostrar))}/mes
          </p>
        )}
        {billingInterval === 'monthly' && (
          <p className="text-sm text-slate-400 mt-1">El precio se adapta automáticamente a tu negocio</p>
        )}
      </div>

      {/* Limit warning */}
      {mensajeLimite && (
        <div className={`p-4 rounded-xl border mb-6 ${
          isMaximo
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
        }`}>
          <p className="text-xs font-bold">{mensajeLimite}</p>
          {isMaximo && (
            <button
              onClick={() => window.location.href = 'mailto:ventas@volkern.com'}
              className="mt-2 text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              Contactar para plan personalizado
            </button>
          )}
        </div>
      )}

      {/* Features */}
      <div className="space-y-4 mb-8">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Tu configuración incluye:
        </p>

        {/* Base features */}
        {BASE_FEATURES.map((f, i) => (
          <div key={`base-${i}`} className="flex items-start gap-3">
            <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-sm text-slate-300">{f.label}</span>
          </div>
        ))}

        {/* Scale extras */}
        {!isCompliance && SCALE_EXTRAS.map((f, i) => (
          <div key={`scale-${i}`} className="flex items-start gap-3 animate-in fade-in duration-300">
            <Check className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <span className="text-sm text-purple-300">{f.label}</span>
          </div>
        ))}

        {/* Compliance extras */}
        {isCompliance && COMPLIANCE_EXTRAS.map((f, i) => (
          <div key={`comp-${i}`} className="flex items-start gap-3 animate-in fade-in duration-300">
            <Check className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            <span className="text-sm text-indigo-300">{f.label}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => {
          if (isMaximo) {
            window.location.href = 'mailto:ventas@volkern.com'
            return
          }          const params = new URLSearchParams({
                        usuarios: String(usuarios),
                        contactos: String(contactos),
                        plan,
                        interval: billingInterval,
                        precio: String(precioMostrar),
                      })
                      window.location.href = `/checkout?${params.toString()}`
        }}
        className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
          isMaximo
            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
            : isCompliance
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
        }`}
      >
        {isMaximo ? 'Solicitar plan personalizado' : 'Configura tu plan'}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ─── Secciones ────────────────────────────────────────────────────────────── */

function AllIncluded() {
  return (
    <div className="py-16 border-t border-slate-800">
      <div className="container mx-auto px-4 lg:px-6 max-w-4xl">
        <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-10">
          Todo esto está incluido
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {ALL_INCLUDED.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-blue-500/20 transition-colors">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium text-slate-300">{item.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ComparisonTable() {
  return (
    <div className="py-16 border-t border-slate-800">
      <div className="container mx-auto px-4 lg:px-6 max-w-3xl">
        <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-10">
          Scale vs Compliance Pro
        </h2>
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest"></th>
                <th scope="col" className="text-center p-5 text-[11px] font-black text-purple-400 uppercase tracking-widest bg-purple-500/5 w-[30%]">Scale</th>
                <th scope="col" className="text-center p-5 text-[11px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/5 w-[30%]">Compliance Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr key={i} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                  <th scope="row" className="p-4 text-sm font-medium text-slate-300 text-left">{row.feature}</th>
                  <td className={`p-4 text-center text-sm font-bold bg-purple-500/5 ${row.scale === '✔' ? 'text-emerald-400' : 'text-slate-500'}`}>{row.scale}</td>
                  <td className={`p-4 text-center text-sm font-bold bg-indigo-500/5 ${row.compliance === '✔' ? 'text-emerald-400' : 'text-slate-500'}`}>{row.compliance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const FAQ_ITEMS = [
    {
      q: '¿Qué pasa si mi negocio crece?',
      a: 'Volkern escala automáticamente sin migraciones.',
    },
    {
      q: '¿Puedo cambiar configuración?',
      a: 'Sí, en cualquier momento.',
    },
    {
      q: '¿Qué incluye Compliance?',
      a: 'Control, auditoría y trazabilidad completa.',
    },
    {
      q: '¿Cómo pago?',
      a: 'Mensual o anual con descuento.',
    },
  ]

  return (
    <div className="py-16 border-t border-slate-800">
      <div className="container mx-auto px-4 lg:px-6 max-w-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-slate-800/50 text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 border border-slate-700">
            <HelpCircle className="h-3.5 w-3.5" />
            Preguntas frecuentes
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-white">
            Respuestas directas
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIdx === i
            return (
              <div key={i} className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/30 transition-colors"
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  id={`faq-question-${i}`}
                >
                  <span className="text-sm font-bold text-white pr-4">{item.q}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div id={`faq-answer-${i}`} className="px-5 pb-5 animate-in fade-in duration-200" role="region" aria-labelledby={`faq-question-${i}`}>
                    <p className="text-sm text-slate-400 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Componente principal ─────────────────────────────────────────────────── */

export default function PreciosPage() {
  const [usuarios, setUsuarios] = useState(1)
  const [contactos, setContactos] = useState(1000)
  const [plan, setPlan] = useState<PlanTipo>('scale')
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly')

  const result: PricingResult = useMemo(
    () => calcularPrecio({ usuarios, contactos, plan }),
    [usuarios, contactos, plan]
  )

  const mensajeLimite = getMensajeLimite(result.esMaximo, result.esAltoVolumen)
  const precioMostrar = billingInterval === 'yearly' ? Math.round(result.precio * 0.8) : result.precio
  const precioOriginal = result.precio
  const usuariosPct = ((usuarios - USUARIOS_MIN) / (USUARIOS_MAX - USUARIOS_MIN)) * 100
  const contactosPct = ((contactos - CONTACTOS_MIN) / (CONTACTOS_MAX - CONTACTOS_MIN)) * 100

  return (
    <PublicLayout>
      <div className="min-h-screen bg-slate-950">

        {/* ══════════ HERO ══════════════════════════════════════════════════ */}
        <section className="pt-28 pb-6">
          <div className="container mx-auto px-4 lg:px-6 max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 mb-6">
              Desde €50 / mes
            </span>
            <h1 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tight leading-tight">
              Elige cómo quieres escalar{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
                tu operación
              </span>
            </h1>
            <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto">
              Configura Volkern en tiempo real. Sin módulos ocultos. Sin límites innecesarios.
            </p>
          </div>
        </section>

        {/* ══════════ CONFIGURADOR ══════════════════════════════════════════ */}
        <section id="configurador" className="pb-8">
          <div className="container mx-auto px-4 lg:px-6 max-w-6xl">
            <p className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
              Ajusta tu operación
            </p>

            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">

              {/* ── IZQUIERDA: Sliders ──────────────────────────────────── */}
              <div className="space-y-6">                  {/* Usuarios */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <label htmlFor="range-usuarios" className="text-sm font-black text-white uppercase tracking-tight cursor-pointer">Usuarios</label>
                        <p className="text-xs text-slate-400">Miembros del equipo</p>
                      </div>
                    </div>
                    <span className="text-2xl font-black text-white tabular-nums">{fmtUsuarios(usuarios)}</span>
                  </div>
                  <input
                    id="range-usuarios"
                    type="range"
                    min={USUARIOS_MIN}
                    max={USUARIOS_MAX}
                    value={usuarios}
                    onChange={(e) => setUsuarios(Number(e.target.value))}
                    className="w-full h-2 rounded-full bg-slate-800 appearance-none cursor-pointer accent-purple-500"
                    style={{ background: `linear-gradient(to right, #A855F7 0%, #A855F7 ${usuariosPct}%, #1E293B ${usuariosPct}%, #1E293B 100%)` }}
                  />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] font-bold text-slate-400">{USUARIOS_MIN}</span>
                    <span className="text-[10px] font-bold text-slate-400">{USUARIOS_MAX}+</span>
                  </div>
                </div>

                {/* Contactos */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <label htmlFor="range-contactos" className="text-sm font-black text-white uppercase tracking-tight cursor-pointer">Contactos</label>
                        <p className="text-xs text-slate-400">Base de datos activa</p>
                      </div>
                    </div>
                    <span className="text-2xl font-black text-white tabular-nums">{fmtContactos(contactos)}</span>
                  </div>
                  <input
                    id="range-contactos"
                    type="range"
                    min={CONTACTOS_MIN}
                    max={CONTACTOS_MAX}
                    step={CONTACTOS_STEP}
                    value={contactos}
                    onChange={(e) => setContactos(Number(e.target.value))}
                    className="w-full h-2 rounded-full bg-slate-800 appearance-none cursor-pointer accent-blue-500"
                    style={{ background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${contactosPct}%, #1E293B ${contactosPct}%, #1E293B 100%)` }}
                  />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] font-bold text-slate-400">{fmtContactos(CONTACTOS_MIN)}</span>
                    <span className="text-[10px] font-bold text-slate-400">{fmtContactos(CONTACTOS_MAX)}+</span>
                  </div>
                </div>

                {/* Toggle: Tipo de operación */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <p className="text-sm font-black text-white uppercase tracking-tight mb-4">Tipo de operación</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPlan('scale')}
                      className={`flex-1 p-4 rounded-xl border transition-all text-left ${
                        plan === 'scale'
                          ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/5'
                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                      aria-pressed={plan === 'scale'}
                      aria-label="Plan Scale"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className={`h-4 w-4 ${plan === 'scale' ? 'text-purple-400' : 'text-slate-500'}`} />
                        <span className={`text-sm font-black uppercase ${plan === 'scale' ? 'text-white' : 'text-slate-400'}`}>Scale</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">Crecer y automatizar</p>
                    </button>
                    <button
                      onClick={() => setPlan('compliance')}
                      className={`flex-1 p-4 rounded-xl border transition-all text-left ${
                        plan === 'compliance'
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/5'
                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                      aria-pressed={plan === 'compliance'}
                      aria-label="Plan Compliance Pro"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className={`h-4 w-4 ${plan === 'compliance' ? 'text-indigo-400' : 'text-slate-500'}`} />
                        <span className={`text-sm font-black uppercase ${plan === 'compliance' ? 'text-white' : 'text-slate-400'}`}>Compliance Pro</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">Control y trazabilidad</p>
                    </button>
                  </div>
                </div>

                {/* Toggle Mensual/Anual */}
                <div className="flex justify-center">
                  <div className="bg-slate-800/50 rounded-full p-1 flex gap-1">
                    <button
                      onClick={() => setBillingInterval('monthly')}
                      className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                        billingInterval === 'monthly'
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      aria-pressed={billingInterval === 'monthly'}
                    >Mensual</button>
                    <button
                      onClick={() => setBillingInterval('yearly')}
                      className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                        billingInterval === 'yearly'
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      aria-pressed={billingInterval === 'yearly'}
                    >Anual <span className="text-[9px] text-purple-300 ml-0.5">-20%</span></button>
                  </div>
                </div>
              </div>

              {/* ── DERECHA: DynamicSummary ──────────────────────────────── */}
              <div className="flex flex-col justify-center">
                <DynamicSummary
                  usuarios={usuarios}
                  contactos={contactos}
                  plan={plan}
                  billingInterval={billingInterval}
                  precioMostrar={precioMostrar}
                  precioOriginal={precioOriginal}
                  mensajeLimite={mensajeLimite}
                  result={result}
                />
              </div>

            </div>
          </div>
        </section>

        {/* ══════════ TODO INCLUIDO ════════════════════════════════════════ */}
        <AllIncluded />

        {/* ══════════ TABLA COMPARATIVA ════════════════════════════════════ */}
        <ComparisonTable />

        {/* ══════════ FAQ ══════════════════════════════════════════════════ */}
        <FAQ />

        {/* ══════════ CTA FINAL ════════════════════════════════════════════ */}
        <section className="py-20 border-t border-slate-800">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <div className="bg-gradient-to-r from-purple-900/30 via-slate-900 to-indigo-900/30 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Sparkles className="w-10 h-10 text-purple-400 mx-auto mb-6" />
              <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
                Empieza a operar con Volkern hoy
              </h2>
              <p className="text-slate-400 text-base mb-10 max-w-md mx-auto">
                Configura tu plan en segundos. Sin permanencia.
              </p>
              <button
                onClick={() => {
                  const params = new URLSearchParams({
                    usuarios: String(usuarios),
                    contactos: String(contactos),
                    plan,
                    interval: billingInterval,
                    precio: String(precioMostrar),
                  })
                  window.location.href = `/checkout?${params.toString()}`
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white px-10 py-4 rounded-xl font-bold text-base shadow-xl shadow-purple-600/30 transition-all flex items-center gap-2 mx-auto"
              >
                Configura tu plan
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

      </div>
    </PublicLayout>
  )
}
