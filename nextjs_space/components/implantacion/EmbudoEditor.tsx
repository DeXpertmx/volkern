'use client'

/**
 * Personalización del alta: el embudo.
 *
 * Arranca con el embudo que propuso el descubrimiento y deja retocarlo etapa a
 * etapa. «Crear el embudo en mi cuenta» lo aplica de verdad (con auditoría) y
 * el alta recarga su checklist para cerrar «Embudo aprobado». Deshacer solo
 * aparece mientras el embudo no tenga oportunidades dentro: en cuanto las hay,
 * se edita desde Pipeline, que es donde se avisa de los movimientos.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'

interface EtapaApi {
  nombre: string
  criterio: string
  probabilidad: number
}

interface EmbudoApi {
  nombre: string
  etapas: EtapaApi[]
}

interface AplicadoApi {
  pipelineId: string
  nombre: string
  activo: boolean
  etapas: { nombre: string; criterio: string; probabilidad: number; esEtapaFinal: boolean }[]
  oportunidades: number
}

interface RespuestaApi {
  propuesta: EmbudoApi | null
  embudo: EmbudoApi | null
  resumen: { etapas: number; sinCriterio: number; completo: boolean; texto: string } | null
  aplicado: AplicadoApi | null
  aplicadoEn: string | null
  limites: { maximo: number; usados: number; tier: string }
  topes: { minEtapas: number; maxEtapas: number }
  puedeAplicar: boolean
}

interface Props {
  /** Se llama tras aplicar o deshacer: el alta relee su checklist. */
  onAplicado?: () => void | Promise<void>
  onVolver?: () => void
}

