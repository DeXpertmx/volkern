'use client'

import { useState } from 'react'
import {
  SlidersHorizontal,
  Clock,
  AlertTriangle,
  FileText,
  Users,
  Trash2,
  Save,
  RotateCcw,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

interface ThresholdConfig {
  /** Días máximos para contratos pendientes de firma */
  contratosPendientesDias: number
  /** Días máximos para cotizaciones en borrador */
  cotizacionesBorradorDias: number
  /** Días máximos para deals estancados sin movimiento */
  dealsEstancadosDias: number
  /** Días máximos para tareas obligatorias pendientes */
  tareasPendientesDias: number
  /** Días máximos para aprobaciones sin resolver */
  aprobacionesPendientesDias: number
  /** Umbral de eliminaciones masivas (cantidad en 1 hora) */
  eliminacionesMasivasUmbral: number
  /** Umbral de cambios de usuario (cantidad de usuarios distintos) */
  cambiosUsuariosUmbral: number
  /** Ventana de tiempo para detección de cierres rápidos (horas) */
  cierresRapidosHoras: number
  /** Cantidad de cierres rápidos para alertar */
  cierresRapidosCantidad: number
}

const DEFAULT_CONFIG: ThresholdConfig = {
  contratosPendientesDias: 7,
  cotizacionesBorradorDias: 14,
  dealsEstancadosDias: 30,
  tareasPendientesDias: 7,
  aprobacionesPendientesDias: 5,
  eliminacionesMasivasUmbral: 10,
  cambiosUsuariosUmbral: 3,
  cierresRapidosHoras: 1,
  cierresRapidosCantidad: 3,
}

interface Props {
  compact?: boolean
}

/* ─── Slider Field ─────────────────────────────────────────────────────────── */

function SliderField({
  label,
  description,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  icon: Icon,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
  icon: any
}) {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className="space-y-2 p-4 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Icon className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-700 uppercase tracking-tighter">{label}</p>
            <p className="text-[10px] text-slate-400 font-medium">{description}</p>
          </div>
        </div>
        <span className="text-sm font-black text-indigo-600 tabular-nums min-w-[3rem] text-right">
          {value}
          <span className="text-[10px] font-bold text-slate-400 ml-0.5">{unit}</span>
        </span>
      </div>
      <div className="relative pt-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full bg-slate-200 appearance-none cursor-pointer accent-indigo-600"
          style={{
            background: `linear-gradient(to right, #6366F1 0%, #6366F1 ${percentage}%, #E2E8F0 ${percentage}%, #E2E8F0 100%)`,
          }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-slate-300 font-bold">{min}{unit}</span>
          <span className="text-[9px] text-slate-300 font-bold">{max}{unit}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Componente Principal ─────────────────────────────────────────────────── */

export default function AlertRulesConfig({ compact = false }: Props) {
  const [config, setConfig] = useState<ThresholdConfig>(DEFAULT_CONFIG)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/compliance/alerts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!res.ok) throw new Error('Error al guardar')

      setSaved(true)
      toast.success('✅ Umbrales de alertas actualizados correctamente')
      setTimeout(() => setSaved(false), 3000)
    } catch {
      toast.error('Error al guardar la configuración de alertas')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    toast.info('Valores restaurados a los predeterminados (guarda para aplicar)')
  }

  if (compact) {
    return (
      <div className="text-center py-6">
        <SlidersHorizontal className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Configuración de umbrales de alertas</p>
        <p className="text-xs text-slate-400 mt-1">Disponible en vista completa</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter">
            Umbrales de Alertas
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Configura los límites que disparan cada tipo de alerta
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-400"
            title="Restaurar valores predeterminados"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? 'Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Categoría: Procesos Incompletos */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="h-5 w-5 rounded-md bg-amber-100 flex items-center justify-center">
            <Clock className="h-3 w-3 text-amber-600" />
          </div>
          <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            Procesos Incompletos
          </h3>
        </div>

        <SliderField
          icon={FileText}
          label="Contratos pendientes"
          description="Días máximos sin firmar antes de alertar"
          value={config.contratosPendientesDias}
          min={1}
          max={60}
          step={1}
          unit="d"
          onChange={(v) => setConfig({ ...config, contratosPendientesDias: v })}
        />

        <SliderField
          icon={FileText}
          label="Cotizaciones en borrador"
          description="Días máximos en borrador antes de alertar"
          value={config.cotizacionesBorradorDias}
          min={1}
          max={90}
          step={1}
          unit="d"
          onChange={(v) => setConfig({ ...config, cotizacionesBorradorDias: v })}
        />

        <SliderField
          icon={Clock}
          label="Deals estancados"
          description="Días sin cambio de etapa antes de alertar"
          value={config.dealsEstancadosDias}
          min={5}
          max={180}
          step={1}
          unit="d"
          onChange={(v) => setConfig({ ...config, dealsEstancadosDias: v })}
        />

        <SliderField
          icon={Clock}
          label="Tareas obligatorias"
          description="Días máximos sin completar tareas obligatorias"
          value={config.tareasPendientesDias}
          min={1}
          max={30}
          step={1}
          unit="d"
          onChange={(v) => setConfig({ ...config, tareasPendientesDias: v })}
        />

        <SliderField
          icon={Clock}
          label="Aprobaciones pendientes"
          description="Días máximos sin resolver aprobaciones"
          value={config.aprobacionesPendientesDias}
          min={1}
          max={30}
          step={1}
          unit="d"
          onChange={(v) => setConfig({ ...config, aprobacionesPendientesDias: v })}
        />
      </div>

      {/* Categoría: Cambios Críticos */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="h-5 w-5 rounded-md bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-3 w-3 text-red-600" />
          </div>
          <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            Cambios Críticos
          </h3>
        </div>

        <SliderField
          icon={Trash2}
          label="Eliminaciones masivas"
          description="Cantidad de eliminaciones en 1h para activar alerta"
          value={config.eliminacionesMasivasUmbral}
          min={3}
          max={100}
          step={1}
          unit=""
          onChange={(v) => setConfig({ ...config, eliminacionesMasivasUmbral: v })}
        />

        <SliderField
          icon={Users}
          label="Cambios de usuarios"
          description="Usuarios distintos modificando en periodo corto"
          value={config.cambiosUsuariosUmbral}
          min={2}
          max={20}
          step={1}
          unit=""
          onChange={(v) => setConfig({ ...config, cambiosUsuariosUmbral: v })}
        />

        <SliderField
          icon={Clock}
          label="Cierres rápidos — ventana"
          description="Horas en las que se buscan cierres masivos de deals"
          value={config.cierresRapidosHoras}
          min={1}
          max={24}
          step={1}
          unit="h"
          onChange={(v) => setConfig({ ...config, cierresRapidosHoras: v })}
        />

        <SliderField
          icon={AlertTriangle}
          label="Cierres rápidos — cantidad"
          description="Cantidad de cierres en la ventana para alertar"
          value={config.cierresRapidosCantidad}
          min={2}
          max={20}
          step={1}
          unit=""
          onChange={(v) => setConfig({ ...config, cierresRapidosCantidad: v })}
        />
      </div>

      {/* Footer con resumen */}
      <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">
            Los umbrales se aplican a todas las alertas del tenant
          </p>
          <p className="text-[10px] text-indigo-500 mt-0.5">
            Valores más bajos = más alertas (más sensible). Valores más altos = menos alertas (más permisivo).
          </p>
        </div>
      </div>
    </div>
  )
}
