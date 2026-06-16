'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Globe,
  Send,
  Download,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Link,
} from 'lucide-react'

interface WebhookAuditStats {
  totalDispatched: number
  totalDelivered: number
  totalFailed: number
  recentDeliveries: number
  timestamp: string
}

interface RecentAudit {
  id: string
  action: string
  description: string
  createdAt: string
  metadata?: any
}

/* ─── Componente ──────────────────────────────────────────────────────────── */

export function WebhookAuditSection() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<WebhookAuditStats | null>(null)
  const [recent, setRecent] = useState<RecentAudit[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Obtener estadísticas de webhooks desde audit logs
      const res = await fetch('/api/compliance/webhook-audit')
      const data = await res.json()

      if (data.success) {
        setStats(data.stats)
        setRecent(data.recent || [])
      } else {
        setError(data.error || 'Error cargando datos de webhooks')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando datos de webhooks...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Globe className="h-8 w-8" />
          <p className="text-xs font-bold uppercase tracking-widest">{error}</p>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const s = stats!

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-indigo-600" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
            Trazabilidad de Webhooks
          </h3>
        </div>
        <button
          onClick={fetchData}
          className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
          title="Actualizar"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <Send className="h-3.5 w-3.5 text-indigo-500" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Despachados</p>
          </div>
          <p className="text-xl font-black text-slate-800">{s.totalDispatched.toLocaleString()}</p>
        </div>

        <div className="p-3 rounded-xl bg-white border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entregados</p>
          </div>
          <p className="text-xl font-black text-emerald-600">{s.totalDelivered.toLocaleString()}</p>
        </div>

        <div className="p-3 rounded-xl bg-white border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fallidos</p>
          </div>
          <p className="text-xl font-black text-red-600">{s.totalFailed.toLocaleString()}</p>
        </div>

        <div className="p-3 rounded-xl bg-white border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-3.5 w-3.5 text-amber-500" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Últ. 7 días</p>
          </div>
          <p className="text-xl font-black text-slate-800">{s.recentDeliveries.toLocaleString()}</p>
        </div>
      </div>

      {/* Success rate bar */}
      {s.totalDispatched > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400">Tasa de éxito</span>
            <span className="text-[10px] font-black text-emerald-600">
              {Math.round((s.totalDelivered / s.totalDispatched) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.round((s.totalDelivered / s.totalDispatched) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <div>
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            Actividad reciente
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {recent.slice(0, 8).map((entry, i) => (
              <div key={entry.id || i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                  entry.action.includes('DELIVERED') ? 'bg-emerald-100 text-emerald-600' :
                  entry.action.includes('FAILED') ? 'bg-red-100 text-red-600' :
                  'bg-indigo-100 text-indigo-600'
                }`}>
                  {entry.action.includes('DELIVERED')
                    ? <CheckCircle2 className="h-3 w-3" />
                    : entry.action.includes('FAILED')
                      ? <XCircle className="h-3 w-3" />
                      : <Send className="h-3 w-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-700 truncate">{entry.description}</p>
                  <p className="text-[9px] text-slate-400 font-medium">
                    {new Date(entry.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
        <p className="text-[9px] text-slate-400 font-medium">
          Cada webhook saliente queda registrado en el audit trail con HMAC SHA-256.
        </p>
        <a
          href="/dashboard/integraciones/webhooks-salientes"
          className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:underline"
        >
          Gestionar <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  )
}

export default WebhookAuditSection
