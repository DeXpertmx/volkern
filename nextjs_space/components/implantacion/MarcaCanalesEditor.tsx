'use client'

/**
 * Personalización del alta: marca y canales de captación.
 *
 * La propuesta sale del perfil: el nombre que ya firma la cuenta, un color de
 * partida según lo que vende y los canales que ha dicho que le traen trabajo.
 * Nada se escribe hasta pulsar aplicar, y aplicar deja una tarea por canal: un
 * canal marcado que no tiene tarea es una casilla, no una forma de captar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  Info,
  Loader2,
  Megaphone,
  Palette,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'

interface ColorApi {
  hex: string
  nombre: string
  motivo: string
}

interface PropuestaMarcaApi {
  nombre: { propuesto: string; actual: string | null; cambia: boolean; motivo: string }
  color: { propuesto: string; actual: string | null; cambia: boolean; motivo: string }
  paleta: ColorApi[]
  falta: string[]
}

interface CanalApi {
  id: string
  nombre: string
  comoEntra: string
  primerPaso: string
  requiere: string | null
  propuesto: boolean
  motivo: string
  paraEncajar: string | null
  leads: number
  conectado: boolean
}

interface RespuestaApi {
  propuesta: PropuestaMarcaApi
  canales: CanalApi[]
  origenDeclarado: string[]
  seleccion: { nombre: string; color: string; canales: string[] }
  resumen: { canales: number; nombreCambia: boolean; colorCambia: boolean; texto: string }
  aplicadoEn: string | null
  deshacerDisponible: boolean
  avisos: string[]
}

interface ResultadoApi {
  nombre: { anterior: string | null; actual: string; cambiado: boolean }
  color: { anterior: string | null; actual: string; cambiado: boolean }
  canales: { canal: string; id: string; estado: 'creada' | 'existente' }[]
  borradas: { canal: string; id: string }[]
  conservadas: { canal: string; id: string }[]
}

interface Props {
  /** Se llama tras aplicar o deshacer: el alta relee su checklist. */
  onAplicado?: () => void | Promise<void>
}

