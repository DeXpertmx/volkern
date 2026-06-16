'use client'

import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  Lock,
  FileText,
  Workflow,
  AlertTriangle,
  BarChart3,
  Zap,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Activity,
  Users,
  FileSignature,
  Eye,
  Globe,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Lock,
    title: 'Compliance Gate',
    desc: '6 reglas de procesos obligatorios que bloquean acciones hasta cumplir todos los requisitos. No se cierra un deal sin contrato firmado, no se activa sin firma digital.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: BarChart3,
    title: 'Score de Cumplimiento',
    desc: 'Dashboard ejecutivo con puntuación 0-100% en tiempo real. Cinco categorías ponderadas con desglose detallado y tendencias históricas.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: Activity,
    title: 'Alertas Inteligentes',
    desc: 'Detección automática de acciones fuera de flujo, accesos inusuales, procesos incompletos y cambios críticos. Prevención antes del error.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: ShieldCheck,
    title: 'Modos de Control',
    desc: 'Toggle Normal/Compliance con badge visible en toda la plataforma. Justificación obligatoria y registro auditado de cada cambio de modo.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: FileSignature,
    title: 'Trazabilidad Total',
    desc: 'Hash SHA-256 encadenado en cada contrato. Audit trail inmutable con +15 tipos de eventos. Certificados de cumplimiento verificables.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Globe,
    title: 'Webhooks Auditables',
    desc: 'Integración con sistemas externos (bancos, ERPs, APIs) con trazabilidad completa. Cada webhook queda registrado en la cadena de auditoría.',
    color: 'bg-rose-50 text-rose-600',
  },
]

const TRUST_ITEMS = [
  { icon: Activity, text: 'Activación inmediata' },
  { icon: CheckCircle2, text: 'Sin permanencia mínima' },
  { icon: ShieldCheck, text: 'Cumplimiento RGPD' },
  { icon: Eye, text: '100% transparente' },
]

export default function ComplianceProLanding() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-950 to-purple-900/30" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-black uppercase tracking-widest">
            <Sparkles className="h-3.5 w-3.5" />
            Nuevo: Compliance PRO
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none">
            No solo gestionas
            <br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              puedes demostrarlo
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Trazabilidad total, procesos obligatorios, alertas inteligentes y certificación digital.
            Convierte el cumplimiento normativo en tu ventaja competitiva.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={() => router.push('/precios')}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-black uppercase tracking-widest hover:from-indigo-700 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              Ver planes y precios
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push('/dashboard/compliance')}
              className="px-8 py-4 rounded-2xl border border-slate-700 text-slate-300 text-sm font-bold hover:bg-slate-800 transition-all"
            >
              Ver demo en dashboard
            </button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-6">
        <div className="max-w-lg mx-auto">
          <div className="relative p-8 rounded-[2rem] bg-gradient-to-b from-indigo-950 to-slate-900 border border-indigo-500/20 shadow-2xl shadow-indigo-500/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-black px-4 py-1 rounded-full">
              UPGRADE
            </div>
            <div className="text-center space-y-6 pt-4">
              <h3 className="text-2xl font-black uppercase tracking-tight">
                Compliance <span className="text-indigo-400">PRO</span>
              </h3>
              <p className="text-slate-400 text-sm">
                Addon para planes Profesional e Infinity. Trazabilidad total, gates obligatorios y alertas inteligentes.
              </p>
              <div>
                <span className="text-5xl font-black">€149</span>
                <span className="text-slate-400 ml-2">/mes</span>
              </div>
              <ul className="space-y-3 text-left">
                {FEATURES.map((f, i) => {
                  const Icon = f.icon
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${f.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{f.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{f.desc}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <button
                onClick={() => router.push('/signup')}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-black uppercase tracking-widest hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25"
              >
                Activar Compliance PRO
                <ArrowRight className="h-4 w-4 inline ml-2" />
              </button>
              <div className="flex items-center justify-center gap-6 text-[10px] text-slate-500 font-medium">
                {TRUST_ITEMS.map((t, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <t.icon className="h-3 w-3" />
                    {t.text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value pitch */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <p className="text-2xl md:text-3xl font-bold text-slate-300 italic leading-relaxed">
            "Cuando tu cliente te pregunte cómo demuestras que todo se hace correctamente,
            Compliance PRO es tu respuesta."
          </p>
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
            <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">
              Confianza · Control · Cumplimiento
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="py-12 px-6 border-t border-slate-800">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Volkern Compliance PRO — © {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <button onClick={() => router.push('/precios')} className="hover:text-slate-300 transition-colors">
              Precios
            </button>
            <button onClick={() => router.push('/dashboard/compliance')} className="hover:text-slate-300 transition-colors">
              Dashboard
            </button>
            <button onClick={() => router.push('/signup')} className="hover:text-slate-300 transition-colors">
              Comenzar
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
