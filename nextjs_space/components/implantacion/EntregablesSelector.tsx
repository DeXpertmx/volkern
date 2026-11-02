'use client'

/**
 * Selección de informes y plantillas del alta guiada.
 *
 * Viene premarcado con lo que propuso el perfil; el cliente quita o añade.
 * «Preparar mi panel» guarda la elección y la aplica: crea las plantillas que
 * se pueden crear y deja fijados los informes para que el dashboard no esté
 * vacío al entrar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Sparkles,
} from 'lucide-react'

interface InformeEntregableApi {
  id: string
  etiqueta: string
  demuestra: string
  enlace: string
  primerPaso: string
}

interface PlantillaEntregableApi {
  id: string
  etiqueta: string
  nota: string
  tipo: string
  enlace: string
  seCreaSola: boolean
  primerPaso: string
}

interface InformeCalculadoApi {
  id: string
  etiqueta: string
  valor: string
  detalle: string
  vacio: boolean
}

interface AplicadaApi {
  id: string
  etiqueta: string
  resultado: 'creada' | 'ya_existia' | 'manual'
  detalle: string
  enlace: string
}

interface RespuestaApi {
  seleccion: { informes: string[]; plantillas: string[] }
  recomendada: { informes: string[]; plantillas: string[] }
  catalogo: { informes: InformeEntregableApi[]; plantillas: PlantillaEntregableApi[] }
  topes: { informes: number; plantillas: number; minInformes: number; minPlantillas: number }
  resumen: { informes: number; plantillas: number; seCreanSolas: number; manuales: number; completa: boolean }
  aplicadoEn: string | null
  informes: InformeCalculadoApi[]
}

interface RespuestaAplicarApi {
  seleccion: { informes: string[]; plantillas: string[] }
  avisos: string[]
  aplicacion: { informes: number; plantillas: AplicadaApi[]; creadas: number; manuales: number }
}

const ETIQUETA_RESULTADO: Record<AplicadaApi['resultado'], string> = {
  creada: 'Creada ahora',
  ya_existia: 'Ya existía',
  manual: 'Paso manual',
}

interface Props {
  /** Se llama tras aplicar: el alta recarga su checklist para cerrar «Informes fijados». */
  onAplicado?: () => void | Promise<void>
}