export function EmbudoEditor({ onAplicado, onVolver }: Props = {}) {
  const [datos, setDatos] = useState<RespuestaApi | null>(null)
  const [nombre, setNombre] = useState('Ventas')
  const [etapas, setEtapas] = useState<EtapaApi[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoDeshacer, setConfirmandoDeshacer] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hidratar = useCallback((json: RespuestaApi) => {
    setDatos(json)
    const embudo = json.aplicado
      ? { nombre: json.aplicado.nombre, etapas: json.aplicado.etapas }
      : json.embudo
    if (embudo) {
      setNombre(embudo.nombre)
      setEtapas(
        embudo.etapas.map((etapa) => ({
          nombre: etapa.nombre,
          criterio: etapa.criterio ?? '',
          probabilidad: etapa.probabilidad,
        })),
      )
    }
  }, [])

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/implantacion/plan', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo leer tu embudo')
      hidratar(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer tu embudo')
    } finally {
      setCargando(false)
    }
  }, [hidratar])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const minEtapas = datos?.topes.minEtapas ?? 2
  const maxEtapas = datos?.topes.maxEtapas ?? 8
  const aplicado = datos?.aplicado ?? null
  const sinCriterio = etapas.filter((etapa) => etapa.criterio.trim().length === 0).length

  const editar = (indice: number, cambio: Partial<EtapaApi>) => {
    setEtapas((prev) => prev.map((etapa, i) => (i === indice ? { ...etapa, ...cambio } : etapa)))
  }

  const anadir = () => {
    if (etapas.length >= maxEtapas) return
    setEtapas((prev) => {
      // La etapa nueva entra antes del cierre: el cierre sigue cerrando.
      const cierre = prev[prev.length - 1]
      const antes = prev[prev.length - 2]
      const nueva: EtapaApi = {
        nombre: '',
        criterio: '',
        probabilidad: cierre
          ? Math.min(90, Math.max(antes?.probabilidad ?? 0, cierre.probabilidad - 10))
          : 50,
      }
      return [...prev.slice(0, -1), nueva, cierre].filter(Boolean)
    })
  }

  const quitar = (indice: number) => {
    if (etapas.length <= minEtapas) return
    setEtapas((prev) => prev.filter((_, i) => i !== indice))
  }

  const aplicar = async () => {
    setGuardando(true)
    setAvisos([])
    try {
      const res = await fetch('/api/implantacion/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embudo: { nombre, etapas } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo aplicar el embudo')

      setDatos((prev) => (prev ? { ...prev, embudo: json.embudo, aplicado: json.aplicado, aplicadoEn: json.aplicadoEn, resumen: json.resumen, limites: json.limites ?? prev.limites } : prev))
      setAvisos(Array.isArray(json.avisos) ? json.avisos : [])
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar el embudo')
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async () => {
    if (!confirmandoDeshacer) {
      setConfirmandoDeshacer(true)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/implantacion/plan', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo deshacer el embudo')
      setDatos((prev) =>
        prev ? { ...prev, aplicado: null, aplicadoEn: null, limites: json.limites ?? prev.limites } : prev,
      )
      setConfirmandoDeshacer(false)
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo deshacer el embudo')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Leyendo tu embudo…
      </div>
    )
  }

  // Sin descubrimiento no hay embudo que proponer: mejor decirlo que enseñar
  // un formulario vacío que no se puede aplicar.
  if (!aplicado && !datos?.embudo) {
    return (
      <Card className="bg-slate-800/40 border-slate-700">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium text-white">Aún no hay embudo que personalizar</p>
          <p className="text-xs text-slate-400">
            El embudo sale de tus respuestas del descubrimiento: contesta el cuestionario del alta y
            volverá aquí propuesto, con las etapas de tu ciclo de venta.
          </p>
          {onVolver && (
            <Button size="sm" variant="outline" onClick={onVolver} className="border-slate-600 text-slate-200 hover:bg-slate-700/50">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Volver a la propuesta
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Personaliza tu embudo</h2>
          <p className="text-sm text-slate-400 max-w-2xl">
            Cada etapa sale cuando pasa algo concreto. Ese criterio es lo que después te dice dónde se atasca
            una venta; sin él, el embudo es solo una lista de columnas.
          </p>
        </div>
        {datos && (
          <p className="text-xs text-slate-400 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
            Plan {datos.limites.tier} · {datos.limites.usados} de {datos.limites.maximo} embudo
            {datos.limites.maximo === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {error && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-3 flex items-start justify-between gap-3">
            <p className="text-sm text-red-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {error}
            </p>
            <button type="button" onClick={() => setError(null)} className="text-xs text-red-300 hover:text-white">
              Cerrar
            </button>
          </CardContent>
        </Card>
      )}

      {aplicado ? (
        <>
          <Card className="bg-emerald-500/5 border-emerald-500/30">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> «{aplicado.nombre}» ya está en tu cuenta
              </p>
              <p className="text-xs text-emerald-100/80">
                {aplicado.etapas.length} etapas ·{' '}
                {aplicado.oportunidades === 0
                  ? 'sin oportunidades todavía'
                  : `${aplicado.oportunidades} oportunidad${aplicado.oportunidades === 1 ? '' : 'es'} dentro`}
                . Es el embudo que verás en Pipeline y el que alimenta los informes.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Link
                  href="/dashboard/pipeline"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  Ver en Pipeline <ExternalLink className="h-3 w-3" />
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={deshacer}
                  disabled={guardando || aplicado.oportunidades > 0}
                  className="text-slate-400 hover:text-white"
                >
                  {guardando ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {confirmandoDeshacer ? 'Sí, borrar el embudo' : 'Deshacer'}
                </Button>
                {confirmandoDeshacer && (
                  <button
                    type="button"
                    onClick={() => setConfirmandoDeshacer(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              {aplicado.oportunidades > 0 && (
                <p className="text-[11px] text-emerald-100/60">
                  Con oportunidades dentro ya no se deshace desde aquí: se edita en Pipeline.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 border-slate-700">
            <CardContent className="p-4 space-y-2">
              {etapas.map((etapa, i) => (
                <div key={`${etapa.nombre}-${i}`} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-slate-700 text-[11px] flex items-center justify-center text-slate-300 flex-shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-slate-300">
                    <span className="text-white font-medium">{etapa.nombre}</span>
                    <span className="text-slate-500"> · {etapa.probabilidad}%</span>
                    {etapa.criterio && <span className="text-slate-500"> — sale cuando: </span>}
                    {etapa.criterio}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card className="bg-slate-800/40 border-slate-700">
            <CardContent className="p-4 space-y-4">
              <div className="max-w-sm">
                <Label htmlFor="embudo-nombre" className="text-xs text-slate-400">
                  Nombre del embudo
                </Label>
                <Input
                  id="embudo-nombre"
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value.slice(0, 60))}
                  className="mt-1 bg-slate-900/60 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-3">
                {etapas.map((etapa, i) => {
                  const esUltima = i === etapas.length - 1
                  return (
                    <div
                      key={`etapa-${i}`}
                      className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-400">
                          Etapa {i + 1}
                          {esUltima && <span className="text-emerald-400"> · cierra la venta</span>}
                        </p>
                        <button
                          type="button"
                          onClick={() => quitar(i)}
                          disabled={etapas.length <= minEtapas}
                          className="text-slate-500 hover:text-red-300 disabled:opacity-30"
                          aria-label={`Quitar la etapa ${etapa.nombre || i + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem]">
                        <div>
                          <Label htmlFor={`etapa-nombre-${i}`} className="text-[11px] text-slate-500">
                            Nombre
                          </Label>
                          <Input
                            id={`etapa-nombre-${i}`}
                            value={etapa.nombre}
                            onChange={(evento) => editar(i, { nombre: evento.target.value.slice(0, 60) })}
                            className="mt-1 bg-slate-900/60 border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`etapa-criterio-${i}`} className="text-[11px] text-slate-500">
                            Sale cuando…
                          </Label>
                          <Input
                            id={`etapa-criterio-${i}`}
                            value={etapa.criterio}
                            onChange={(evento) => editar(i, { criterio: evento.target.value.slice(0, 160) })}
                            className="mt-1 bg-slate-900/60 border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`etapa-probabilidad-${i}`} className="text-[11px] text-slate-500">
                            Prob. %
                          </Label>
                          <Input
                            id={`etapa-probabilidad-${i}`}
                            type="number"
                            min={0}
                            max={100}
                            value={esUltima ? 100 : etapa.probabilidad}
                            disabled={esUltima}
                            onChange={(evento) =>
                              editar(i, { probabilidad: Number(evento.target.value) || 0 })
                            }
                            className="mt-1 bg-slate-900/60 border-slate-700 text-white disabled:opacity-60"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={anadir}
                  disabled={etapas.length >= maxEtapas}
                  className="border-slate-600 text-slate-200 hover:bg-slate-700/50"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Añadir etapa
                </Button>
                <p className="text-[11px] text-slate-500">
                  {etapas.length} de {maxEtapas} etapas
                  {sinCriterio > 0 && ` · ${sinCriterio} sin criterio de salida`}
                </p>
              </div>

              <p className="text-[11px] text-slate-500">
                La última etapa cierra la venta (100 %). Las oportunidades perdidas se marcan con motivo, no
                necesitan etapa propia.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {onVolver ? (
              <Button variant="ghost" onClick={onVolver} className="text-slate-400 hover:text-white">
                <ArrowLeft className="h-4 w-4 mr-2" /> Volver a la propuesta
              </Button>
            ) : (
              <span />
            )}
            <Button
              onClick={aplicar}
              disabled={guardando || !datos?.puedeAplicar}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Crear el embudo en mi cuenta
            </Button>
          </div>
        </>
      )}

      {/* Los ajustes se ven también después de aplicar: si el servidor puso la
          última etapa al 100 % o subió una probabilidad, el cliente tiene que
          saberlo en el momento, no al recargar. */}
      {avisos.length > 0 && (
        <Card className="bg-amber-500/5 border-amber-500/30">
          <CardContent className="p-4 space-y-1.5">
            <p className="text-sm font-medium text-amber-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Se ha ajustado tu embudo
            </p>
            <ul className="space-y-1">
              {avisos.map((aviso) => (
                <li key={aviso} className="text-xs text-amber-100/80 flex items-start gap-2">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                  {aviso}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