export function MarcaCanalesEditor({ onAplicado }: Props = {}) {
  const [datos, setDatos] = useState<RespuestaApi | null>(null)
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [elegidos, setElegidos] = useState<string[]>([])
  const [resultado, setResultado] = useState<ResultadoApi | null>(null)
  const [conservadas, setConservadas] = useState<ResultadoApi['conservadas'] | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoDeshacer, setConfirmandoDeshacer] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/implantacion/marca', { cache: 'no-store' })
      const json = (await res.json()) as RespuestaApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudo leer tu marca')

      setDatos(json)
      setNombre(json.seleccion?.nombre ?? json.propuesta?.nombre.propuesto ?? '')
      setColor(json.seleccion?.color ?? json.propuesta?.color.propuesto ?? '#3b82f6')
      setElegidos(json.seleccion?.canales ?? [])
      setAvisos(json.avisos ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer tu marca')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const canales = useMemo(() => datos?.canales ?? [], [datos])
  const propuesta = datos?.propuesta

  const alternarCanal = (id: string) => {
    setResultado(null)
    setElegidos((prev) => (prev.includes(id) ? prev.filter((canal) => canal !== id) : [...prev, id]))
  }

  const aplicar = async () => {
    setGuardando(true)
    setError(null)
    setConservadas(null)
    try {
      const res = await fetch('/api/implantacion/marca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, color, canales: elegidos }),
      })
      const json = (await res.json()) as { ok: true; resultado: ResultadoApi; avisos: string[] } & {
        error?: string
      }
      if (!res.ok) throw new Error(json?.error || 'No se pudo aplicar la marca')

      setResultado(json.resultado)
      setAvisos(json.avisos ?? [])
      await cargar()
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la marca')
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/implantacion/marca', { method: 'DELETE' })
      const json = (await res.json()) as {
        ok: true
        conservadas: ResultadoApi['conservadas']
      } & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudo deshacer la marca')

      setConservadas(json.conservadas)
      setResultado(null)
      setConfirmandoDeshacer(false)
      await cargar()
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo deshacer la marca')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <Card className="bg-slate-800/40 border-slate-700">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo tu marca y tus canales…
        </CardContent>
      </Card>
    )
  }

  const sinLogo = propuesta?.falta.some((item) => item.startsWith('Logo')) ?? false

  return (
    <Card className="bg-slate-800/40 border-slate-700">
      <CardContent className="p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Palette className="h-4 w-4 text-fuchsia-400" /> Marca y canales
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            El nombre y el color con los que salen tus propuestas y facturas, y por dónde entran tus
            clientes. Cada canal marcado deja una tarea con el primer paso para ponerlo en marcha.
          </p>
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

        {/* Nombre y color */}
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="marca-nombre" className="text-xs font-medium text-white flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-400" /> Nombre comercial
            </label>
            <input
              id="marca-nombre"
              value={nombre}
              onChange={(event) => {
                setResultado(null)
                setNombre(event.target.value)
              }}
              maxLength={80}
              placeholder="El nombre con el que firmas"
              className="w-full bg-slate-800 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-slate-100"
            />
            <p className="text-[11px] text-slate-400">{propuesta?.nombre.motivo}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-white flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-fuchsia-400" /> Color de marca
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                aria-label="Color de marca"
                value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#3b82f6'}
                onChange={(event) => {
                  setResultado(null)
                  setColor(event.target.value)
                }}
                className="h-8 w-10 rounded border border-slate-600 bg-slate-800 cursor-pointer"
              />
              <input
                aria-label="Color de marca en hexadecimal"
                value={color}
                onChange={(event) => {
                  setResultado(null)
                  setColor(event.target.value)
                }}
                maxLength={7}
                className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 font-mono"
              />
              {(propuesta?.paleta ?? []).map((opcion) => (
                <button
                  key={opcion.hex}
                  type="button"
                  onClick={() => {
                    setResultado(null)
                    setColor(opcion.hex)
                  }}
                  title={`${opcion.nombre}: ${opcion.motivo}`}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    color.toLowerCase() === opcion.hex ? 'border-white' : 'border-slate-600'
                  }`}
                  style={{ backgroundColor: opcion.hex }}
                  aria-label={`Usar el color ${opcion.nombre}`}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-400">{propuesta?.color.motivo}</p>
          </div>

          {sinLogo && (
            <div className="flex items-start gap-2 text-[11px] text-slate-400 border-t border-slate-700 pt-2">
              <ImageOff className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
              <span>
                Tu logo no lo generamos: súbelo en Identidad Visual y aparecerá en propuestas y
                facturas.{' '}
                <Link
                  href="/dashboard/configuracion"
                  className="text-fuchsia-300 hover:text-fuchsia-200 inline-flex items-center gap-1"
                >
                  Abrir configuración <ExternalLink className="h-3 w-3" />
                </Link>
              </span>
            </div>
          )}
        </div>

        {/* Canales */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-white flex items-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5 text-fuchsia-400" /> ¿Por dónde entran tus clientes?
          </p>
          {canales.map((canal) => {
            const marcado = elegidos.includes(canal.id)

            return (
              <div
                key={canal.id}
                className={`rounded-lg border p-3 transition-colors ${
                  marcado ? 'bg-fuchsia-500/10 border-fuchsia-500/60' : 'bg-slate-900/40 border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={`canal-${canal.id}`}
                    aria-label={`Marcar el canal ${canal.nombre}`}
                    checked={marcado}
                    onChange={() => alternarCanal(canal.id)}
                    className="mt-1 h-4 w-4 accent-fuchsia-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor={`canal-${canal.id}`}
                        className="text-sm font-medium text-white cursor-pointer"
                      >
                        {canal.nombre}
                      </label>
                      {canal.propuesto && (
                        <span className="text-[10px] uppercase tracking-wide text-fuchsia-200 bg-fuchsia-500/15 border border-fuchsia-500/40 rounded px-1.5 py-0.5">
                          Sugerido
                        </span>
                      )}
                      {canal.conectado && (
                        <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded px-1.5 py-0.5">
                          Conectado
                        </span>
                      )}
                      {canal.leads > 0 && (
                        <span className="text-[10px] text-slate-300 bg-slate-700/60 border border-slate-600 rounded px-1.5 py-0.5">
                          {canal.leads} lead{canal.leads === 1 ? '' : 's'} ya con este canal
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mt-0.5">{canal.comoEntra}</p>
                    <p
                      className={`text-xs mt-1 flex items-start gap-1.5 ${
                        canal.propuesto ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>{canal.propuesto ? canal.motivo : (canal.paraEncajar ?? canal.comoEntra)}</span>
                    </p>
                    {marcado && (
                      <p className="text-[11px] text-slate-400 mt-1.5 border-l-2 border-fuchsia-500/40 pl-2">
                        Primer paso: {canal.primerPaso}
                        {canal.requiere ? ` Necesita: ${canal.requiere}.` : ''}
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
            {datos?.resumen?.texto ?? 'Nada elegido.'}
            {datos?.aplicadoEn ? ' Aplicado en tu cuenta.' : ''}
          </p>
          <div className="flex items-center gap-2">
            {datos?.deshacerDisponible &&
              (confirmandoDeshacer ? (
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
                    Sí, deshacer la marca del alta
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
              ))}
            <Button
              onClick={aplicar}
              disabled={guardando || nombre.trim().length === 0}
              className="bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700"
            >
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Palette className="h-4 w-4 mr-2" />
              )}
              Aplicar marca y canales
            </Button>
          </div>
        </div>

        {resultado && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-1.5">
            <p className="text-xs font-medium text-white">Aplicado en tu cuenta</p>
            <ul className="space-y-1">
              <li className="text-[11px] text-slate-300 flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                Nombre comercial: <span className="text-white">{resultado.nombre.actual}</span>
                <span className="text-slate-500">· {resultado.nombre.cambiado ? 'cambiado' : 'sin cambios'}</span>
              </li>
              <li className="text-[11px] text-slate-300 flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                Color de marca: <span className="text-white font-mono">{resultado.color.actual}</span>
                <span className="text-slate-500">· {resultado.color.cambiado ? 'cambiado' : 'sin cambios'}</span>
              </li>
            </ul>
            {resultado.canales.length > 0 && (
              <p className="text-[11px] text-slate-400">
                {resultado.canales.length} tarea
                {resultado.canales.length === 1 ? '' : 's'} de puesta en marcha:{' '}
                {resultado.canales
                  .map((canal) => `${canal.canal}${canal.estado === 'existente' ? ' (ya estaba)' : ''}`)
                  .join(', ')}
                .
              </p>
            )}
            {resultado.borradas.length > 0 && (
              <p className="text-[11px] text-slate-400">
                Retiradas las tareas de los canales que has desmarcado: {resultado.borradas.map((c) => c.canal).join(', ')}.
              </p>
            )}
            {resultado.conservadas.length > 0 && (
              <p className="text-[11px] text-amber-200/80">
                {resultado.conservadas.length} tarea
                {resultado.conservadas.length === 1 ? '' : 's'} se queda
                {resultado.conservadas.length === 1 ? '' : 'n'} porque ya está
                {resultado.conservadas.length === 1 ? '' : 'n'} hecha
                {resultado.conservadas.length === 1 ? '' : 's'}.
              </p>
            )}
          </div>
        )}

        {conservadas && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
            <p className="text-xs font-medium text-amber-200">
              {conservadas.length === 0
                ? 'Marca del alta deshecha: nombre y color como estaban.'
                : `${conservadas.length} tarea${conservadas.length === 1 ? '' : 's'} se ${
                    conservadas.length === 1 ? 'queda' : 'quedan'
                  } porque ya está${conservadas.length === 1 ? '' : 'n'} hecha${conservadas.length === 1 ? '' : 's'}.`}
            </p>
            {conservadas.map((tarea) => (
              <p key={tarea.id} className="text-[11px] text-amber-200/80">
                Canal «{tarea.canal}»: la tarea se queda como trabajo hecho del equipo.
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
