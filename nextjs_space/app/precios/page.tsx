'use client'

import { useState, useMemo } from 'react'
import { PublicLayout } from '@/components/public/PublicLayout'
import {
  calcularPrecio,
  getMensajeLimite,
  getComparisonTable,
  type PlanTipo,
  type PricingResult,
} from '@/lib/pricing-engine'
import { Check, ArrowRight, Users, BookOpen, Shield, Zap, Sparkles, HelpCircle, ChevronDown } from 'lucide-react'
import Link from 'next/link'

/* ─── Constantes ───────────────────────────────────────────────────────────── */

const USUARIOS_MIN = 1
const USUARIOS_MAX = 99
const CONTACTOS_MIN = 1000
const CONTACTOS_MAX = 99000
const CONTACTOS_STEP = 1000

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

/* ─── FAQ ──────────────────────────────────────────────────────────────────── */

const FAQ_ITEMS = [
  {
    q: '¿Qué pasa si mi negocio crece?',
    a: 'Volkern se adapta automáticamente a tu operación sin necesidad de cambiar de plan o migrar.',
  },
  {
    q: '¿Puedo cambiar de configuración después?',
    a: 'Sí, puedes ajustar usuarios, contactos y tipo de operación en cualquier momento.',
  },
  {
    q: '¿Qué incluye Compliance Pro?',
    a: 'Incluye todo lo necesario para operar con control, trazabilidad y preparación para auditoría.',
  },
  {
    q: '¿Cómo funciona el pago?',
    a: 'Puedes elegir entre pago mensual o anual con descuento.',
  },
]

/* ─── Secciones ────────────────────────────────────────────────────────────── */

function ValueReinforcement() {
  return (
    <div className="py-16 border-t border-slate-800">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-black text-white mb-4">
          Todo incluido desde el primer momento
        </h2>
        <p className="text-slate-400 text-base leading-relaxed">
          CRM, marketing, ventas, facturación, RRHH, automatización, firma digital, comunicación y más.
        </p>
        <p className="text-slate-500 text-sm mt-3">
          No eliges módulos. Volkern ya lo incluye todo.
        </p>
      </div>
    </div>
  )
}

