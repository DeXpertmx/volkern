'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Hash,
  Activity,
  Lock,
  Unlock,
  Eye,
  BarChart2,
  RefreshCw,
  FileText,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  Legend,
} from 'recharts'
import { toast } from 'sonner'
import { CertificadoCumplimiento } from '@/components/admin/CertificadoCumplimiento'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AuditRecord {
  id: string
  auditDate: string
  biasScore: number
  status: string
  integrityHash: string
  prevHash?: string | null
  findingSummary: string
  actionTaken: string
  totalRecords: number
  groupBreakdown?: Record<string, number> | null
  resolvedBy?: string | null
  resolutionNote?: string | null
}

interface SystemAlert {
  id: string
  level: string
  message: string
  auditId?: string | null
  resolved: boolean
  resolvedBy?: string | null
  createdAt: string
}

interface SystemBackup {
  id: string
  timestamp: string
  status: string
  fileName?: string | null
  fileSize?: string | null
  storageProvider: string
  checksum?: string | null
  errorMessage?: string | null
}

interface ModuleControl {
  moduleKey: string
  isActive: boolean
  updatedBy?: string | null
  reason?: string | null
  updatedAt?: string
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

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

// Tooltip personalizado para el gráfico de línea
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const statusColor = d.status === 'VERDE' ? '#059669' : d.status === 'AMARILLO' ? '#D97706' : '#DC2626'
  return (
    <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
      <p className="font-bold">{new Date(d.auditDate).toLocaleDateString('es-ES')}</p>
      <p>Bias Score: <span className="font-black" style={{ color: statusColor }}>{(d.biasScore * 100).toFixed(2)}%</span></p>
      <p>Estado: <span style={{ color: statusColor }}>{d.status}</span></p>
      <p>Registros: {d.totalRecords?.toLocaleString('es-ES')}</p>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function AuditoriaDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [backups, setBackups] = useState<SystemBackup[]>([])
  const [module, setModule] = useState<ModuleControl | null>(null)

  // Modal de resolución de alerta
  const [resolvingAlert, setResolvingAlert] = useState<SystemAlert | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [reactivate, setReactivate] = useState(false)
  const [resolving, setResolving] = useState(false)

  // Modal de Kill Switch
  const [showKillSwitch, setShowKillSwitch] = useState(false)
  const [killSwitchReason, setKillSwitchReason] = useState('')
  const [togglingModule, setTogglingModule] = useState(false)

  // Certificado
  const [certData, setCertData] = useState<any>(null)
  const [loadingCert, setLoadingCert] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      const [auditRes, alertsRes, moduleRes, backupRes] = await Promise.all([
        fetch('/api/admin/audit'),
        fetch('/api/admin/audit/alerts'),
        fetch('/api/admin/audit/module'),
        fetch('/api/admin/backup'),
      ])
      const [auditData, alertsData, moduleData, backupData] = await Promise.all([
        auditRes.json(),
        alertsRes.json(),
        moduleRes.json(),
        backupRes.json(),
      ])
      if (auditData.success) setData(auditData)
      if (alertsData.success) setAlerts(alertsData.alerts)
      if (moduleData.success) setModule(moduleData.control)
      if (backupData.success) setBackups(backupData.backups)
    } catch {
      toast.error('Error cargando datos de auditoría')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleResolveAlert = async () => {
    if (!resolvingAlert) return
    if (resolveNote.trim().length < 20) {
      toast.error('La justificación debe tener al menos 20 caracteres')
      return
    }
    setResolving(true)
    try {
      const res = await fetch('/api/admin/audit/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId: resolvingAlert.id,
          note: resolveNote,
          reactivateModule: reactivate,
          auditId: resolvingAlert.auditId,
        }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(reactivate ? '✅ Alerta resuelta y módulo reactivado' : '✅ Alerta resuelta correctamente')
        setResolvingAlert(null)
        setResolveNote('')
        setReactivate(false)
        fetchAll()
      } else {
        toast.error(result.error || 'Error resolviendo alerta')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setResolving(false)
    }
  }

  const handleToggleModule = async () => {
    if (killSwitchReason.trim().length < 10) {
      toast.error('Debes proporcionar una justificación de al menos 10 caracteres')
      return
    }
    setTogglingModule(true)
    try {
      const res = await fetch('/api/admin/audit/module', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !module?.isActive, reason: killSwitchReason }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(`Módulo ${result.control.isActive ? 'ACTIVADO' : 'DESACTIVADO'} correctamente`)
        setShowKillSwitch(false)
        setKillSwitchReason('')
        fetchAll()
      } else {
        toast.error(result.error || 'Error alternando módulo')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setTogglingModule(false)
    }
  }

  const handleLoadCertificate = async (auditId: string) => {
    setLoadingCert(auditId)
    try {
      const res = await fetch(`/api/admin/audit/certificate/${auditId}`)
      const result = await res.json()
      if (result.success) {
        setCertData(result.certificate)
      } else {
        toast.error(result.error || 'Error cargando certificado')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoadingCert(null)
    }
  }

  // ─── Métricas derivadas ────────────────────────────────────────────────────

  const latest = data?.latest
  const equityIndex = latest ? Math.max(0, Math.round((1 - latest.biasScore) * 100)) : null
  const moduleActive = module?.isActive ?? true
  const unresolvedCount = data?.unresolvedAlerts ?? 0
  const chainIntact = data?.chainIntact ?? true

  // Gráfico de distribución demográfica del último ciclo
  const groupChartData = latest?.groupBreakdown
    ? Object.entries(latest.groupBreakdown as Record<string, number>).map(([group, count]) => ({
        group,
        count,
      }))
    : []

  // Colorizar línea del gráfico por zona de status
  const getTrendColor = (biasScore: number) => {
    if (biasScore > 0.10) return '#EF4444'
    if (biasScore > 0.05) return '#F59E0B'
    return '#10B981'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cargando datos de auditoría...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg ${moduleActive ? 'bg-emerald-600 shadow-emerald-200' : 'bg-red-600 shadow-red-200'}`}>
            {moduleActive ? <ShieldCheck className="h-7 w-7 text-white" /> : <ShieldOff className="h-7 w-7 text-white" />}
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
              Auditoría de IA
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${moduleActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {moduleActive ? '🟢 SISTEMA PROTEGIDO' : '🔴 MÓDULO BLOQUEADO'}
              </span>
              {latest && (
                <span className="text-[10px] font-bold text-slate-400">
                  Última auditoría: {new Date(latest.auditDate).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowKillSwitch(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              moduleActive
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {moduleActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {moduleActive ? 'Desactivar Módulo' : 'Reactivar Módulo'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={equityIndex !== null && equityIndex >= 90 ? ShieldCheck : equityIndex !== null && equityIndex >= 85 ? ShieldAlert : ShieldOff}
          label="Índice de Equidad"
          value={equityIndex !== null ? `${equityIndex}%` : 'Sin datos'}
          sub={equityIndex !== null
            ? equityIndex >= 90 ? 'Excelente — Verde' : equityIndex >= 85 ? 'Atención — Amarillo' : 'Crítico — Rojo'
            : 'Ejecutar primera auditoría'}
          color={equityIndex !== null && equityIndex >= 90 ? 'bg-emerald-600' : equityIndex !== null && equityIndex >= 85 ? 'bg-amber-500' : 'bg-red-600'}
          borderColor={equityIndex !== null && equityIndex >= 90 ? 'border-l-emerald-500' : equityIndex !== null && equityIndex >= 85 ? 'border-l-amber-400' : 'border-l-red-500'}
        />

        <KpiCard
          icon={chainIntact ? CheckCircle2 : XCircle}
          label="Integridad del Sistema"
          value={
            <span className={chainIntact ? 'text-emerald-600' : 'text-red-600'}>
              {chainIntact ? 'Intacta' : 'Verificar'}
            </span>
          }
          sub={chainIntact ? 'Hash SHA-256 encadenado válido' : 'Posible manipulación detectada'}
          color={chainIntact ? 'bg-emerald-600' : 'bg-red-600'}
          borderColor={chainIntact ? 'border-l-emerald-500' : 'border-l-red-500'}
        />

        <KpiCard
          icon={Activity}
          label="Registros Auditados"
          value={latest?.totalRecords ? latest.totalRecords.toLocaleString('es-ES') : '—'}
          sub="Eventos de presencia en último ciclo"
          color="bg-indigo-600"
          borderColor="border-l-indigo-500"
        />

        <KpiCard
          icon={unresolvedCount > 0 ? AlertTriangle : CheckCircle2}
          label="Alertas Activas"
          value={
            <span className={unresolvedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}>
              {unresolvedCount}
            </span>
          }
          sub={unresolvedCount > 0 ? 'Requieren revisión manual' : 'Sin alertas pendientes'}
          color={unresolvedCount > 0 ? 'bg-amber-500' : 'bg-emerald-600'}
          borderColor={unresolvedCount > 0 ? 'border-l-amber-400' : 'border-l-emerald-500'}
        />

        <KpiCard
          icon={backups.length > 0 && backups[0].status === 'SUCCESS' ? CheckCircle2 : ShieldOff}
          label="Salud de Backups"
          value={
            <span className={backups.length > 0 && backups[0].status === 'SUCCESS' ? 'text-emerald-600' : 'text-red-600'}>
              {backups.length > 0 ? backups[0].status : 'Sin definir'}
            </span>
          }
          sub={backups.length > 0 ? `Último: ${new Date(backups[0].timestamp).toLocaleDateString()}` : 'Configurar backup cron'}
          color={backups.length > 0 && backups[0].status === 'SUCCESS' ? 'bg-emerald-600' : 'bg-red-600'}
          borderColor={backups.length > 0 && backups[0].status === 'SUCCESS' ? 'border-l-emerald-500' : 'border-l-red-500'}
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Línea de tiempo */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-black uppercase tracking-tighter">Evolución del Bias Score</h2>
              <p className="text-xs text-slate-400 font-bold mt-0.5">Coef. de variación demográfica en el tiempo</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-emerald-500 inline-block" /> Equitativo</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-amber-400 inline-block" /> Alerta</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-red-500 inline-block" /> Crítico</span>
            </div>
          </div>

          {data?.trendData?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="auditDate"
                  tickFormatter={(v) => new Date(v).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                />
                <YAxis
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  domain={[0, 'auto']}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0.05} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: 'Umbral Amarillo', position: 'right', fontSize: 9, fill: '#F59E0B' }} />
                <ReferenceLine y={0.10} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Umbral Rojo', position: 'right', fontSize: 9, fill: '#EF4444' }} />
                <Line
                  type="monotone"
                  dataKey="biasScore"
                  stroke="#6366F1"
                  strokeWidth={2.5}
                  dot={(props: any) => {
                    const color = getTrendColor(props.payload.biasScore)
                    return <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill={color} stroke="white" strokeWidth={1.5} />
                  }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm italic">
              Sin datos de auditoría. Ejecuta el script <code className="bg-slate-100 px-1 rounded text-xs">auditor_core.py</code> para generar el primer registro.
            </div>
          )}
        </div>

        {/* Distribución demográfica */}
        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6">
          <h2 className="text-sm font-black uppercase tracking-tighter mb-1">Distribución por Grupo</h2>
          <p className="text-xs text-slate-400 font-bold mb-5">% de pruebas por grupo anonimizado — último ciclo</p>

          {groupChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={groupChartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="group" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Pruebas">
                  {groupChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index % 2 === 0 ? '#6366F1' : '#8B5CF6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex flex-col items-center justify-center gap-3 text-slate-300">
              <BarChart2 className="h-12 w-12" />
              <p className="text-xs italic text-center">Sin distribución demográfica.<br />Requiere datos del auditor Python.</p>
            </div>
          )}
        </div>
      </div>

      {/* Alertas */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tighter">Panel de Alertas</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">Alertas generadas por el sistema de auditoría</p>
          </div>
          <Link
            href="/api/admin/audit/alerts?resolved=true"
            className="text-xs font-bold text-indigo-600 hover:underline"
          >
            Ver resueltas →
          </Link>
        </div>

        {alerts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="text-sm text-slate-500 italic">No hay alertas pendientes. El sistema opera dentro de los umbrales éticos.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                    alert.level === 'CRITICAL' ? 'bg-red-100 text-red-600' :
                    alert.level === 'WARNING' ? 'bg-amber-100 text-amber-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {alert.level === 'CRITICAL' ? <ShieldOff className="h-4 w-4" /> :
                     alert.level === 'WARNING' ? <AlertTriangle className="h-4 w-4" /> :
                     <Activity className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800 leading-relaxed max-w-lg">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                        alert.level === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                        alert.level === 'WARNING' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{alert.level}</span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        {new Date(alert.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                </div>

                {!alert.resolved ? (
                  <button
                    onClick={() => { setResolvingAlert(alert); setReactivate(alert.level === 'CRITICAL') }}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors border border-indigo-100"
                  >
                    Resolver
                  </button>
                ) : (
                  <span className="shrink-0 text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resuelta
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabla de historial de auditorías */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tighter">Historial de Auditorías</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">Registro inmutable de cada ciclo de auditoría</p>
          </div>
        </div>

        {!data?.records?.length ? (
          <div className="p-12 text-center text-slate-400 text-sm italic">
            Sin registros. Ejecuta <code className="bg-slate-100 px-1 rounded">python auditor/auditor_core.py</code> para iniciar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 bg-slate-50/30">
                  <th className="text-left p-4 pl-6">Fecha</th>
                  <th className="text-left p-4">Estado</th>
                  <th className="text-right p-4">Bias CV</th>
                  <th className="text-right p-4">Equidad</th>
                  <th className="text-left p-4">Acción</th>
                  <th className="text-left p-4">Hash SHA-256</th>
                  <th className="text-center p-4 pr-6">Cert.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.records.map((record: AuditRecord) => {
                  const equity = Math.max(0, Math.round((1 - record.biasScore) * 100))
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6 font-bold text-slate-700">
                        {new Date(record.auditDate).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          record.status === 'VERDE' ? 'bg-emerald-100 text-emerald-700' :
                          record.status === 'AMARILLO' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-700">
                        {(record.biasScore * 100).toFixed(2)}%
                      </td>
                      <td className="p-4 text-right">
                        <span className={`font-black ${equity >= 90 ? 'text-emerald-600' : equity >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                          {equity}%
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`text-[10px] font-bold ${
                          record.actionTaken === 'NINGUNA' ? 'text-slate-400' :
                          record.actionTaken.includes('BLOQUEO') ? 'text-red-600 font-black' :
                          'text-amber-600'
                        }`}>
                          {record.actionTaken}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-[10px] text-slate-400">{record.integrityHash.slice(0, 16)}…</span>
                      </td>
                      <td className="p-4 pr-6 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/admin/auditoria/${record.id}`}>
                            <button className="h-7 w-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors" title="Ver detalle">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </Link>
                          <button
                            onClick={() => handleLoadCertificate(record.id)}
                            disabled={loadingCert === record.id}
                            className="h-7 w-7 rounded-lg hover:bg-indigo-50 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Descargar certificado"
                          >
                            {loadingCert === record.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <FileText className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabla de historial de backups */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden mt-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tighter">Historial de Resguardos (Backup 3-2-1)</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">Integridad de copias de seguridad en nube/local</p>
          </div>
        </div>

        {backups.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm italic">
            Sin historial de backups detectado. El auditor emitirá alertas si no encuentra respaldos diarios.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 bg-slate-50/30">
                  <th className="text-left p-4 pl-6">Timestamp</th>
                  <th className="text-left p-4">Estado</th>
                  <th className="text-left p-4">Archivo</th>
                  <th className="text-right p-4">Tamaño</th>
                  <th className="text-left p-4">Proveedor</th>
                  <th className="text-left p-4 pr-6">Checksum (SHA-256)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-bold text-slate-700">
                      {new Date(b.timestamp).toLocaleString('es-ES')}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        b.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 italic">
                      {b.fileName || '—'}
                    </td>
                    <td className="p-4 text-right font-mono">
                      {b.fileSize ? `${(Number(b.fileSize) / (1024 * 1024)).toFixed(2)} MB` : '—'}
                    </td>
                    <td className="p-4 font-bold text-indigo-600">
                      {b.storageProvider}
                    </td>
                    <td className="p-4 pr-6 font-mono text-[10px] text-slate-400">
                      {b.checksum ? `${b.checksum.slice(0, 16)}…` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modal: Resolver Alerta ──────────────────────────────────────────── */}
      {resolvingAlert && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 space-y-5 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Resolver Alerta</h3>
                <p className="text-xs text-slate-400 font-bold">La justificación quedará registrada en el audit trail permanente</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
              {resolvingAlert.message}
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                Justificación (mínimo 20 caracteres) *
              </label>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                rows={3}
                placeholder="Describe por qué consideras que esta alerta puede ser resuelta (falso positivo, revisión completada, etc.)"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-300"
              />
              <div className="text-right text-[10px] text-slate-300 mt-1">{resolveNote.length} / 20 min</div>
            </div>

            {resolvingAlert.level === 'CRITICAL' && (
              <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-100 bg-amber-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reactivate}
                  onChange={(e) => setReactivate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <div>
                  <p className="text-xs font-black text-amber-800">Reactivar módulo tras resolución</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">Activa nuevamente las pruebas aleatorias de presencia. Esta acción queda registrada.</p>
                </div>
              </label>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setResolvingAlert(null); setResolveNote(''); setReactivate(false) }}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResolveAlert}
                disabled={resolving || resolveNote.trim().length < 20}
                className="flex-[2] h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar Resolución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Kill Switch ──────────────────────────────────────────────── */}
      {showKillSwitch && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 space-y-5 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${moduleActive ? 'bg-red-100' : 'bg-emerald-100'}`}>
                {moduleActive ? <Lock className="h-5 w-5 text-red-600" /> : <Unlock className="h-5 w-5 text-emerald-600" />}
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-tight">
                  {moduleActive ? 'Desactivar Módulo de IA' : 'Reactivar Módulo de IA'}
                </h3>
                <p className="text-xs text-slate-400 font-bold">Esta acción se registrará permanentemente</p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-xs text-slate-700 leading-relaxed ${moduleActive ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
              {moduleActive
                ? 'Esto desactivará las pruebas aleatorias de presencia. Los empleados no recibirán desafíos hasta que el módulo sea reactivado manualmente.'
                : 'Esto reactivará las pruebas aleatorias de presencia. El sistema volverá a seleccionar empleados aleatoriamente para verificación.'}
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                Justificación *
              </label>
              <input
                type="text"
                value={killSwitchReason}
                onChange={(e) => setKillSwitchReason(e.target.value)}
                placeholder="Motivo de la acción..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600/10"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowKillSwitch(false); setKillSwitchReason('') }}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleToggleModule}
                disabled={togglingModule || killSwitchReason.trim().length < 10}
                className={`flex-[2] h-11 rounded-xl disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${moduleActive ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {togglingModule ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {moduleActive ? 'Desactivar' : 'Reactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificado */}
      {certData && <CertificadoCumplimiento data={certData} onClose={() => setCertData(null)} />}
    </div>
  )
}
