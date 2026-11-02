'use client'

/**
 * Personalización del alta: impuestos, moneda y datos fiscales.
 *
 * La propuesta sale del país desde el que se factura y de lo que el cliente
 * vende: el tipo general de su país —o el reducido, si es alojamiento—, la
 * moneda que le corresponde y lo que le falta al emisor para poder emitir.
 *
 * Aquí no se inventa nada legal: la retención de IRPF y los tipos especiales se
 * explican y se marcan como «confírmalo», y el NIF no se rellena solo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  ExternalLink,
  Info,
  Loader2,
  Percent,
  Receipt,
  RotateCcw,
} from 'lucide-react'

interface TasaPropuestaApi {
  codigo: string
  nombre: string
  porcentaje: number
  motivo: string
  porDefecto: boolean
  requiereAsesoria: boolean
  propuesto: boolean
  paraEncajar: string | null
}

interface RespuestaApi {
  propuesta: {
    pais: string | null
    requiereEstado: boolean
    moneda: { actual: string; recomendada: string | null; coincide: boolean; motivo: string }
    tasas: TasaPropuestaApi[]
    faltanDatosEmisor: string[]
    notas: string[]
    avisos: string[]
  }
  seleccion: { moneda: string; tasas: string[] }
  resumen: { tasas: number; moneda: string; cambiaMoneda: boolean; texto: string }
  enCuenta: { id: string; codigo: string; nombre: string; porcentaje: number; pais: string }[]
  monedas: { codigo: string; nombre: string; simbolo: string }[]
  paises: { codigo: string; nombre: string }[]
  monedaActual: string
  aplicadoEn: string | null
  deshacerDisponible: boolean
  avisos: string[]
}

interface ResultadoTasaApi {
  codigo: string
  nombre: string
  porcentaje: number
  estado: 'creada' | 'actualizada' | 'sin_cambios'
  id: string
}

interface RespuestaAplicarApi {
  ok: true
  resultado: {
    tasas: ResultadoTasaApi[]
    moneda: { anterior: string; actual: string; cambiada: boolean }
  }
  avisos: string[]
}

interface RespuestaDeshacerApi {
  ok: true
  borradas: string[]
  conservadas: { codigo: string; nombre: string; usos: number }[]
}

const ETIQUETA_ESTADO: Record<ResultadoTasaApi['estado'], string> = {
  creada: 'Creada',
  actualizada: 'Corregida',
  sin_cambios: 'Ya estaba',
}

interface Props {
  /** Se llama tras aplicar o deshacer: el alta relee su checklist. */
  onAplicado?: () => void | Promise<void>
}

