'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Users,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Search,
  FileText,
  Calendar,
  User,
  Download,
  ChevronRight,
  Hash,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface AuditEntry {
  id: string
  action: string
  entity: string
  entityId: string
  description: string
  createdAt: string
  user: { name: string; email: string }
  ipAddress?: string
  metadata?: any
}

interface AuditStats {
  total: number
  today: number
  thisWeek: number
  thisMonth: number
}

/* ─── KPI Card ───────────────────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: any
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4 text-white" size={16} />
        </div>
      </div>
      <div className="text-2xl font-black tracking-tighter text-slate-900">{value}</div>
      {sub && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{sub}</p>}
    </div>
  )
}

/* ─── Página ─────────────────────────────────────────────────────────────── */

export default function AuditoriaDashboard() {
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [filtered, setFiltered] = useState<AuditEntry[]>([])
  const [stats, setStats] = useState<AuditStats>({ total: 0, today: 0, thisWeek: 0, thisMonth: 0 })
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/audit-logs?limit=100')
      const data = await res.json()

      if (data.logs) {
        const logs = data.logs.map((l: any) => ({
          ...l,
          createdAt: l.fechaCreacion || l.createdAt,
        }))
        setEntries(logs)
        setFiltered(logs)

        const now = Date.now()
        const dayAgo = now - 24 * 60 * 60 * 1000
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000
        const monthAgo = now - 30 * 24 * 60 * 60 * 1000

        setStats({
          total: logs.length,
          today: logs.filter((l: AuditEntry) => new Date(l.createdAt).getTime() > dayAgo).length,
          thisWeek: logs.filter((l: AuditEntry) => new Date(l.createdAt).getTime() > weekAgo).length,
          thisMonth: logs.filter((l: AuditEntry) => new Date(l.createdAt).getTime() > monthAgo).length,
        })
      }
    } catch {
      toast.error('Error cargando registros de auditoría')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(entries)
      return
    }
    const q = search.toLowerCase()
    setFiltered(
      entries.filter(e =>
        e.action.toLowerCase().includes(q) ||
        e.entity.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.user?.name?.toLowerCase().includes(q) ||
        e.user?.email?.toLowerCase().includes(q)
      )
    )
  }, [search, entries])

  const actionBadge = (action: string) => {
    if (action.includes('create') || action.includes('crear') || action.includes('CREATED'))
      return 'bg-emerald-100 text-emerald-700'
    if (action.includes('update') || action.includes('editar') || action.includes('CHANGED'))
      return 'bg-blue-100 text-blue-700'
    if (action.includes('delete') || action.includes('eliminar') || action.includes('BLOCKED'))
      return 'bg-red-100 text-red-700'
    return 'bg-slate-100 text-slate-600'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cargando registros...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
              Auditoría
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Historial de todas tus acciones en el sistema
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            href="/dashboard/compliance"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Compliance
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={FileText} label="Total Registros" value={stats.total.toLocaleString()} color="bg-indigo-600" />
        <KpiCard icon={Calendar} label="Hoy" value={stats.today} sub={`${Math.round((stats.today / Math.max(stats.total, 1)) * 100)}% del total`} color="bg-emerald-600" />
        <KpiCard icon={Activity} label="7 días" value={stats.thisWeek} sub={`${Math.round((stats.thisWeek / Math.max(stats.total, 1)) * 100)}% del total`} color="bg-amber-500" />
        <KpiCard icon={Hash} label="30 días" value={stats.thisMonth} sub={`${Math.round((stats.thisMonth / Math.max(stats.total, 1)) * 100)}% del total`} color="bg-purple-600" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por acción, entidad, descripción o usuario..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-300"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm text-slate-500 italic">
              {search ? 'No se encontraron registros con ese filtro' : 'Sin registros de auditoría'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left p-4 pl-6">Fecha</th>
                  <th className="text-left p-4">Usuario</th>
                  <th className="text-left p-4">Acción</th>
                  <th className="text-left p-4">Entidad</th>
                  <th className="text-left p-4">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-700 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-700">
                          {entry.user?.name || entry.user?.email || 'Sistema'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${actionBadge(entry.action)}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 font-medium">
                      {entry.entity}
                      <span className="text-[9px] text-slate-400 ml-1 font-mono">
                        {entry.entityId?.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 max-w-xs truncate">
                      {entry.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GDPR link */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <p className="text-[10px] font-bold text-slate-400">
          ¿Necesitas exportar o anonimizar tus datos? Accede a la sección de Privacidad.
        </p>
        <Link
          href="/dashboard/compliance/gdpr"
          className="flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-wider"
        >
          Privacidad GDPR <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
