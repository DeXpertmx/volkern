'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Hash,
  CheckCircle2,
  XCircle,
  FileText,
  Shield,
  Clock,
  Users,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CertificadoCumplimiento } from '@/components/admin/CertificadoCumplimiento'

export default function AuditoriaDetailPage() {
  const params = useParams()
  const router = useRouter()
  const auditId = params.id as string

  const [record, setRecord] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [certData, setCertData] = useState<any>(null)
  const [loadingCert, setLoadingCert] = useState(false)

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        const res = await fetch('/api/admin/audit')
        const data = await res.json()
        if (data.success) {
          const found = data.records.find((r: any) => r.id === auditId)
          if (found) {
            setRecord({ ...found, chainValid: data.chainIntact })
          } else {
            toast.error('Registro de auditoría no encontrado')
            router.push('/admin/auditoria')
          }
        }
      } catch {
        toast.error('Error cargando detalle')
      } finally {
        setLoading(false)
      }
    }
    fetchRecord()
  }, [auditId, router])

  const handleLoadCertificate = async () => {
    setLoadingCert(true)
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
      setLoadingCert(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!record) return null

  const equity = Math.max(0, Math.round((1 - record.biasScore) * 100))
  const statusColor = record.status === 'VERDE' ? 'text-emerald-600' : record.status === 'AMARILLO' ? 'text-amber-600' : 'text-red-600'
  const statusBg = record.status === 'VERDE' ? 'bg-emerald-100 border-emerald-200' : record.status === 'AMARILLO' ? 'bg-amber-100 border-amber-200' : 'bg-red-100 border-red-200'
  const groupBreakdown: Record<string, number> = record.groupBreakdown || {}

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-500">
      {/* Back & Header */}
      <Link href="/admin/auditoria" className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors w-fit">
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al Dashboard de Auditoría
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center border ${statusBg}`}>
            <ShieldCheck className={`h-7 w-7 ${statusColor}`} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Detalle de Auditoría</h1>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              {new Date(record.auditDate).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' })}
            </p>
          </div>
        </div>

        <button
          onClick={handleLoadCertificate}
          disabled={loadingCert}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-md shadow-indigo-100"
        >
          {loadingCert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Descargar Certificado Legal
        </button>
      </div>

      {/* KPIs del registro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Shield, label: 'Estado', value: record.status, color: statusColor, bg: statusBg },
          { icon: ShieldCheck, label: 'Índice de Equidad', value: `${equity}%`, color: equity >= 90 ? 'text-emerald-600' : equity >= 85 ? 'text-amber-600' : 'text-red-600', bg: '' },
          { icon: Users, label: 'Registros Analizados', value: record.totalRecords.toLocaleString('es-ES'), color: 'text-indigo-600', bg: '' },
          { icon: AlertTriangle, label: 'Acción Tomada', value: record.actionTaken, color: record.actionTaken === 'NINGUNA' ? 'text-slate-400' : 'text-red-600', bg: '' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</p>
            <div className={`text-lg font-black ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Sello de Integridad SHA-256 */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Hash className="h-5 w-5 text-indigo-500" />
          <h2 className="text-sm font-black uppercase tracking-tighter">Sello Digital SHA-256 — Verificación Anti-Manipulación</h2>
          <span className={`ml-auto flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${record.chainValid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {record.chainValid ? <><CheckCircle2 className="h-3 w-3" /> Cadena Válida</> : <><XCircle className="h-3 w-3" /> Sin Verificar</>}
          </span>
        </div>

        <div className="space-y-3">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Hash de Este Registro</p>
            <p className="font-mono text-xs text-slate-700 break-all leading-relaxed">{record.integrityHash}</p>
          </div>
          {record.prevHash && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Hash del Registro Anterior (Cadena)</p>
              <p className="font-mono text-xs text-slate-500 break-all leading-relaxed">{record.prevHash}</p>
            </div>
          )}
        </div>

        <div className={`p-4 rounded-xl border text-xs leading-relaxed ${record.chainValid ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
          {record.chainValid
            ? '✅ La integridad de la cadena blockchain está verificada. Este reporte no ha sido manipulado desde su generación. El hash de este registro coincide con el prevHash del registro siguiente, formando una cadena de custodia ininterrumpida.'
            : '⚠️ El hash previo no pudo ser verificado en la cadena. Esto puede deberse a que es el primer registro del sistema, o a que la cadena fue interrumpida. Consulta con el auditor técnico.'}
        </div>
      </div>

      {/* Resumen de hallazgos */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-tighter flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" />
          Criterios y Resumen de Hallazgos
        </h2>
        <p className="text-sm text-slate-700 leading-relaxed">{record.findingSummary}</p>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Coef. Variación</p>
            <p className="text-lg font-black text-slate-800 mt-1">{(record.biasScore * 100).toFixed(2)}%</p>
            <p className="text-[9px] text-slate-400">Umbral Amarillo: 5% | Rojo: 10%</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Umbral Activado</p>
            <p className={`text-lg font-black mt-1 ${statusColor}`}>{record.status}</p>
            <p className="text-[9px] text-slate-400">Estado del sistema</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Protección Activada</p>
            <p className={`text-sm font-black mt-1 ${record.actionTaken === 'NINGUNA' ? 'text-slate-400' : 'text-red-600'}`}>{record.actionTaken}</p>
            <p className="text-[9px] text-slate-400">Respuesta automática</p>
          </div>
        </div>
      </div>

      {/* Distribución demográfica */}
      {Object.keys(groupBreakdown).length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-tighter flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            Distribución por Grupo Demográfico (Anonimizado)
          </h2>
          <p className="text-xs text-slate-400">Los grupos son anonimizados. Ningún dato identificable se almacena en este registro.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(groupBreakdown).map(([group, count]) => {
              const total = Object.values(groupBreakdown).reduce((a, b) => a + b, 0)
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={group} className="p-4 rounded-2xl border border-slate-100 bg-slate-50 text-center">
                  <p className="text-2xl font-black text-slate-900">{count}</p>
                  <p className="text-xs font-bold text-slate-500 mt-1">{group}</p>
                  <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">{pct}% del total</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Override manual si existe */}
      {record.resolvedBy && (
        <div className="bg-amber-50 rounded-3xl border border-amber-200 p-6 space-y-2">
          <h2 className="text-sm font-black uppercase tracking-tighter text-amber-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Override Manual Registrado
          </h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="font-bold text-amber-700">Autorizado por:</span> <span className="text-amber-900">{record.resolvedBy}</span></div>
            <div><span className="font-bold text-amber-700">Fecha:</span> <span className="text-amber-900">{record.resolvedAt ? new Date(record.resolvedAt).toLocaleString('es-ES') : 'N/D'}</span></div>
            <div className="col-span-2"><span className="font-bold text-amber-700">Justificación:</span> <span className="text-amber-900 leading-relaxed">{record.resolutionNote}</span></div>
          </div>
        </div>
      )}

      {/* Certificado */}
      {certData && <CertificadoCumplimiento data={certData} onClose={() => setCertData(null)} />}
    </div>
  )
}