export function FiscalEditor({ onAplicado }: Props = {}) {
  const [datos, setDatos] = useState<RespuestaApi | null>(null)
  const [moneda, setMoneda] = useState('')
  const [elegidas, setElegidas] = useState<string[]>([])
  const [resultado, setResultado] = useState<RespuestaAplicarApi['resultado'] | null>(null)
  const [conservadas, setConservadas] = useState<RespuestaDeshacerApi['conservadas'] | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoDeshacer, setConfirmandoDeshacer] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/implantacion/fiscal', { cache: 'no-store' })
      const json = (await res.json()) as RespuestaApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudieron leer tus impuestos')
      setDatos(json)
      setMoneda(json.seleccion?.moneda ?? json.monedaActual)
      setElegidas(json.seleccion?.tasas ?? [])
      setAvisos(json.propuesta?.avisos ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron leer tus impuestos')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const propuesta = datos?.propuesta
  const tasas = propuesta?.tasas ?? []
  const enCuenta = datos?.enCuenta ?? []
  const codigosEnCuenta = useMemo(() => new Set(enCuenta.map((tasa) => tasa.codigo)), [enCuenta])
  const faltanDatos = propuesta?.faltanDatosEmisor ?? []

  const alternarTasa = (codigo: string) => {
    setResultado(null)
    setElegidas((prev) => (prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo]))
  }

  const aplicar = async () => {
    setGuardando(true)
    setError(null)
    setConservadas(null)
    try {
      const res = await fetch('/api/implantacion/fiscal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moneda, tasas: elegidas }),
      })
      const json = (await res.json()) as RespuestaAplicarApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudieron crear los impuestos')

      setResultado(json.resultado)
      setAvisos(json.avisos ?? [])
      await cargar()
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron crear los impuestos')
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/implantacion/fiscal', { method: 'DELETE' })
      const json = (await res.json()) as RespuestaDeshacerApi & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'No se pudieron deshacer los impuestos')

      setConservadas(json.conservadas)
      setResultado(null)
      setConfirmandoDeshacer(false)
      await cargar()
      await onAplicado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron deshacer los impuestos')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <Card className="bg-slate-800/40 border-slate-700">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo tus impuestos…
        </CardContent>
      </Card>
    )
  }

  const puedeAplicar = Boolean(propuesta?.pais) && elegidas.length > 0 && !guardando
  const cambioMoneda = moneda !== propuesta?.moneda.actual

  return (
    <Card className="bg-slate-800/40 border-slate-700">
      <CardContent className="p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Receipt className="h-4 w-4 text-cyan-400" /> Impuestos y moneda
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {propuesta?.pais
              ? 'Los tipos con los que vas a facturar y la moneda en la que se escriben los importes. Los que ya existan se corrigen, no se duplican.'
              : 'Todavía no sabemos desde qué país facturas: hasta que exista tu emisor fiscal no se proponen impuestos.'}
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

        {/* Moneda */}
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-white flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-cyan-400" /> Moneda de facturación
            </p>
            <select
              aria-label="Moneda de facturación"
              value={moneda}
              onChange={(event) => {
                setResultado(null)
                setMoneda(event.target.value)
              }}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100"
            >
              {(datos?.monedas ?? []).map((opcion) => (
                <option key={opcion.codigo} value={opcion.codigo}>
                  {opcion.codigo} · {opcion.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-slate-400">{propuesta?.moneda.motivo}</p>
          {cambioMoneda && (
            <p className="text-[11px] text-amber-300/90 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              Al aplicar, tu cuenta pasará a {moneda}. Lo ya escrito no se convierte: cambia la moneda de
              lo que se cree a partir de ahora.
            </p>
          )}
        </div>

        {/* Tasas */}
        {tasas.length > 0 && (
          <div className="space-y-2">
            {tasas.map((tasa) => {
              const marcada = elegidas.includes(tasa.codigo)
              const yaEsta = codigosEnCuenta.has(tasa.codigo)

              return (
                <div
                  key={tasa.codigo}
                  className={`rounded-lg border p-3 transition-colors ${
                    marcada ? 'bg-cyan-500/10 border-cyan-500/60' : 'bg-slate-900/40 border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={`tasa-${tasa.codigo}`}
                      aria-label={`Crear el impuesto ${tasa.nombre}`}
                      checked={marcada}
                      onChange={() => alternarTasa(tasa.codigo)}
                      className="mt-1 h-4 w-4 accent-cyan-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor={`tasa-${tasa.codigo}`}
                          className="text-sm font-medium text-white cursor-pointer"
                        >
                          {tasa.nombre}
                        </label>
                        <span className="text-xs font-semibold text-cyan-300">{tasa.porcentaje} %</span>
                        {tasa.porDefecto && (
                          <span className="text-[10px] uppercase tracking-wide text-cyan-200 bg-cyan-500/15 border border-cyan-500/40 rounded px-1.5 py-0.5">
                            Por defecto
                          </span>
                        )}
                        {tasa.requiereAsesoria && (
                          <span className="text-[10px] uppercase tracking-wide text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded px-1.5 py-0.5">
                            Confírmalo
                          </span>
                        )}
                        {yaEsta && (
                          <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded px-1.5 py-0.5">
                            Ya existe
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-xs mt-1 flex items-start gap-1.5 ${
                          tasa.propuesto ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{tasa.propuesto ? tasa.motivo : (tasa.paraEncajar ?? tasa.motivo)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Datos fiscales del emisor */}
        <div
          className={`rounded-lg border p-3 space-y-1.5 ${
            faltanDatos.length > 0
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-slate-700 bg-slate-900/40'
          }`}
        >
          <p className="text-xs font-medium text-white flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-slate-400" /> Datos fiscales del emisor
          </p>
          {faltanDatos.length === 0 ? (
            <p className="text-[11px] text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" /> Tu emisor fiscal está completo.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-amber-200">
                Para emitir una factura válida falta: {faltanDatos.join(', ')}.
              </p>
              <p className="text-[11px] text-slate-400">
                No lo rellenamos nosotros: son datos tuyos y un NIF inventado es peor que uno vacío.
              </p>
            </>
          )}
          <Link
            href="/dashboard/configuracion?section=fiscal"
            className="text-[11px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1"
          >
            Abrir Configuración fiscal <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {propuesta && propuesta.notas.length > 0 && (
          <ul className="space-y-1">
            {propuesta.notas.map((nota) => (
              <li key={nota} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0 text-slate-500" />
                <span>{nota}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-500">
            {datos?.resumen?.texto ?? 'Nada elegido.'}
            {enCuenta.length > 0 &&
              ` ${enCuenta.length} impuesto${enCuenta.length === 1 ? '' : 's'} ya en tu cuenta.`}
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
                    Sí, borrar los impuestos del alta
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
              disabled={!puedeAplicar}
              className="bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700"
            >
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Percent className="h-4 w-4 mr-2" />
              )}
              Crear impuestos en mi cuenta
            </Button>
          </div>
        </div>

        {resultado && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-1.5">
            <p className="text-xs font-medium text-white">Impuestos aplicados</p>
            <ul className="space-y-1">
              {resultado.tasas.map((tasa) => (
                <li key={tasa.id} className="text-[11px] text-slate-300 flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                  <span className="text-white">{tasa.nombre}</span>
                  <span className="text-slate-500">
                    · {tasa.porcentaje} % · {ETIQUETA_ESTADO[tasa.estado]}
                  </span>
                </li>
              ))}
            </ul>
            {resultado.moneda.cambiada && (
              <p className="text-[11px] text-slate-400">
                Moneda de la cuenta: {resultado.moneda.anterior} → {resultado.moneda.actual}.
              </p>
            )}
          </div>
        )}

        {conservadas && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
            <p className="text-xs font-medium text-amber-200">
              {conservadas.length === 0
                ? 'Impuestos del alta borrados.'
                : `${conservadas.length} impuesto${conservadas.length === 1 ? '' : 's'} se ${
                    conservadas.length === 1 ? 'queda' : 'quedan'
                  } porque ya está en documentos.`}
            </p>
            {conservadas.map((tasa) => (
              <p key={tasa.codigo} className="text-[11px] text-amber-200/80">
                «{tasa.nombre}»: {tasa.usos} documento{tasa.usos === 1 ? '' : 's'}. Cambia esas líneas antes
                de borrarlo.
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
