'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Users,
  FileText,
  Activity,
  Workflow,
  Lock,
  TrendingUp,
  Eye,
  ExternalLink,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type {
  IntelligentAlert,
  IntelligentAlertSummary,
  AlertCategory,
  AlertSeverity,
} from '@/lib/compliance-alerts'

/* ─── Helpers visuales ────────────────────────────────────────────────────── */

const CATEGORY_CONFIG: Record<AlertCategory, { label: string; icon: any; color: string; bg: string }> = {
  flujo: {
    label: 'Fuera de flujo',
    icon: Workflow,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  acceso: {
    label: 'Acceso inusual',
    icon: Users,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  proceso: {
    label: 'Proceso incompleto',
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  cambio_critico: {
    label: 'Cambio crítico',
    icon: Lock,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
}

const SEVERITY_STYLES: Record<AlertSeverity, { badge: string; bg: string; icon: any; color: string }> = {
  CRITICAL: {
    badge: 'bg-red-100 text-red-700',
    bg: 'bg-red-50/50 border-red-200',
    icon: ShieldAlert,
    color: 'text-red-600',
  },
  WARNING: {
    badge: 'bg-amber-100 text-amber-700',
    bg: 'bg-amber-50/50 border-amber-200',
    icon: AlertTriangle,
    color: 'text-amber-600',
  },
  INFO: {
    badge: 'bg-blue-100 text-blue-700',
    bg: 'bg-blue-50/50 border-blue-200',
    icon: Activity,
    color: 'text-blue-600',
  },
}

/* ─── Componente principal ─────────────────────────────────────────────────── */

interface IntelligentAlertsProps {
  /** Si true, solo muestra un resumen compacto (para integración en dashboard) */
  compact?: boolean
}

export function IntelligentAlerts({ compact = false }: IntelligentAlertsProps) {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<IntelligentAlertSummary | null>(null)
  const [filterCategory, setFilterCategory] = useState<AlertCategory | 'all'>('all')
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/compliance/alerts')
      const data = await res.json()
      if (data.success) {
        setSummary(data as IntelligentAlertSummary)
      } else {
        setError(data.error || 'Error cargando alertas')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  const filteredAlerts = useMemo(() => {
    if (!summary) return []
    let alerts = summary.alerts
    if (filterCategory !== 'all') {
      alerts = alerts.filter(a => a.category === filterCategory)
    }
    if (filterSeverity !== 'all') {
      alerts = alerts.filter(a => a.severity === filterSeverity)
    }
    return alerts
  }, [summary, filterCategory, filterSeverity])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Analizando patrones de riesgo...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <AlertTriangle className="h-10 w-10" />
          <p className="text-sm font-bold uppercase tracking-widest">{error}</p>
          <button
            onClick={fetchAlerts}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!summary) return null

  const { total, critical, warning, info, byCategory, mode } = summary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
            critical > 0 ? 'bg-red-100' : warning > 0 ? 'bg-amber-100' : 'bg-emerald-100'
          }`}>
            {critical > 0
              ? <ShieldAlert className={`h-5 w-5 ${SEVERITY_STYLES.CRITICAL.color}`} />
              : warning > 0
                ? <AlertTriangle className={`h-5 w-5 ${SEVERITY_STYLES.WARNING.color}`} />
                : <CheckCircle2 className={`h-5 w-5 text-emerald-600`} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Alertas Inteligentes</h3>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                total === 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : critical > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
              }`}>
                {total === 0 ? 'Sin riesgos' : `${total} activas`}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              Detección basada en {mode === 'compliance' ? 'Modo Compliance' : 'Modo Normal'}
            </p>
          </div>
        </div>

        <button
          onClick={fetchAlerts}
          className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
          title="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Resumen de categorías */}
      {!compact && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.entries(CATEGORY_CONFIG) as [AlertCategory, typeof CATEGORY_CONFIG['flujo']][]).map(([key, config]) => {
            const Icon = config.icon
            const count = byCategory[key] || 0
            const isActive = filterCategory === key
            return (
              <button
                key={key}
                onClick={() => setFilterCategory(isActive ? 'all' : key)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isActive
                    ? `${config.bg} ${config.color} border-current shadow-sm`
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <div className="text-left">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{config.label}</p>
                  <p className={`text-lg font-black ${isActive ? config.color : 'text-slate-800'}`}>
                    {count}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Filtros por severidad */}
      {!compact && filteredAlerts.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          {(['CRITICAL', 'WARNING', 'INFO'] as AlertSeverity[]).map(sev => {
            const isActive = filterSeverity === sev
            const s = SEVERITY_STYLES[sev]
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(isActive ? 'all' : sev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                  isActive
                    ? `${s.bg} ${s.color} border-current`
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <s.icon className="h-3 w-3" />
                {sev === 'CRITICAL' ? 'Críticas' : sev === 'WARNING' ? 'Advertencias' : 'Informativas'}
              </button>
            )
          })}
          {filterCategory !== 'all' || filterSeverity !== 'all' ? (
            <button
              onClick={() => { setFilterCategory('all'); setFilterSeverity('all') }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          ) : null}
        </div>
      )}

      {/* Lista de alertas */}
      {filteredAlerts.length === 0 ? (
        <div className="py-12 text-center flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">
            {total === 0
              ? 'No se detectaron riesgos. El sistema opera con normalidad.'
              : 'No hay alertas con los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const sev = SEVERITY_STYLES[alert.severity]
            const cat = CATEGORY_CONFIG[alert.category]
            const SevIcon = sev.icon
            const CatIcon = cat.icon
            const daysAgo = Math.floor((Date.now() - new Date(alert.detectedAt).getTime()) / (1000 * 60 * 60 * 24))
            const hoursAgo = Math.floor((Date.now() - new Date(alert.detectedAt).getTime()) / (1000 * 60 * 60))

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-2xl border ${sev.bg} shadow-sm overflow-hidden group hover:shadow-md transition-all`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icono de severidad */}
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${sev.bg.replace('border-', '')} ${sev.color}`}>
                      <SevIcon className="h-5 w-5" />
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${sev.badge}`}>
                          {alert.severity}
                        </span>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                          <CatIcon className="h-2.5 w-2.5 inline mr-0.5" />
                          {cat.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium ml-auto">
                          {daysAgo > 0 ? `hace ${daysAgo}d` : hoursAgo > 0 ? `hace ${hoursAgo}h` : 'ahora'}
                        </span>
                      </div>

                      <h4 className="text-xs font-black text-slate-800 leading-relaxed">
                        {alert.title}
                      </h4>

                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        {alert.description}
                      </p>

                      {/* Acción sugerida */}
                      {alert.action && (
                        <div className="mt-2">
                          {alert.action.href ? (
                            <Link
                              href={alert.action.href}
                              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                              {alert.action.label}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                              {alert.action.label}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {!compact && filteredAlerts.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
          <p className="text-[10px] text-slate-400 font-medium">
            Las alertas se generan analizando datos en tiempo real.
            {mode === 'normal' && ' Activa Compliance Mode para gates más restrictivos.'}
          </p>
          <button
            onClick={fetchAlerts}
            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline"
          >
            Actualizar <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

export default IntelligentAlerts
