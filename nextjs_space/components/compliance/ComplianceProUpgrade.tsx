'use client'

import { useState } from 'react'
import {
  ShieldCheck,
  Lock,
  FileText,
  Workflow,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Zap,
  X,
  Loader2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Users,
  Activity,
  FileSignature,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const COMPLIANCE_PRO_FEATURES = [
  {
    icon: Lock,
    name: 'Compliance Gate',
    desc: '6 reglas de procesos obligatorios no evitables que bloquean acciones hasta cumplir requisitos',
    status: 'ready' as const,
  },
  {
    icon: BarChart3,
    name: 'Score Dashboard',
    desc: 'Dashboard ejecutivo con score 0-100%, 5 categorías, tendencias y resumen IA',
    status: 'ready' as const,
  },
  {
    icon: Activity,
    name: 'Alertas Inteligentes',
    desc: 'Detección automática de acciones fuera de flujo, accesos inusuales y procesos incompletos',
    status: 'ready' as const,
  },
  {
    icon: ShieldCheck,
    name: 'Modos de Control',
    desc: 'Toggle Normal/Compliance con badge visible en sidebar y justificación obligatoria',
    status: 'ready' as const,
  },
  {
    icon: FileSignature,
    name: 'Trazabilidad Total',
    desc: 'Hash SHA-256 encadenado en contratos, audit trail completo y certificados de cumplimiento',
    status: 'ready' as const,
  },
  {
    icon: FileText,
    name: 'Procesos Controlados',
    desc: 'Workflows con aprobación, tareas obligatorias y cotizaciones con umbral de autorización',
    status: 'ready' as const,
  },
  {
    icon: AlertTriangle,
    name: 'Prevención de Riesgos',
    desc: 'Alertas tempranas sobre deals estancados, contratos sin firmar y aprobaciones pendientes',
    status: 'ready' as const,
  },
  {
    icon: Users,
    name: 'Control de Accesos',
    desc: 'Usuarios sin rol detectados, cambios críticos auditados y matriz de permisos reforzada',
    status: 'ready' as const,
  },
]

interface ComplianceProUpgradeProps {
  onClose?: () => void
  compact?: boolean
}

export function ComplianceProUpgrade({ onClose, compact = false }: ComplianceProUpgradeProps) {
  const [activating, setActivating] = useState(false)
  const [activated, setActivated] = useState(false)

  const handleActivate = async () => {
    setActivating(true)
    try {
      const res = await fetch('/api/compliance/upgrade', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setActivated(true)
        toast.success('✅ Compliance PRO activado correctamente')
        if (onClose) setTimeout(onClose, 1500)
      } else {
        toast.error(data.error || 'Error activando Compliance PRO')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setActivating(false)
    }
  }

  if (activated) {
    return (
      <div className="text-center py-12 space-y-4 animate-in fade-in zoom-in duration-500">
        <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h3 className="text-xl font-black uppercase tracking-tight">Compliance PRO Activado</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Ya puedes usar todos los módulos de compliance. Ve al dashboard para ver tu score y alertas.
        </p>
        <Link
          href="/dashboard/compliance"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all mt-4"
        >
          Ir al Dashboard <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                Compliance <span className="text-indigo-600">PRO</span>
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Upgrade · desde €149/mes
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Value proposition */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100">
        <p className="text-sm font-bold text-slate-700 leading-relaxed">
          <Zap className="h-4 w-4 text-indigo-600 inline mr-1" />
          <strong className="text-indigo-600">No solo gestionas tu empresa</strong> — puedes demostrar que todo se hace correctamente.
          Trazabilidad total, procesos obligatorios, alertas inteligentes y certificación digital.
        </p>
      </div>

      {/* Price */}
      <div className="text-center py-4">
        <span className="text-4xl font-black text-slate-900">€149</span>
        <span className="text-sm text-slate-400 font-bold ml-2">/mes</span>
        <p className="text-[10px] text-slate-400 font-medium mt-1">
          Addon para planes Profesional e Infinity · Cancelación en cualquier momento
        </p>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {COMPLIANCE_PRO_FEATURES.map((feat, i) => {
          const Icon = feat.icon
          return (
            <div
              key={i}
              className="flex items-start gap-3 p-4 rounded-xl border border-slate-200/60 bg-white hover:border-indigo-200 hover:shadow-sm transition-all"
            >
              <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Icon className="h-4.5 w-4.5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black text-slate-800">{feat.name}</p>
                  {feat.status === 'ready' && (
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      Listo
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          onClick={handleActivate}
          disabled={activating}
          className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-black uppercase tracking-widest hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
        >
          {activating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Activar Compliance PRO — €149/mes
            </>
          )}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="px-6 py-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Trust */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 font-medium">
        <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Pago seguro</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Sin permanencia</span>
        <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Activación inmediata</span>
      </div>
    </div>
  )
}

export default ComplianceProUpgrade
