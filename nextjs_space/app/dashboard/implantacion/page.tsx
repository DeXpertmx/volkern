'use client'

/**
 * Alta guiada — descubrimiento y elección de módulos (R1).
 *
 * La pantalla no decide nada: pinta el cuestionario, manda las respuestas y
 * muestra lo que devuelve el motor (`lib/implantacion/recomendar.ts`). El
 * cliente acepta o descarta tarjeta a tarjeta, y nada de eso enciende módulos
 * todavía: aplicar el plan es un paso posterior y con auditoría.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Database,
  Info,
  Loader2,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import Link from 'next/link'
import {
  BLOQUES,
  PREGUNTAS,
  type PreguntaDescubrimiento,
  type RespuestaId,
} from '@/lib/implantacion/descubrimiento'
import { siguientePregunta } from '@/lib/implantacion/adaptativo'
import type { EstadoImplantacion, FirmaGoLive } from '@/lib/implantacion/estado'
import { EntregablesSelector } from '@/components/implantacion/EntregablesSelector'
import { EmbudoEditor } from '@/components/implantacion/EmbudoEditor'
import { RolesEditor } from '@/components/implantacion/RolesEditor'
import { FiscalEditor } from '@/components/implantacion/FiscalEditor'
import { MarcaCanalesEditor } from '@/components/implantacion/MarcaCanalesEditor'
import { ResumenGoLive } from '@/components/implantacion/ResumenGoLive'
import { CierreGoLive } from '@/components/implantacion/CierreGoLive'

// ─── Forma de la respuesta de la API ─────────────────────────────────────────

interface ModuloPropuesto {
  id: string
  etiqueta: string
  icono: string
  motivo: string
  requisito: string
  limite: string | null
  incluidoEnPlan: boolean
  peso: number
  senales: string[]
}

interface Recomendacion {
  modulos: ModuloPropuesto[]
  nucleo: { ids: string[]; nota: string }
  embudo: { nombre: string; etapas: { nombre: string; criterio: string; probabilidad: number }[] }
  informes: string[]
  plantillas: string[]
  riesgos: string[]
  limites: { plan: string; embudos: number; usuarios: number | null }
  preguntasSinResponder: string[]
  omitidos: number
}

interface Tarea {
  id: string
  titulo: string
  detalle: string
  dependeDe: string | null
  completada: boolean
}

interface RespuestaApi {
  estado: EstadoImplantacion
  etiquetas: Record<string, string>
  descubrimiento: { respuestas: Record<string, string[]>; noSe: string[]; notas: string }
  resumen: { contestadas: number; noSe: number; pendientes: number; total: number }
  recomendacion: Recomendacion | null
  aceptados: string[]
  descartados: string[]
  firma: FirmaGoLive | null
  checklist: Tarea[]
  cuenta: {
    plan: string
    nombrePlan: string
    limiteEmbudos: number | null
    limiteUsuarios: number | null
    modulosActivos: string[]
  }
  catalogos: {
    informes: Record<string, { etiqueta: string; demuestra: string }>
    plantillas: Record<string, { etiqueta: string; nota: string }>
  }
  minimoRespuestas: number
}

const CONTESTADAS_DE = (respuestas: Record<string, string[]>, noSe: string[]) =>
  PREGUNTAS.filter((p) => (respuestas[p.id]?.length ?? 0) > 0 || noSe.includes(p.id)).length

// ─── Página ──────────────────────────────────────────────────────────────────

export default function ImplantacionPage() {
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [datos, setDatos] = useState<RespuestaApi | null>(null)
  const [vista, setVista] = useState<'preguntas' | 'propuesta' | 'personalizacion' | 'cierre'>(
    'preguntas',
  )

  const [respuestas, setRespuestas] = useState<Record<string, string[]>>({})
  const [noSe, setNoSe] = useState<string[]>([])
  const [aceptados, setAceptados] = useState<Set<string>>(new Set())
  const [descartados, setDescartados] = useState<Set<string>>(new Set())

  const hidratar = useCallback((json: RespuestaApi) => {
    setDatos(json)
    setRespuestas(json.descubrimiento?.respuestas ?? {})
    setNoSe(json.descubrimiento?.noSe ?? [])
    setAceptados(new Set(json.aceptados ?? []))
    setDescartados(new Set(json.descartados ?? []))
    // El alta se retoma donde estaba: si ya dejó atrás la personalización, la
    // pantalla de cierre es la que tiene algo que decir (firmar y cerrar).
    const enCierre = json.estado === 'datos' || json.estado === 'listo'
    setVista(enCierre ? 'cierre' : json.recomendacion ? 'propuesta' : 'preguntas')
  }, [])

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      try {
        const res = await fetch('/api/implantacion')
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No se pudo leer el alta')
        if (!vivo) return
        hidratar(json)
      } catch (error) {
        if (vivo) toast.error(error instanceof Error ? error.message : 'No se pudo leer el alta')
      } finally {
        if (vivo) setCargando(false)
      }
    }
    cargar()
    return () => {
      vivo = false
    }
  }, [hidratar])

  /**
   * Al aplicar informes y plantillas el checklist cambia de estado: «Informes
   * fijados» solo se cierra con la selección aplicada, así que hay que releerlo
   * en ese momento y no esperar a recargar la página.
   */
  const recargarChecklist = useCallback(async () => {
    try {
      const res = await fetch('/api/implantacion', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json?.checklist) return
      setDatos((prev) => (prev ? { ...prev, checklist: json.checklist } : prev))
    } catch {
      // Si falla, el checklist se corrige al recargar: no se inventa el cierre.
    }
  }, [])

  /**
   * Aplicar el embudo cierra la personalización: si el alta seguía en la
   * elección, se avanza un paso (sin saltarse ninguno) para que el stepper no
   * diga que falta algo que ya está hecho.
   */
  const trasAplicarEmbudo = useCallback(async () => {
    if (datos?.estado === 'seleccion') {
      try {
        const res = await fetch('/api/implantacion', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'personalizacion' }),
        })
        const json = await res.json()
        if (res.ok) {
          setDatos((prev) =>
            prev ? { ...prev, estado: json.estado, checklist: json.checklist ?? prev.checklist } : prev,
          )
        }
      } catch {
        // El estado se corrige al recargar; el embudo ya está creado.
      }
    }
    await recargarChecklist()
  }, [datos?.estado, recargarChecklist])

  const respondidas = CONTESTADAS_DE(respuestas, noSe)
  const minimo = datos?.minimoRespuestas ?? 3
  const puedeProponer = respondidas >= minimo

  const recomendacion = datos?.recomendacion ?? null

  const elegidos = aceptados.size
  const descartadosN = descartados.size
  const sinDecidir = recomendacion
    ? recomendacion.modulos.filter((m) => !aceptados.has(m.id) && !descartados.has(m.id)).length
    : 0

  const toggleOpcion = (pregunta: PreguntaDescubrimiento, valor: string) => {
    setNoSe((prev) => prev.filter((id) => id !== pregunta.id))

    setRespuestas((prev) => {
      const actuales = prev[pregunta.id] ?? []
      if (!pregunta.multiple) return { ...prev, [pregunta.id]: [valor] }

      if (actuales.includes(valor)) {
        const siguiente = actuales.filter((v) => v !== valor)
        return { ...prev, [pregunta.id]: siguiente }
      }

      const tope = pregunta.maxOpciones ?? Infinity
      if (actuales.length >= tope) {
        toast.message(`Puedes elegir hasta ${tope} en esta pregunta`)
        return prev
      }
      return { ...prev, [pregunta.id]: [...actuales, valor] }
    })
  }

  const marcarNoSe = (pregunta: PreguntaDescubrimiento) => {
    const yaEsta = noSe.includes(pregunta.id)
    setNoSe((prev) => (yaEsta ? prev.filter((id) => id !== pregunta.id) : [...prev, pregunta.id]))
    if (!yaEsta) {
      setRespuestas((prev) => {
        const siguiente = { ...prev }
        delete siguiente[pregunta.id]
        return siguiente
      })
    }
  }

  const enviarDescubrimiento = async () => {
    setGuardando(true)
    try {
      const res = await fetch('/api/implantacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descubrimiento: { respuestas, noSe, notas: '' } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar')
      if (json.avisos?.length) json.avisos.forEach((a: string) => toast.message(a))
      if (!json.recomendacion) {
        toast.error(`Necesito al menos ${minimo} respuestas para proponerte algo`)
        setDatos((prev) => (prev ? { ...prev, ...json } : json))
        return
      }
      hidratar(json)
      toast.success('Propuesta lista')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const confirmarSeleccion = async () => {
    setGuardando(true)
    try {
      const res = await fetch('/api/implantacion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aceptados: [...aceptados], descartados: [...descartados] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar la elección')
      setDatos((prev) =>
        prev
          ? {
              ...prev,
              estado: json.estado,
              checklist: json.checklist,
              aceptados: json.aceptados,
              descartados: json.descartados,
            }
          : prev,
      )
      toast.success('Elección guardada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la elección')
    } finally {
      setGuardando(false)
    }
  }

  const alternarModulo = (id: string, destino: 'aceptar' | 'descartar') => {
    if (destino === 'aceptar') {
      setAceptados((prev) => {
        const siguiente = new Set(prev)
        if (siguiente.has(id)) siguiente.delete(id)
        else siguiente.add(id)
        return siguiente
      })
      setDescartados((prev) => {
        const siguiente = new Set(prev)
        siguiente.delete(id)
        return siguiente
      })
      return
    }

    setDescartados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
    setAceptados((prev) => {
      const siguiente = new Set(prev)
      siguiente.delete(id)
      return siguiente
    })
  }

  const etiquetaEstado = datos?.etiquetas?.[datos.estado] ?? 'Alta guiada'

  const progreso = useMemo(() => {
    if (!datos) return 0
    const indice = ['descubrimiento', 'propuesta', 'seleccion', 'personalizacion', 'datos', 'listo'].indexOf(datos.estado)
    return Math.max(1, indice + 1)
  }, [datos])

  const tarjetaChecklist = datos ? (
    <Card className="bg-slate-800/40 border-slate-700">
      <CardContent className="p-4">
        <p className="text-sm font-medium text-white flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-slate-400" /> Lo que falta para el go-live
        </p>
        <ul className="space-y-2">
          {datos.checklist.map((tarea) => (
            <li key={tarea.id} className="flex items-start gap-2 text-sm">
              {tarea.completada ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-slate-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={tarea.completada ? 'text-slate-400 line-through' : 'text-slate-200'}>
                  {tarea.titulo}
                </p>
                <p className="text-[11px] text-slate-500">{tarea.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  ) : null

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando el alta guiada…
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-violet-400 font-semibold">
            Alta guiada · paso {progreso} de 6
          </p>
          <h1 className="text-2xl font-bold text-white mt-1">{etiquetaEstado}</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            {vista === 'preguntas'
              ? 'Doce preguntas de negocio, cinco minutos. Con esto te proponemos solo lo que te sirve, con el motivo y lo que necesita para funcionar.'
              : vista === 'personalizacion'
                ? 'Cuatro cosas que se usan desde el primer día: el embudo con sus criterios, los roles de tu equipo, los impuestos con los que vas a facturar y tu marca con los canales por los que entran los clientes. Nada se crea hasta que pulses aplicar.'
                : vista === 'cierre'
                  ? 'El alta se cierra aquí: con el criterio de éxito escrito y la revisión de los 14 días agendada. Si algo se rompe después, su línea del checklist vuelve a abrirse.'
                  : 'Esto es lo que te sirve con lo que nos has contado. Añade o descarta cada módulo: descartar no borra nada.'}
          </p>
        </div>
        {datos?.cuenta && (
          <div className="text-xs text-slate-400 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
            Plan <span className="text-slate-200 font-medium">{datos.cuenta.nombrePlan}</span>
            {datos.cuenta.limiteEmbudos !== null && (
              <>
                {' · '}
                {datos.cuenta.limiteEmbudos} embudo{datos.cuenta.limiteEmbudos === 1 ? '' : 's'}
              </>
            )}
            {datos.cuenta.limiteUsuarios !== null && (
              <>
                {' · '}
                {datos.cuenta.limiteUsuarios} usuarios
              </>
            )}
          </div>
        )}
      </div>

      {vista === 'preguntas' ? (
        <>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <div className="h-2 flex-1 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all"
                style={{ width: `${(respondidas / PREGUNTAS.length) * 100}%` }}
              />
            </div>
            <span className="whitespace-nowrap">
              {respondidas} de {PREGUNTAS.length}
            </span>
          </div>

          {BLOQUES.map((bloque) => (
            <section key={bloque.id} className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{bloque.titulo}</h2>
                <p className="text-xs text-slate-400">{bloque.ayuda}</p>
              </div>

              {PREGUNTAS.filter((p) => p.bloque === bloque.id).map((pregunta) => {
                const seleccion = respuestas[pregunta.id] ?? []
                const esNoSe = noSe.includes(pregunta.id)
                // Lo que toca contestar ahora, según lo que ya hay: la pantalla
                // lo marca, pero no mueve las preguntas de sitio.
                const esSiguiente =
                  siguientePregunta({ respuestas, noSe: noSe as RespuestaId[], notas: '', version: 1 })
                    ?.id === pregunta.id
                return (
                  <Card key={pregunta.id} className="bg-slate-800/40 border-slate-700">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">{pregunta.titulo}</p>
                            {esSiguiente && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 whitespace-nowrap">
                                Siguiente
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{pregunta.ayuda}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => marcarNoSe(pregunta)}
                          className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                            esNoSe
                              ? 'bg-slate-600 border-slate-500 text-white'
                              : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                          }`}
                        >
                          No lo sé
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {pregunta.opciones.map((opcion) => {
                          const activa = seleccion.includes(opcion.valor)
                          return (
                            <button
                              key={opcion.valor}
                              type="button"
                              onClick={() => toggleOpcion(pregunta, opcion.valor)}
                              className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                                activa
                                  ? 'bg-violet-500/15 border-violet-500 text-white'
                                  : 'bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500'
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                {activa ? (
                                  <Check className="h-3.5 w-3.5 text-violet-400" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5 text-slate-600" />
                                )}
                                {opcion.etiqueta}
                              </span>
                              {opcion.detalle && (
                                <span className="block text-[11px] text-slate-500 mt-0.5 ml-5">{opcion.detalle}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {pregunta.multiple && (
                        <p className="text-[11px] text-slate-500">
                          {pregunta.maxOpciones
                            ? `Elige hasta ${pregunta.maxOpciones}.`
                            : 'Puedes elegir varias.'}
                          {esNoSe && ' Marcada como «no lo sé»: no se usa para recomendar.'}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-500">
              {puedeProponer
                ? 'Con lo que hay ya se puede proponer. Lo que dejes en blanco no se usará para recomendarte.'
                : `Responde al menos ${minimo} preguntas (o marca «no lo sé»).`}
            </p>
            <Button
              onClick={enviarDescubrimiento}
              disabled={!puedeProponer || guardando}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Ver lo que me sirve
            </Button>
          </div>
        </>
      ) : vista === 'personalizacion' ? (
        <>
          <EmbudoEditor onAplicado={trasAplicarEmbudo} onVolver={() => setVista('propuesta')} />
          <RolesEditor onAplicado={recargarChecklist} />
          <FiscalEditor onAplicado={recargarChecklist} />
          <MarcaCanalesEditor onAplicado={recargarChecklist} />
          {tarjetaChecklist}
          {/* Cierre del paso: las cuatro piezas juntas y el paso a datos, que
              solo se abre con todas ellas aplicadas en la cuenta. */}
          {datos && (
            <ResumenGoLive
              checklist={datos.checklist}
              estado={datos.estado}
              onAvanzado={(json) => {
                setDatos((prev) =>
                  prev
                    ? { ...prev, estado: json.estado, checklist: json.checklist ?? prev.checklist }
                    : prev,
                )
                // Al entrar en datos la personalización ya está cerrada: la
                // pantalla de cierre es la que toca, no seguir viendo editores.
                if (json.estado === 'datos' || json.estado === 'listo') setVista('cierre')
              }}
            />
          )}
        </>
      ) : vista === 'cierre' && datos ? (
        <>
          {/* El paso de datos tiene su propio asistente (informe de calidad
              antes de escribir): aquí se enlaza y se cierra el alta. */}
          <Card className="bg-slate-800/40 border-slate-700">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400" /> Paso de datos
              </p>
              <p className="text-xs text-slate-400">
                Empresas, contactos y catálogo entran por el asistente de importación: primero el
                informe de calidad, y nada se escribe hasta que lo confirmes.
              </p>
              <Link
                href="/dashboard/importar"
                className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1"
              >
                Cargar mis datos <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>

          <CierreGoLive
            checklist={datos.checklist}
            estado={datos.estado}
            firma={datos.firma ?? null}
            onCambiado={(json) =>
              setDatos((prev) =>
                prev
                  ? { ...prev, estado: json.estado, firma: json.firma, checklist: json.checklist }
                  : prev,
              )
            }
          />

          {tarjetaChecklist}
        </>
      ) : (
        <>
          {recomendacion && (
            <>
              {/* Núcleo y embudo */}
              <Card className="bg-slate-800/40 border-slate-700">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-2 text-sm text-slate-300">
                    <Info className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                    <p>{recomendacion.nucleo.nota}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-white flex items-center gap-2">
                      <Target className="h-4 w-4 text-violet-400" /> Tu embudo propuesto: {recomendacion.embudo.nombre}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {recomendacion.embudo.etapas.map((etapa, i) => (
                        <div key={etapa.nombre} className="flex items-start gap-3 text-sm">
                          <span className="mt-0.5 w-5 h-5 rounded-full bg-slate-700 text-[11px] flex items-center justify-center text-slate-300 flex-shrink-0">
                            {i + 1}
                          </span>
                          <p className="text-slate-300">
                            <span className="text-white font-medium">{etapa.nombre}</span>
                            <span className="text-slate-500"> — sale cuando: </span>
                            {etapa.criterio}
                            <span className="text-slate-500"> · {etapa.probabilidad}%</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Tu plan permite {recomendacion.limites.embudos} embudo
                    {recomendacion.limites.embudos === 1 ? '' : 's'}.
                  </p>
                </CardContent>
              </Card>

              {/* Riesgos */}
              {recomendacion.riesgos.length > 0 && (
                <Card className="bg-amber-500/5 border-amber-500/30">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-medium text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Antes de seguir, esto conviene aclararlo
                    </p>
                    <ul className="space-y-1.5">
                      {recomendacion.riesgos.map((riesgo) => (
                        <li key={riesgo} className="text-xs text-amber-100/80 flex items-start gap-2">
                          <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                          {riesgo}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Tarjetas de módulos */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-white">
                  Módulos que te sirven ({recomendacion.modulos.length})
                </h2>
                <p className="text-xs text-slate-400">
                  {elegidos} añadidos · {descartadosN} descartados · {sinDecidir} sin decidir
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {recomendacion.modulos.map((modulo) => {
                  const aceptado = aceptados.has(modulo.id)
                  const descartado = descartados.has(modulo.id)
                  return (
                    <Card
                      key={modulo.id}
                      data-testid={`modulo-${modulo.id}`}
                      className={`border transition-colors ${
                        aceptado
                          ? 'bg-violet-500/10 border-violet-500/50'
                          : descartado
                            ? 'bg-slate-900/40 border-slate-800 opacity-70'
                            : 'bg-slate-800/40 border-slate-700'
                      }`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-white">
                            <span className="mr-1.5">{modulo.icono}</span>
                            {modulo.etiqueta}
                          </p>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                              modulo.incluidoEnPlan
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            {modulo.incluidoEnPlan ? 'Incluido' : 'Addon aparte'}
                          </span>
                        </div>

                        <p className="text-sm text-slate-300">
                          <span className="text-slate-500">Te resuelve: </span>
                          {modulo.motivo}
                        </p>
                        <p className="text-xs text-slate-400">
                          <span className="text-slate-500">Necesitas: </span>
                          {modulo.requisito}
                        </p>
                        {modulo.limite && (
                          <p className="text-xs text-slate-400">
                            <span className="text-slate-500">No hace: </span>
                            {modulo.limite}
                          </p>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant={aceptado ? 'default' : 'outline'}
                            onClick={() => alternarModulo(modulo.id, 'aceptar')}
                            className={
                              aceptado
                                ? 'bg-violet-600 hover:bg-violet-700'
                                : 'border-slate-600 text-slate-200 hover:bg-slate-700/50'
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            {aceptado ? 'Añadido' : 'Añadir'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => alternarModulo(modulo.id, 'descartar')}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="h-3.5 w-3.5 mr-1.5" />
                            {descartado ? 'Descartado' : 'Ahora no'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {recomendacion.omitidos > 0 && (
                <p className="text-xs text-slate-500">
                  Y {recomendacion.omitidos} módulo{recomendacion.omitidos === 1 ? '' : 's'} más que encajan contigo:
                  los tienes en Configuración cuando los necesites, sin volver a pasar por aquí.
                </p>
              )}

              {/* Informes y plantillas: se eligen aquí y se aplican a la cuenta */}
              <EntregablesSelector onAplicado={recargarChecklist} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setVista('preguntas')} className="text-slate-400 hover:text-white">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Cambiar mis respuestas
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={confirmarSeleccion}
                    disabled={guardando || elegidos === 0}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                  >
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                    Confirmar {elegidos} módulo{elegidos === 1 ? '' : 's'}
                  </Button>
                  {/* El paso siguiente solo se abre cuando la elección ya está
                      guardada: el embudo se construye sobre ella. */}
                  {datos &&
                    datos.estado !== 'propuesta' &&
                    datos.estado !== 'descubrimiento' &&
                    elegidos > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setVista('personalizacion')}
                        className="border-slate-600 text-slate-200 hover:bg-slate-700/50"
                      >
                        Personalizar mi cuenta <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                </div>
              </div>
            </>
          )}

          {tarjetaChecklist}
        </>
      )}
    </div>
  )
}
