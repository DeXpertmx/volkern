'use client'

import { useState } from 'react'
import {
  ShieldCheck,
  Download,
  Trash2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export function GdprPrivacySection() {
  const [exporting, setExporting] = useState(false)
  const [anonymizing, setAnonymizing] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [showAnonymize, setShowAnonymize] = useState(false)
  const [anonymized, setAnonymized] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/compliance/gdpr/export')
      const data = await res.json()

      if (data.success) {
        // Descargar como archivo JSON
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `gdpr-export-${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)

        toast.success('✅ Datos exportados correctamente', {
          description: `${data.entries.length} registros de auditoría exportados`,
        })
      } else {
        toast.error(data.error || 'Error exportando datos')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setExporting(false)
    }
  }

  const handleAnonymize = async () => {
    if (confirmation.trim().length < 10) {
      toast.error('La confirmación debe tener al menos 10 caracteres')
      return
    }

    setAnonymizing(true)
    try {
      const res = await fetch('/api/compliance/gdpr/anonymize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      })
      const data = await res.json()

      if (data.success) {
        setAnonymized(true)
        toast.success('✅ Datos anonimizados', {
          description: `${data.anonymizedCount} registros de auditoría afectados`,
        })
      } else {
        toast.error(data.error || 'Error al anonimizar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setAnonymizing(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
            Privacidad y GDPR
          </h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Controla tus datos personales según el RGPD
          </p>
        </div>
      </div>

      {/* Right to Access */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Download className="h-4.5 w-4.5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-black text-slate-800">Art. 15 — Derecho de Acceso</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Descarga todos tus datos de auditoría almacenados en Volkern CRM. Incluye registros de acciones,
              timestamps, direcciones IP y metadatos asociados a tu usuario.
            </p>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Exportar mis datos (JSON)
        </button>
      </div>

      {/* Right to be Forgotten */}
      <div className={`bg-white rounded-2xl border shadow-sm p-6 space-y-4 ${anonymized ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200/60'}`}>
        {anonymized ? (
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-emerald-700">Datos anonimizados</h3>
              <p className="text-xs text-emerald-600 mt-1 leading-relaxed">
                Tus datos de auditoría han sido anonimizados. La acción queda registrada en el audit trail con
                fines de cumplimiento normativo.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="h-4.5 w-4.5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-slate-800">Art. 17 — Derecho al Olvido</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Anonimiza tu información personal en los registros de auditoría. Tu nombre y email serán
                  reemplazados por datos anonimizados. Esta acción es irreversible.
                </p>
              </div>
            </div>

            {showAnonymize && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-100 space-y-2">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <p className="text-[10px] font-black uppercase tracking-wider">Acción irreversible</p>
                </div>
                <textarea
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Escribe una confirmación explicando por qué quieres anonimizar tus datos (mín. 10 caracteres)..."
                  rows={3}
                  className="w-full p-3 bg-white border border-red-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-600/10"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAnonymize}
                    disabled={anonymizing || confirmation.trim().length < 10}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    {anonymizing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Confirmar Anonimización
                  </button>
                  <button
                    onClick={() => { setShowAnonymize(false); setConfirmation('') }}
                    className="px-4 py-2.5 rounded-xl border border-red-200 text-[10px] font-bold text-red-600 hover:bg-red-100 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {!showAnonymize && (
              <button
                onClick={() => setShowAnonymize(true)}
                className="w-full py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
              >
                <Lock className="h-3.5 w-3.5" />
                Anonimizar mis datos
              </button>
            )}
          </>
        )}
      </div>

      {/* Compliance PRO link */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
        <p className="text-[10px] text-slate-400 font-medium">
          ¿Necesitas más control? Descubre todas las funcionalidades de compliance.
        </p>
        <Link
          href="/dashboard/compliance"
          className="flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-wider"
        >
          Compliance Dashboard <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}

export default GdprPrivacySection
