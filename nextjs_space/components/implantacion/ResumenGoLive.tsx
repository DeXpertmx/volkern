'use client'

/**
 * Resumen final del go-live: las cuatro piezas de la personalización en una
 * tarjeta y el botón que abre el paso de datos.
 *
 * No propone nada ni recuerda lo que el cliente marcó: pinta el checklist que
 * la API calcula con hechos de la cuenta. Si alguien borra el embudo, aquí se
 * vuelve a ver abierto antes de cargar contactos encima.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  Rocket,
} from 'lucide-react'
import Link from 'next/link'
import type { EstadoImplantacion, TareaChecklist } from '@/lib/implantacion/estado'
import { pasosHastaDatos, resumirGoLive } from '@/lib/implantacion/resumen-golive'

interface Props {
  checklist: TareaChecklist[]
  estado: EstadoImplantacion
  /** El alta actualiza su estado y su checklist con lo que devuelve el PATCH. */
  onAvanzado?: (json: { estado: EstadoImplantacion; checklist: TareaChecklist[] }) => void
}

export function ResumenGoLive({ checklist, estado, onAvanzado }: Props) {
  const resumen = resumirGoLive(checklist)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enDatos, setEnDatos] = useState(estado === 'datos' || estado === 'listo')

  /**
   * Avanza de uno en uno hasta «datos»: la API no deja saltarse pasos y el alta
   * puede seguir en «seleccion» si el cliente entró a personalizar sin pasar
   * por el botón de la propuesta.
   */
  const pasarADatos = async () => {
    setGuardando(true)
    setError(null)
    try {
      const pasos = pasosHastaDatos(estado)
      if (pasos.length === 0) {
        setEnDatos(true)
        return
      }

      for (const paso of pasos) {
        const res = await fetch('/api/implantacion', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: paso }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No se pudo pasar al paso de datos')

        onAvanzado?.({ estado: json.estado, checklist: json.checklist ?? checklist })
      }

      setEnDatos(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo pasar al paso de datos')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card className="bg-slate-800/40 border-slate-700" data-testid="resumen-golive">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Rocket className="h-4 w-4 text-emerald-400" /> Resumen del go-live
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Las cuatro piezas de la personalización, comprobadas en tu cuenta y no solo propuestas.
              Con esto cerrado, el alta pasa a cargar tus datos.
            </p>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${
              resumen.listo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-300'
            }`}
          >
            {resumen.aplicadas} de {resumen.total} aplicadas
          </span>
        </div>

        <ul className="space-y-2.5">
          {resumen.piezas.map((pieza) => (
            <li
              key={pieza.id}
              data-testid={`pieza-${pieza.id}`}
              className="flex items-start gap-2 text-sm"
            >
              {pieza.aplicada ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-slate-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={pieza.aplicada ? 'text-slate-300' : 'text-white'}>{pieza.titulo}</p>
                <p className="text-[11px] text-slate-500">{pieza.detalle}</p>
              </div>
            </li>
          ))}
        </ul>

        {error && (
          <p className="text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-3">
          <div>
            <p className="text-xs text-slate-400">{resumen.texto}</p>
            <p className="text-[11px] text-slate-500">
              Go-live: {resumen.lineas.completadas} de {resumen.lineas.total} líneas cerradas.
            </p>
          </div>
          <Button
            onClick={pasarADatos}
            disabled={!resumen.listo || guardando || enDatos}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            Pasar a datos
          </Button>
        </div>

        {!resumen.listo && !enDatos && (
          <p className="text-[11px] text-slate-500">
            El paso se abre con las cuatro piezas aplicadas: cargar contactos sobre un embudo sin
            etapas deja los leads sin sitio donde caer.
          </p>
        )}

        {enDatos && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-1.5">
            <p className="text-xs font-medium text-emerald-200">Alta en el paso de datos</p>
            <p className="text-[11px] text-emerald-100/80">
              Lo que cargues entra en una cuenta ya configurada: embudo, equipo, impuestos, marca y
              canales están puestos.
            </p>
            <Link
              href="/dashboard/importar"
              className="text-[11px] text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1"
            >
              Cargar empresas, contactos y catálogo <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
