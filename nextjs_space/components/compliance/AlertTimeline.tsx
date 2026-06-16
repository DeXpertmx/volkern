'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertTriangle,
  ShieldAlert,
  Activity,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Clock,
  Calendar,
  ChevronDown,
  Filter,
  X,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'

/* ─── Types ────────────────────────────────────────────────────────────────── */

type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

interface TimelineAlert {
  id: string
  title: string
  description: string
  severity: AlertSeverity
  category: string
  detectedAt: string
  resolvedAt?: string
  action?: {
    label: string
    href?: string
  }
}

interface TimelineSummary {
  success: boolean
  alerts: TimelineAlert[]
  total: number
  critical: number
  warning: number
  info: number
  mode: string
}

/* ─── Visual config ────────────────────────────────────────────────────────── */

const SEVERITY_STYLES: Record<AlertSeverity, {
  dot: string
  bg: string
  border: string
  badge: string
  icon: any
  color: string
}> = {
  CRITICAL: {
    dot: 'bg-red-500 ring-red-200',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    icon: ShieldAlert,
    color: 'text-red-600',
  },
  WARNING: {
    dot: 'bg-amber-500 ring-amber-200',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    icon: AlertTriangle,
    color: 'text-amber-600',
  },
  INFO: {
    dot: 'bg-blue-500 ring-blue-200',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    icon: Activity,
    color: 'text-blue-600',
  },
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / (1000 * 60))
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin} min`
  if (diffHrs < 24) return `Hace ${diffHrs}h`
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Hoy'
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer'
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

type DateGroup = { label: string; alerts: TimelineAlert[] }

function groupByDate(alerts: TimelineAlert[]): DateGroup[] {
  const groups = new Map<string, TimelineAlert[]>()
  for (const alert of alerts) {
    const key = formatDateLabel(alert.detectedAt)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(alert)
  }
  return Array.from(groups.entries()).map(([label, alerts]) => ({ label, alerts }))
}

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface AlertTimelineProps {
  compact?: boolean
  limit?: number
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export function AlertTimeline({ compact = false, limit }: AlertTimelineProps) {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<TimelineSummary | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'all'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/compliance/alerts')
      const data = await res.json()
      if (data.success) {
        setSummary(data as TimelineSummary)
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
    if (filterSeverity !== 'all') {
      alerts = alerts.filter(a => a.severity === filterSeverity)
    }
    if (limit && limit > 0) {
      alerts = alerts.slice(0, limit)
    }
    return alerts
  }, [summary, filterSeverity, limit])

  const dateGroups = useMemo(() => groupByDate(filteredAlerts), [filteredAlerts])

  // Auto-expand first group
  useEffect(() => {
    if (dateGroups.length > 0) {
      setExpandedGroups(prev => {
        const next = new Set(prev)
        next.add(dateGroups[0].label)
        return next
      })
    }
  }, [dateGroups.length])

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  /* ── Loading ─────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando timeline...</p>
        </div>
      </div>
    )
  }

  /* ── Error ───────────────────────────────────────────────────────────── */

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <AlertTriangle className="h-10 w-10" />
          <p className="text-sm font-bold uppercase tracking-widest">{error}</p>
          <button
            onClick={fetchAlerts}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!summary) return null

  /* ── Empty ───────────────────────────────────────────────────────────── */

  if (filteredAlerts.length === 0) {
    return (
      <div className="space-y-4">
        {/* Severity filter buttons */}
        {!compact && (
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            {(['CRITICAL', 'WARNING', 'INFO'] as AlertSeverity[]).map(sev => {
              const s = SEVERITY_STYLES[sev]
              const Icon = s.icon
              const isActive = filterSeverity === sev
              return (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(isActive ? 'all' : sev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                    isActive ? `${s.bg} ${s.color} border-current` : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {sev === 'CRITICAL' ? 'Críticas' : sev === 'WARNING' ? 'Warnings' : 'Info'}
                </button>
              )
            })}
            {filterSeverity !== 'all' && (
              <button
                onClick={() => setFilterSeverity('all')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
        )}
        <div className="py-12 text-center flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">
            {summary.total === 0
              ? 'No hay alertas en el timeline. Todo opera con normalidad.'
              : 'No hay alertas con el filtro seleccionado.'}
          </p>
        </div>
      </div>
    )
  }

  /* ── Timeline ────────────────────────────────────────────────────────── */

  // Summary stats for header
  const { critical, warning, info } = summary

  return (
    <div className="space-y-5">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                Timeline de Alertas
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                {filteredAlerts.length} de {summary.total} alertas
              </p>
            </div>
          </div>
          <button
            onClick={fetchAlerts}
            className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats bar */}
      {!compact && summary.total > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-[10px] font-black text-red-600">{critical}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[10px] font-black text-amber-600">{warning}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-black text-blue-600">{info}</span>
          </div>
          <span className="text-[9px] text-slate-400 ml-auto">
            {summary.mode === 'compliance' ? 'Modo Compliance' : 'Modo Normal'}
          </span>
        </div>
      )}

      {/* Severity filter (compact also shows it) */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['CRITICAL', 'WARNING', 'INFO'] as AlertSeverity[]).map(sev => {
          const s = SEVERITY_STYLES[sev]
          const Icon = s.icon
          const isActive = filterSeverity === sev
          const count = sev === 'CRITICAL' ? critical : sev === 'WARNING' ? warning : info
          return (
            <button
              key={sev}
              onClick={() => setFilterSeverity(isActive ? 'all' : sev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                isActive ? `${s.bg} ${s.color} border-current` : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3 w-3" />
              {sev === 'CRITICAL' ? 'Críticas' : sev === 'WARNING' ? 'Warnings' : 'Info'}
              {!compact && <span className="ml-0.5 opacity-60">{count}</span>}
            </button>
          )
        })}
        {(filterSeverity !== 'all' || !compact) && (
          <button
            onClick={() => setFilterSeverity('all')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Timeline groups */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[23px] top-0 bottom-0 w-px bg-slate-200" aria-hidden="true" />

        <div className="space-y-6">
          {dateGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.label) || compact
            return (
              <div key={group.label}>
                {/* Date header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center gap-3 w-full text-left group mb-3"
                >
                  <div className="relative z-10 h-5 w-5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center group-hover:border-indigo-400 transition-colors shrink-0">
                    <Calendar className="h-2.5 w-2.5 text-slate-400 group-hover:text-indigo-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                      {group.label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {group.alerts.length}
                    </span>
                    {!compact && (
                      <ChevronDown
                        className={`h-3 w-3 text-slate-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </div>
                </button>

                {/* Alerts in group */}
                {isExpanded && (
                  <div className="space-y-3 ml-2">
                    {group.alerts.map((alert, idx) => {
                      const sev = SEVERITY_STYLES[alert.severity]
                      const SevIcon = sev.icon
                      const isLast = idx === group.alerts.length - 1

                      return (
                        <div key={alert.id} className="flex gap-3">
                          {/* Dot with connector */}
                          <div className="flex flex-col items-center shrink-0 pt-1">
                            <div className={`relative z-10 h-4 w-4 rounded-full ${sev.dot} ring-2 flex items-center justify-center`}>
                              <div className={`h-2 w-2 rounded-full ${sev.dot.replace('ring-', 'bg-').split(' ')[0]}`} />
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-slate-100 my-0.5" />}
                          </div>

                          {/* Card */}
                          <div className={`flex-1 p-3 rounded-xl border ${sev.border} ${sev.bg} mb-1`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${sev.badge}`}>
                                    {alert.severity}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {formatRelativeTime(alert.detectedAt)}
                                  </span>
                                  {alert.resolvedAt && (
                                    <span className="text-[9px] text-emerald-600 font-bold ml-auto">
                                      Resuelta
                                    </span>
                                  )}
                                </div>

                                <h4 className="text-xs font-black text-slate-800 leading-snug">
                                  {alert.title}
                                </h4>

                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                  {alert.description}
                                </p>

                                {alert.action && (
                                  <div className="mt-2">
                                    {alert.action.href ? (
                                      <Link
                                        href={alert.action.href}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                      >
                                        {alert.action.label}
                                        <ExternalLink className="h-2.5 w-2.5" />
                                      </Link>
                                    ) : (
                                      <span className="text-[10px] font-bold text-slate-500">
                                        {alert.action.label}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <SevIcon className={`h-4 w-4 ${sev.color} shrink-0 mt-0.5`} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      {!compact && summary.total > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
          <p className="text-[10px] text-slate-400 font-medium">
            Timeline actualizado. Las alertas se archivan automáticamente tras 90 días.
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

export default AlertTimeline