export function EntregablesSelector({ onAplicado }: Props = {}) {
  const [datos, setDatos] = useState<RespuestaApi | null>(null)
  const [informes, setInformes] = useState<string[]>([])
  const [plantillas, setPlantillas] = useState<string[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [aplicadas, setAplicadas] = useState<AplicadaApi[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/implantacion/entregables', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudieron leer tus informes')
      setDatos(json)
      setInformes(json.seleccion.informes)
      setPlantillas(json.seleccion.plantillas)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron leer tus informes')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const propuestos = useMemo(
    () => ({
      informes: new Set(datos?.recomendada.informes ?? []),
      plantillas: new Set(datos?.recomendada.plantillas ?? []),
    }),
    [datos],
  )

  const topeInformes = datos?.topes.informes ?? 4
  const topePlantillas = datos?.topes.plantillas ?? 4
  const minInformes = datos?.topes.minInformes ?? 2
  const minPlantillas = datos?.topes.minPlantillas ?? 1

  const completa = informes.length >= minInformes && plantillas.length >= minPlantillas

  const alternar = (
    lista: string[],
    setLista: (valor: string[]) => void,
    id: string,
    tope: number,
    singular: string,
  ) => {
    setAplicadas(null)
    if (lista.includes(id)) {
      setLista(lista.filter((x) => x !== id))
      return
    }
    if (lista.length >= tope) {
      setError(`Puedes fijar hasta ${tope} ${singular}s: quita uno antes de añadir otro.`)
      return
    }
    setError(null)
    setLista([...lista, id])
  }

  const aplicar = async () => {
    setGuardando(true)
    setError(null)
    setAvisos([])
    try {
      const res = await fetch('/api/implantacion/entregables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informes, plantillas }),
      })
      const json = (await res.json()) as RespuestaAplicarApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudo preparar el panel')

      setInformes(json.seleccion.informes)
      setPlantillas(json.seleccion.plantillas)
      setAvisos(json.avisos ?? [])
      setAplicadas(json.aplicacion.plantillas)
      await cargar()
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar el panel')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus informes…
      </div>
    )
  }

  if (!datos) {
    return <p className="text-sm text-rose-300">{error ?? 'No se pudieron leer tus informes.'}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-cyan-400" /> Lo que te encontrarás al entrar
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Premarcado con lo que encaja con tu perfil. Puedes quitarlo o cambiarlo: lo que no puede quedarse
            vacío es el panel.
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          {informes.length}/{topeInformes} informes · {plantillas.length}/{topePlantillas} plantillas
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Informes */}
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-cyan-400" /> Informes fijados
            </p>
            <ul className="space-y-2">
              {datos.catalogo.informes.map((informe) => {
                const elegido = informes.includes(informe.id)
                const propuesto = propuestos.informes.has(informe.id)
                return (
                  <li key={informe.id}>
                    <button
                      type="button"
                      onClick={() => alternar(informes, setInformes, informe.id, topeInformes, 'informe')}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        elegido
                          ? 'border-cyan-500/40 bg-cyan-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                      aria-pressed={elegido}
                    >
                      <span className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                            elegido ? 'border-cyan-400 bg-cyan-500/30' : 'border-slate-600'
                          }`}
                        >
                          {elegido && <Check className="h-3 w-3 text-cyan-200" />}
                        </span>
                        <span className="min-w-0">
                          <span className="text-xs font-medium text-white flex flex-wrap items-center gap-1.5">
                            {informe.etiqueta}
                            {propuesto && (
                              <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                                <Sparkles className="h-2.5 w-2.5" /> Propuesto
                              </span>
                            )}
                          </span>
                          <span className="block text-[11px] text-slate-500">{informe.demuestra}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {informes.length < minInformes && (
              <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> Con menos de {minInformes} el panel se queda vacío al
                entrar.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Plantillas */}
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-400" /> Plantillas para la primera semana
            </p>
            <ul className="space-y-2">
              {datos.catalogo.plantillas.map((plantilla) => {
                const elegida = plantillas.includes(plantilla.id)
                const propuesta = propuestos.plantillas.has(plantilla.id)
                return (
                  <li key={plantilla.id}>
                    <button
                      type="button"
                      onClick={() => alternar(plantillas, setPlantillas, plantilla.id, topePlantillas, 'plantilla')}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        elegida
                          ? 'border-violet-500/40 bg-violet-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                      aria-pressed={elegida}
                    >
                      <span className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                            elegida ? 'border-violet-400 bg-violet-500/30' : 'border-slate-600'
                          }`}
                        >
                          {elegida && <Check className="h-3 w-3 text-violet-200" />}
                        </span>
                        <span className="min-w-0">
                          <span className="text-xs font-medium text-white flex flex-wrap items-center gap-1.5">
                            {plantilla.etiqueta}
                            {plantilla.seCreaSola ? (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                Se crea sola
                              </span>
                            ) : (
                              <span className="rounded bg-slate-600/40 px-1.5 py-0.5 text-[10px] text-slate-300">
                                Paso manual
                              </span>
                            )}
                            {propuesta && <CheckCircle2 className="h-3 w-3 text-violet-300" />}
                          </span>
                          <span className="block text-[11px] text-slate-500">{plantilla.nota}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {plantillas.length < minPlantillas && (
              <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> Fija al menos una: el primer contacto no debería
                escribirse de cero.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {avisos.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
          {avisos.map((aviso) => (
            <p key={aviso} className="text-xs text-amber-200">
              {aviso}
            </p>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          {datos.aplicadoEn
            ? `Aplicado por última vez el ${new Date(datos.aplicadoEn).toLocaleDateString('es-ES')}`
            : 'Aún no has preparado el panel: los informes están fijados pero no se ha creado ninguna plantilla.'}
        </p>
        <Button
          onClick={aplicar}
          disabled={guardando || !completa}
          className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-700 hover:to-violet-700"
        >
          {guardando ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <LayoutDashboard className="h-4 w-4 mr-2" />
          )}
          Preparar mi panel
        </Button>
      </div>

      {aplicadas && aplicadas.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <p className="text-xs font-medium text-white">Esto es lo que ha quedado listo</p>
          <ul className="space-y-1.5">
            {aplicadas.map((plantilla) => (
              <li key={plantilla.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    plantilla.resultado === 'creada'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : plantilla.resultado === 'manual'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-600/40 text-slate-300'
                  }`}
                >
                  {ETIQUETA_RESULTADO[plantilla.resultado]}
                </span>
                <span className="text-slate-200">{plantilla.etiqueta}</span>
                <span className="text-slate-500">{plantilla.detalle}</span>
                <Link href={plantilla.enlace} className="text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">
                  Abrir <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/dashboard" className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
            Ver mi panel <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  )
}
