'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Activity,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Lock,
  Unlock,
  Loader2,
  BarChart3,
  FileText,
  Users,
  Workflow,
  Minus,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ScoreGauge } from '@/components/compliance/ScoreGauge'
import { ScoreBreakdown } from '@/components/compliance/ScoreBreakdown'
import { IntelligentAlerts } from '@/components/compliance/IntelligentAlerts'
import { WebhookAuditSection } from '@/components/compliance/WebhookAuditSection'
import type { ComplianceScoreReport } from '@/lib/compliance-score'

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  borderColor,
}: {
  icon: any
  label: string
  value: string | React.ReactNode
  sub?: string
  color: string
  borderColor: string
}) {
  return (
    <div className={`bg-white rounded-3xl border-l-4 ${borderColor} border border-slate-200/60 shadow-sm p-6 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-4.5 w-4.5 text-white" size={18} />
        </div>
      </div>
      <div className="text-3xl font-black tracking-tighter text-slate-900">{value}</div>
      {sub && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sub}</p>}
    </div>
  )
}

export default function ComplianceScoreDashboard() {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ComplianceScoreReport | null>(null)

  const fetchScore = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/compliance/score')
      const data = await res.json()
      if (data.success) {
        setReport(data.report)
      } else {
        toast.error('Error cargando score de compliance')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchScore() }, [fetchScore])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Calculando score de cumplimiento...</p>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <ShieldAlert className="h-12 w-12" />
          <p className="text-sm font-bold uppercase tracking-widest">No se pudo calcular el score</p>
          <button
            onClick={fetchScore}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const { overall, categories, mode, alerts, summary, trend, trendDelta } = report

  const overallColor =
    overall >= 90 ? 'text-emerald-600' :
    overall >= 70 ? 'text-lime-600' :
    overall >= 50 ? 'text-amber-600' :
    'text-red-600'

  const overallBorder =
    overall >= 90 ? 'border-l-emerald-500' :
    overall >= 70 ? 'border-l-lime-500' :
    overall >= 50 ? 'border-l-amber-400' :
    'border-l-red-500'

  const overallBg =
    overall >= 90 ? 'bg-emerald-600' :
    overall >= 70 ? 'bg-lime-600' :
    overall >= 50 ? 'bg-amber-500' :
    'bg-red-600'

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-400'

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg ${
            mode === 'compliance' ? 'bg-emerald-600 shadow-emerald-200' : 'bg-slate-500 shadow-slate-200'
          }`}>
            {mode === 'compliance'
              ? <Lock className="h-7 w-7 text-white" />
              : <Unlock className="h-7 w-7 text-white" />}
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
              Score de Cumplimiento
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                mode === 'compliance'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {mode === 'compliance' ? '🔒 MODO COMPLIANCE' : '🔓 MODO NORMAL'}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                Actualizado: {new Date(report.generatedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchScore}
            className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
            title="Actualizar score"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            href="/dashboard/configuracion?section=compliance"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Configurar
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Resumen ejecutivo */}
      <div className={`p-5 rounded-3xl border ${overallBorder} border-slate-200/60 shadow-sm ${
        overall >= 90 ? 'bg-emerald-50/50' :
        overall >= 50 ? 'bg-amber-50/50' :
        'bg-red-50/50'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${overallBg} shadow-lg`}>
            {overall >= 70
              ? <CheckCircle2 className="h-5 w-5 text-white" />
              : <AlertTriangle className="h-5 w-5 text-white" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-700 leading-relaxed">{summary}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TrendIcon className={`h-5 w-5 ${trendColor}`} />
            <span className={`text-xs font-black ${trendColor}`}>
              {trendDelta > 0 ? '+' : ''}{trendDelta} pts
            </span>
          </div>
        </div>
      </div>

      {/* KPIs + Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Score Gauge - ocupa 2 columnas */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 flex flex-col items-center justify-center">
          <ScoreGauge score={overall} size="lg" />
        </div>

        {/* KPIs - ocupa 3 columnas */}
        <div className="lg:col-span-3 grid grid-cols-2 gap-4">
          <KpiCard
            icon={ShieldCheck}
            label="Modo Actual"
            value={
              <span className={mode === 'compliance' ? 'text-emerald-600' : 'text-slate-500'}>
                {mode === 'compliance' ? 'Compliance' : 'Normal'}
              </span>
            }
            sub={mode === 'compliance' ? 'Gates activos' : 'Gates inactivos'}
            color={mode === 'compliance' ? 'bg-emerald-600' : 'bg-slate-500'}
            borderColor={mode === 'compliance' ? 'border-l-emerald-500' : 'border-l-slate-400'}
          />

          <KpiCard
            icon={Activity}
            label="Alertas Totales"
            value={alerts.count}
            sub={`${alerts.critical} críticas · ${alerts.warning} warnings`}
            color={alerts.critical > 0 ? 'bg-red-600' : alerts.warning > 0 ? 'bg-amber-500' : 'bg-emerald-600'}
            borderColor={alerts.critical > 0 ? 'border-l-red-500' : alerts.warning > 0 ? 'border-l-amber-400' : 'border-l-emerald-500'}
          />

          <KpiCard
            icon={BarChart3}
            label="Score Global"
            value={<span className={overallColor}>{overall}%</span>}
            sub={trend === 'up' ? `+${trendDelta} pts respecto al periodo anterior` : trend === 'down' ? `${trendDelta} pts respecto al periodo anterior` : 'Sin cambios'}
            color={overallBg}
            borderColor={overallBorder}
          />

          <KpiCard
            icon={Users}
            label="Categorías Evaluadas"
            value={categories.length}
            sub={`Ponderación: ${Math.round(categories.reduce((a, c) => a + (c.score * c.weight), 0))}% real`}
            color="bg-indigo-600"
            borderColor="border-l-indigo-500"
          />
        </div>
      </div>

      {/* Desglose por categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-tighter">Desglose por Categoría</h2>
              <p className="text-xs text-slate-400 font-bold mt-0.5">Cada categoría se pondera según su impacto en el score global</p>
            </div>
          </div>

          <ScoreBreakdown categories={categories} trend={trend} trendDelta={trendDelta} />
        </div>
      </div>

      {/* Alertas Inteligentes */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6">
        <IntelligentAlerts />
      </div>

      {/* Trazabilidad de Webhooks */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6">
        <WebhookAuditSection />
      </div>

      {/* Reglas activas */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tighter">Reglas de Compliance Gate</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              {mode === 'compliance'
                ? 'Las siguientes reglas están activas y bloquean acciones si no se cumplen'
                : 'Activa Compliance Mode para aplicar estas reglas'}
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {[
            { name: 'Contrato firmado para cerrar deal', desc: 'No se puede cerrar un deal como ganado sin contrato firmado', priority: 'HIGH', icon: FileText },
            { name: 'Firma digital para activar contrato', desc: 'No se puede marcar contrato como vigente sin ambas firmas', priority: 'HIGH', icon: ShieldCheck },
            { name: 'Tareas obligatorias para avanzar pipeline', desc: 'No se puede avanzar de etapa sin tareas obligatorias completadas', priority: 'MEDIUM', icon: Workflow },
            { name: 'Aprobación para cotizaciones > 5.000€', desc: 'Cotizaciones de alto valor requieren aprobación de Manager', priority: 'MEDIUM', icon: BarChart3 },
            { name: 'Razón para cerrar deal perdido', desc: 'No se puede cerrar como perdido sin registrar el motivo', priority: 'MEDIUM', icon: Activity },
            { name: 'Justificación para eliminar contacto', desc: 'No se puede eliminar un contacto sin justificación escrita', priority: 'LOW', icon: Users },
          ].map((rule, i) => (
            <div key={i} className="flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                  rule.priority === 'HIGH' ? 'bg-red-100 text-red-600' :
                  rule.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  <rule.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 leading-relaxed">
                    {mode === 'compliance' ? '🔒 ' : '🔓 '}
                    {rule.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                      rule.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                      rule.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{rule.priority}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{rule.desc}</span>
                  </div>
                </div>
              </div>

              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                mode === 'compliance'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-400'
              }`}>
                {mode === 'compliance' ? 'Activa' : 'Inactiva'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer con links */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <p className="text-[10px] font-bold text-slate-400">
          Los scores se calculan en tiempo real con datos del tenant.
          {mode === 'normal' && ' Activa Compliance Mode desde Configuración para habilitar los gates.'}
        </p>
        <Link
          href="/dashboard/configuracion?section=compliance"
          className="flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-wider"
        >
          Ir a Configuración <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