function PlanDifference() {
  return (
    <div className="py-16 border-t border-slate-800">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-2">
            Dos formas de operar
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Scale */}
          <div className="p-8 rounded-3xl bg-slate-900/60 border border-purple-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-purple-400" />
              </div>
              <h3 className="text-xl font-black text-white">Volkern Scale</h3>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Para empresas que buscan crecer y automatizar su operación.
            </p>
            <div className="space-y-3">
              {[
                'Gestión completa del negocio',
                'Automatización dinámica',
                'Facturación escalable',
                'Integraciones completas',
                'Operación centralizada',
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-slate-300">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Pro */}
          <div className="p-8 rounded-3xl bg-slate-900/60 border border-indigo-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-indigo-400" />
              </div>
              <h3 className="text-xl font-black text-white">Volkern Compliance Pro</h3>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Para empresas que necesitan control, trazabilidad y cumplimiento.
            </p>
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Todo lo de Scale, más:</p>
              {[
                'Trazabilidad completa de acciones',
                'Procesos auditables',
                'Control y validación operativa',
                'Gestión documental certificada',
                'Preparación para cumplimiento fiscal',
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-slate-300">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KeyPhrase() {
  return (
    <div className="py-16 border-t border-slate-800">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-black text-white leading-relaxed">
          No solo operas tu negocio.
        </h2>
        <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mt-1">
          Puedes demostrar que todo se hace correctamente.
        </h2>
      </div>
    </div>
  )
}

function TrustBlock() {
  return (
    <div className="py-16 border-t border-slate-800">
      <div className="max-w-lg mx-auto space-y-4">
        {[
          'Empieza desde €50',
          'Escala sin cambiar de sistema',
          'Todo en un solo lugar',
          'Sin complejidad técnica',
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Check className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-sm font-bold text-white">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  return (
    <div className="py-16 border-t border-slate-800">
      <div className="max-w-2xl mx-auto">
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
                >
                  <span className="text-sm font-bold text-white pr-4">{item.q}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 animate-in fade-in duration-200">
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
  const [usuarios, setUsuarios] = useState(5)
  const [contactos, setContactos] = useState(5000)
  const [plan, setPlan] = useState<PlanTipo>('scale')
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')

  const result: PricingResult = useMemo(
    () => calcularPrecio({ usuarios, contactos, plan }),
    [usuarios, contactos, plan]
  )

  const mensajeLimite = getMensajeLimite(result.esMaximo, result.esAltoVolumen)
  const comparison = useMemo(() => getComparisonTable(), [])
  const precioMostrar = billingInterval === 'yearly' ? Math.round(result.precio * 0.8) : result.precio
  const usuariosPct = ((usuarios - USUARIOS_MIN) / (USUARIOS_MAX - USUARIOS_MIN)) * 100
  const contactosPct = ((contactos - CONTACTOS_MIN) / (CONTACTOS_MAX - CONTACTOS_MIN)) * 100

  return (
    <PublicLayout>
      <div className="min-h-screen bg-slate-950">

        {/* ══════════ HERO ══════════════════════════════════════════════════ */}
        <section className="pt-28 pb-6">
          <div className="container mx-auto px-4 lg:px-6 max-w-3xl text-center">
            <h1 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tight leading-tight">
              Elige cómo quieres escalar{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
                tu operación
              </span>
            </h1>
            <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto">
              Configura Volkern en tiempo real según tu negocio. Sin módulos ocultos. Sin límites innecesarios.
            </p>
          </div>
        </section>

        {/* ══════════ SLIDER PRINCIPAL ══════════════════════════════════════ */}
        <section className="pb-8">
          <div className="container mx-auto px-4 lg:px-6 max-w-6xl">
            <p className="text-center text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">
              Ajusta tu operación
            </p>

            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">

              {/* ── IZQUIERDA ────────────────────────────────────────────── */}
              <div className="space-y-6">
                {/* Usuarios */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
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
                    <span className="text-2xl font-black text-white tabular-nums">{fmtUsuarios(usuarios)}</span>
                  </div>
                  <input
                    type="range"
                    min={USUARIOS_MIN}
                    max={USUARIOS_MAX}
                    value={usuarios}
                    onChange={(e) => setUsuarios(Number(e.target.value))}
                    className="w-full h-2 rounded-full bg-slate-800 appearance-none cursor-pointer accent-purple-500"
                    style={{ background: `linear-gradient(to right, #A855F7 0%, #A855F7 ${usuariosPct}%, #1E293B ${usuariosPct}%, #1E293B 100%)` }}
                  />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] font-bold text-slate-600">{USUARIOS_MIN}</span>
                    <span className="text-[10px] font-bold text-slate-600">{USUARIOS_MAX}+</span>
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
                        <p className="text-sm font-black text-white uppercase tracking-tight">Contactos</p>
                        <p className="text-xs text-slate-500">Base de datos activa</p>
                      </div>
                    </div>
                    <span className="text-2xl font-black text-white tabular-nums">{fmtContactos(contactos)}</span>
                  </div>
                  <input
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
                    <span className="text-[10px] font-bold text-slate-600">{fmtContactos(CONTACTOS_MIN)}</span>
                    <span className="text-[10px] font-bold text-slate-600">{fmtContactos(CONTACTOS_MAX)}+</span>
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
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className={`h-4 w-4 ${plan === 'scale' ? 'text-purple-400' : 'text-slate-500'}`} />
                        <span className={`text-sm font-black uppercase ${plan === 'scale' ? 'text-white' : 'text-slate-400'}`}>Scale</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Crecer y automatizar</p>
                    </button>
                    <button
                      onClick={() => setPlan('compliance')}
                      className={`flex-1 p-4 rounded-xl border transition-all text-left ${
                        plan === 'compliance'
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/5'
                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className={`h-4 w-4 ${plan === 'compliance' ? 'text-indigo-400' : 'text-slate-500'}`} />
                        <span className={`text-sm font-black uppercase ${plan === 'compliance' ? 'text-white' : 'text-slate-400'}`}>Compliance Pro</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Control y trazabilidad</p>
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
                    >Mensual</button>
                    <button
                      onClick={() => setBillingInterval('yearly')}
                      className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                        billingInterval === 'yearly'
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >Anual <span className="text-[9px] text-purple-300 ml-0.5">-20%</span></button>
                  </div>
                </div>
              </div>

              {/* ── DERECHA: Precio + Features ──────────────────────────── */}
              <div className="flex flex-col justify-center">
                <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 shadow-2xl">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                      plan === 'compliance'
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
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
                    <p className="text-[11px] text-emerald-500 font-bold mb-3">Facturado anualmente · 20% de ahorro</p>
                  )}
                  {billingInterval === 'monthly' && (
                    <p className="text-sm text-slate-400 mb-4">El precio se adapta automáticamente a tu negocio</p>
                  )}

                  {mensajeLimite && (
                    <div className={`p-4 rounded-xl border mb-6 ${
                      result.esMaximo
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    }`}>
                      <p className="text-xs font-bold">{mensajeLimite}</p>
                      {result.esMaximo && (
                        <button
                          onClick={() => window.location.href = 'mailto:ventas@volkern.com'}
                          className="mt-2 text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2"
                        >
                          Contactar para plan personalizado
                        </button>
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

                  <button
                    onClick={() => {
                      if (result.esMaximo) {
                        window.location.href = 'mailto:ventas@volkern.com'
                        return
                      }
                      const params = new URLSearchParams({
                        usuarios: String(usuarios),
                        contactos: String(contactos),
                        plan,
                        interval: billingInterval,
                        precio: String(precioMostrar),
                      })
                      window.location.href = `/signup?${params.toString()}`
                    }}
                    className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                      result.esMaximo
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
                        : plan === 'compliance'
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
                    }`}
                  >
                    {result.esMaximo ? 'Solicitar plan personalizado' : 'Configura tu plan'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════ REFUERZO ══════════════════════════════════════════════ */}
        <ValueReinforcement />

        {/* ══════════ DOS FORMAS DE OPERAR ══════════════════════════════════ */}
        <PlanDifference />

        {/* ══════════ FRASE CLAVE ═══════════════════════════════════════════ */}
        <KeyPhrase />

        {/* ══════════ TABLA COMPARATIVA ════════════════════════════════════ */}
        <section className="pb-16 border-t border-slate-800">
          <div className="container mx-auto px-4 lg:px-6 max-w-3xl pt-16">
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest"></th>
                    <th className="text-center p-5 text-[11px] font-black text-purple-400 uppercase tracking-widest bg-purple-500/5 w-[30%]">Scale</th>
                    <th className="text-center p-5 text-[11px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/5 w-[30%]">Compliance Pro</th>
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
          </div>
        </section>

        {/* ══════════ CONFIANZA ═════════════════════════════════════════════ */}
        <TrustBlock />

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
                Configura tu plan en segundos y escala sin límites.
              </p>
              <Link href={`/signup?usuarios=${usuarios}&contactos=${contactos}&plan=${plan}&interval=${billingInterval}&precio=${precioMostrar}`}>
                <button className="bg-purple-600 hover:bg-purple-500 text-white px-10 py-4 rounded-xl font-bold text-base shadow-xl shadow-purple-600/30 transition-all flex items-center gap-2 mx-auto">
                  Empezar ahora
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
            </div>
          </div>
        </section>

      </div>
    </PublicLayout>
  )
}
