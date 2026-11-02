'use client'

/**
 * Personalización del alta: el equipo y sus permisos.
 *
 * La propuesta llega del descubrimiento («sois seis», «se te enfrían los leads»)
 * y el cliente decide qué roles se crean. Cada tarjeta dice por qué encaja y
 * qué hace exactamente; las que no encajan se enseñan igual, con lo que haría
 * falta para que encajaran, para que nadie tenga que adivinar.
 *
 * Aplicar crea los roles en la cuenta y no toca los que ya existan salvo para
 * completarlos: aquí no se quita un permiso a nadie.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react'

interface RolPropuestoApi {
  id: string
  nombre: string
  descripcion: string
  hace: string[]
  propuesto: boolean
  motivo: string
  senales: string[]
  paraEncajar: string | null
  permisos: Record<string, Record<string, boolean>>
  veTodo: boolean
}

interface EnCuentaApi {
  id: string | null
  roleId: string
  nombre: string
  usuarios: number
}

interface RespuestaApi {
  propuesta: {
    roles: RolPropuestoApi[]
    equipoEstimado: number | null
    avisos: string[]
  }
  seleccion: { id: string; veTodo: boolean }[]
  resumen: { roles: number; conEmbudoCompleto: number; nombres: string[]; texto: string }
  enCuenta: EnCuentaApi[]
  aplicadoEn: string | null
  deshacerDisponible: boolean
  equipo: { estimado: number | null; limiteUsuarios: number | null }
  avisos: string[]
}

interface ResultadoApi {
  id: string
  nombre: string
  estado: 'creado' | 'completado' | 'sin_cambios'
  roleId: string
  anadidos: string[]
  usuarios: number
}

interface RespuestaAplicarApi {
  ok: true
  resultados: ResultadoApi[]
  avisos: string[]
  aplicadoEn: string
}

interface RespuestaDeshacerApi {
  ok: true
  borrados: string[]
  conservados: { roleId: string; nombre: string; usuarios: number }[]
}

const ETIQUETA_ESTADO: Record<ResultadoApi['estado'], string> = {
  creado: 'Creado',
  completado: 'Completado',
  sin_cambios: 'Ya estaba',
}

interface Props {
  /** Se llama tras aplicar o deshacer: el alta relee su checklist. */
  onAplicado?: () => void | Promise<void>
}

