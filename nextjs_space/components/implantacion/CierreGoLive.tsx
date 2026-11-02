'use client'

/**
 * Cierre del alta: la firma del go-live.
 *
 * No es un botón de «terminar»: pide el criterio de éxito con el que se medirá
 * el alta, la confirmación de que las plantillas se revisaron con datos reales
 * y deja claro qué falta cuando todavía no se puede firmar. La firma se puede
 * retirar, y al retirarla el alta vuelve al paso de datos en vez de quedarse
 * cerrada con una firma que ya no vale.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSignature,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import type { EstadoImplantacion, FirmaGoLive, TareaChecklist } from '@/lib/implantacion/estado'
import {
  DIAS_REVISION,
  MAX_CRITERIO,
  MIN_CRITERIO,
  fechaRevision,
  puedeFirmar,
} from '@/lib/implantacion/cierre'

interface Props {
  checklist: TareaChecklist[]
  estado: EstadoImplantacion
  firma: FirmaGoLive | null
  /** El alta actualiza su estado, su firma y su checklist con lo que devuelve el PATCH. */
  onCambiado?: (json: {
    estado: EstadoImplantacion
    firma: FirmaGoLive | null
    checklist: TareaChecklist[]
  }) => void
}

const formatear = (valor: Date) =>
  valor.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

export function CierreGoLive({ checklist, estado, firma, onCambiado }: Props) {
  const gate = puedeFirmar(checklist)
  const [criterio, setCriterio] = useState('')
  const [revisadas, setRevisadas] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoRetirada, setConfirmandoRetirada] = useState(false)

  const criterioSuficiente = criterio.trim().length >= MIN_CRITERIO

  const revisionPrevista = useMemo(() => {
    const dentro = new Date()
    dentro.setDate(dentro.getDate() + DIAS_REVISION)
    return dentro
  }, [])

  const enviar = async (cuerpo: Record<string, unknown>) => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/implantacion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo cerrar el alta')

      onCambiado?.({
        estado: json.estado,
        firma: json.firma ?? null,
        checklist: json.checklist ?? checklist,
      })
      setConfirmandoRetirada(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el alta')
    } finally {
      setGuardando(false)
    }
  }

  if (firma) {
    const revision = fechaRevision(firma)

    return (
      <Card
        className="bg-slate-800/40 border-emerald-500/40"
        data-testid="cierre-golive-firmado"
      >
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-emerald-400" /> Go-live firmado
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                El alta queda cerrada con un criterio escrito. El checklist no se toca solo: si
                mañana se borra una pieza, su línea vuelve a abrirse.
              </p>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-500/15 text-emerald-300">
              Alta cerrada
            </span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Criterio de éxito
            </p>
            <p className="text-sm text-slate-100">«{firma.criterioExito}»</p>
          </div>

          <ul className="space-y-1 text-xs text-slate-400">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Firmado el {formatear(new Date(firma.firmadoEn))}.
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Revisión de los {DIAS_REVISION} días:{' '}
              {revision ? formatear(revision) : 'fecha no disponible'}.
            </li>
          </ul>

          {error && (
            <p className="text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-3">
            <Link
              href="/dashboard"
              className="text-xs text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1"
            >
              Ir a mi panel <ArrowRight className="h-3 w-3" />
            </Link>

            {confirmandoRetirada ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">¿Retirar la firma?</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmandoRetirada(false)}
                  disabled={guardando}
                  className="text-slate-300 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => enviar({ retirarFirma: true })}
                  disabled={guardando}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Sí, retirarla
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmandoRetirada(true)}
                className="text-slate-400 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Retirar la firma
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-slate-800/40 border-slate-700" data-testid="cierre-golive">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-emerald-400" /> Firmar el go-live
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Firmar deja por escrito con qué se mide el alta y agenda la revisión de los{' '}
              {DIAS_REVISION} días. No cierra nada que esté abierto.
            </p>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${
              gate.listo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-300'
            }`}
          >
            {gate.listo ? 'Todo cumplido' : `${gate.pendientes.length} pendientes`}
          </span>
        </div>

        {!gate.listo && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
            <p className="text-xs text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Todavía falta:
            </p>
            <ul className="space-y-0.5">
              {gate.pendientes.map((titulo) => (
                <li key={titulo} data-testid="pendiente-firma" className="text-[11px] text-amber-100/90">
                  · {titulo}
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-200">
            Criterio de éxito: ¿qué tendrá que ser cierto en {DIAS_REVISION} días?
          </span>
          <textarea
            value={criterio}
            onChange={(evento) => setCriterio(evento.target.value)}
            maxLength={MAX_CRITERIO}
            rows={3}
            placeholder="Ej.: 20 oportunidades creadas y la primera cotización enviada con la plantilla revisada."
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 p-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-[11px] text-slate-500">
            {criterio.trim().length}/{MAX_CRITERIO} · mínimo {MIN_CRITERIO} caracteres
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={revisadas}
            onChange={(evento) => setRevisadas(evento.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900"
          />
          <span>
            He revisado la cotización y los emails con datos reales antes de enviarlos.
          </span>
        </label>

        {error && (
          <p className="text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-3">
          <p className="text-[11px] text-slate-500">
            Revisión prevista: {formatear(revisionPrevista)}.
          </p>
          <Button
            onClick={() =>
              enviar({ firma: { criterioExito: criterio, plantillasRevisadas: revisadas } })
            }
            disabled={!gate.listo || !criterioSuficiente || !revisadas || guardando || estado !== 'datos'}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileSignature className="h-4 w-4 mr-2" />
            )}
            Firmar el go-live
          </Button>
        </div>

        {estado !== 'datos' && (
          <p className="text-[11px] text-slate-500">
            La firma se abre en el paso de datos: el alta tiene que haber dejado atrás la
            personalización.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