export function RolesEditor({ onAplicado }: Props = {}) {
  const [datos, setDatos] = useState<RespuestaApi | null>(null)
  const [elegidos, setElegidos] = useState<{ id: string; veTodo: boolean }[]>([])
  const [resultados, setResultados] = useState<ResultadoApi[] | null>(null)
  const [conservados, setConservados] = useState<RespuestaDeshacerApi['conservados'] | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoDeshacer, setConfirmandoDeshacer] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/implantacion/roles', { cache: 'no-store' })
      const json = (await res.json()) as RespuestaApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudieron leer tus roles')
      setDatos(json)
      setElegidos(json.seleccion ?? [])
      setAvisos(json.propuesta?.avisos ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron leer tus roles')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const roles = datos?.propuesta?.roles ?? []
  const enCuenta = datos?.enCuenta ?? []
  // La respuesta puede venir incompleta (una versión anterior del servidor): se
  // lee con cuidado en vez de romper la pantalla entera del alta.
  const estimado = datos?.equipo?.estimado ?? null
  const limite = datos?.equipo?.limiteUsuarios ?? null

  const porNombre = useMemo(() => {
    const mapa = new Map<string, EnCuentaApi>()
    for (const rol of enCuenta) mapa.set(rol.nombre, rol)
    return mapa
  }, [enCuenta])

  const estaElegido = (id: string) => elegidos.some((e) => e.id === id)

  const alternar = (rol: RolPropuestoApi) => {
    setResultados(null)
    setElegidos((prev) =>
      prev.some((e) => e.id === rol.id)
        ? prev.filter((e) => e.id !== rol.id)
        : // El alcance arranca en el que vio el cliente en la tarjeta.
          [...prev, { id: rol.id, veTodo: rol.veTodo }],
    )
  }

  const alternarAlcance = (id: string) => {
    setResultados(null)
    setElegidos((prev) => prev.map((e) => (e.id === id ? { ...e, veTodo: !e.veTodo } : e)))
  }

  const aplicar = async () => {
    setGuardando(true)
    setError(null)
    setConservados(null)
    try {
      const res = await fetch('/api/implantacion/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seleccion: elegidos }),
      })
      const json = (await res.json()) as RespuestaAplicarApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudieron crear los roles')

      setResultados(json.resultados)
      setAvisos(json.avisos ?? [])
      await cargar()
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron crear los roles')
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/implantacion/roles', { method: 'DELETE' })
      const json = (await res.json()) as RespuestaDeshacerApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudieron deshacer los roles')

      setConservados(json.conservados)
      setResultados(null)
      setConfirmandoDeshacer(false)
      await cargar()
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron deshacer los roles')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <Card className="bg-slate-800/40 border-slate-700">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo tu equipo…
        </CardContent>
      </Card>
    )
  }

  const yaCreados = roles.filter((rol) => porNombre.has(rol.nombre))
  const puedeAplicar = elegidos.length > 0 && !guardando

  return (
    <Card className="bg-slate-800/40 border-slate-700">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-400" /> Tu equipo y sus permisos
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Un rol por cada trabajo que hay de verdad. Los que ya tengas con ese nombre se completan
              —nunca se les quita nada— y puedes añadir cualquiera de los demás a mano.
            </p>
          </div>
          {estimado !== null && (
            <span className="text-[11px] text-slate-400 bg-slate-900/50 border border-slate-700 rounded-full px-2.5 py-1 whitespace-nowrap">
              {estimado} {estimado === 1 ? 'persona' : 'personas'}
              {limite !== null && ` de ${limite}`}
            </span>
          )}
        </div>

        {avisos.length > 0 && (
          <ul className="space-y-1.5">
            {avisos.map((aviso) => (
              <li key={aviso} className="flex items-start gap-2 text-xs text-amber-300/90">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{aviso}</span>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}

        <div className="space-y-2">
          {roles.map((rol) => {
            const marcado = estaElegido(rol.id)
            const enLaCuenta = porNombre.get(rol.nombre)
            const seleccion = elegidos.find((e) => e.id === rol.id)
            const verTodo = seleccion?.veTodo ?? rol.veTodo

            return (
              <div
                key={rol.id}
                className={`rounded-lg border p-3 transition-colors ${
                  marcado ? 'bg-violet-500/10 border-violet-500/60' : 'bg-slate-900/40 border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={`rol-${rol.id}`}
                    aria-label={`Crear el rol ${rol.nombre}`}
                    checked={marcado}
                    onChange={() => alternar(rol)}
                    className="mt-1 h-4 w-4 accent-violet-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`rol-${rol.id}`} className="text-sm font-medium text-white cursor-pointer">
                        {rol.nombre}
                      </label>
                      {rol.propuesto ? (
                        <span className="text-[10px] uppercase tracking-wide text-violet-300 bg-violet-500/15 border border-violet-500/40 rounded px-1.5 py-0.5">
                          Encaja contigo
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                          Opcional
                        </span>
                      )}
                      {enLaCuenta && (
                        <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded px-1.5 py-0.5">
                          Ya existe
                          {enLaCuenta.usuarios > 0 && ` · ${enLaCuenta.usuarios} persona${enLaCuenta.usuarios === 1 ? '' : 's'}`}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mt-1">{rol.descripcion}</p>
                    <p className={`text-xs mt-1.5 flex items-start gap-1.5 ${rol.propuesto ? 'text-violet-300' : 'text-slate-500'}`}>
                      {rol.propuesto ? (
                        <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      )}
                      <span>{rol.motivo}</span>
                    </p>

                    {marcado && (
                      <div className="mt-2 space-y-2">
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {rol.hace.map((linea) => (
                            <li key={linea} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                              <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-400 flex-shrink-0" />
                              <span>{linea}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          onClick={() => alternarAlcance(rol.id)}
                          // El nombre accesible lleva el rol: hay varios botones
                          // «ve todo el embudo» en la misma pantalla.
                          aria-label={`Alcance de ${rol.nombre}`}
                          aria-pressed={verTodo}
                          className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                            verTodo
                              ? 'bg-slate-700 border-slate-500 text-slate-100'
                              : 'border-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {verTodo ? 'Ve todo el embudo' : 'Solo ve su cartera'}
                        </button>
                      </div>
                    )}

                    {enLaCuenta && marcado && (
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        Se completará si le falta algún permiso; lo que ya tenga, se queda.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-500">
            {datos?.resumen?.texto ?? 'Ningún rol elegido.'}
            {yaCreados.length > 0 && ` ${yaCreados.length} ya ${yaCreados.length === 1 ? 'existe' : 'existen'} en tu cuenta.`}
          </p>
          <div className="flex items-center gap-2">
            {datos?.deshacerDisponible && (
              confirmandoDeshacer ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmandoDeshacer(false)}
                    className="text-slate-300"
                  >
                    Cancelar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={deshacer} disabled={guardando}>
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Sí, borrar los roles del alta
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmandoDeshacer(true)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Deshacer
                </Button>
              )
            )}
            <Button
              onClick={aplicar}
              disabled={!puedeAplicar}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
              Crear roles en mi cuenta
            </Button>
          </div>
        </div>

        {resultados && resultados.length > 0 && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-1.5">
            <p className="text-xs font-medium text-white">Roles aplicados</p>
            <ul className="space-y-1">
              {resultados.map((resultado) => (
                <li key={resultado.roleId} className="text-[11px] text-slate-300 flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                  <span className="text-white">{resultado.nombre}</span>
                  <span className="text-slate-500">· {ETIQUETA_ESTADO[resultado.estado]}</span>
                  {resultado.anadidos.length > 0 && resultado.estado === 'completado' && (
                    <span className="text-slate-500">
                      · se añadieron {resultado.anadidos.length} permisos
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard/equipo"
              className="text-[11px] text-violet-300 hover:text-violet-200 inline-flex items-center gap-1"
            >
              Asignar roles a personas <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        {conservados && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
            <p className="text-xs font-medium text-amber-200">
              {conservados.length === 0
                ? 'Roles del alta borrados.'
                : `${conservados.length} rol${conservados.length === 1 ? '' : 'es'} se ${conservados.length === 1 ? 'queda' : 'quedan'} porque ${conservados.length === 1 ? 'hay' : 'hay'} personas usándolo.`}
            </p>
            {conservados.map((rol) => (
              <p key={rol.roleId} className="text-[11px] text-amber-200/80">
                «{rol.nombre}»: {rol.usuarios} persona{rol.usuarios === 1 ? '' : 's'}. Cambia primero a esas
                personas de rol desde Equipo.
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
