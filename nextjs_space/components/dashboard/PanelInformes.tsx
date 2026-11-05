'use client'

/**
 * Widget del dashboard con los informes que el cliente fijó en el alta guiada.
 *
 * Un informe sin datos no se esconde ni enseña un cero que parece actividad:
 * muestra el primer paso que lo llena. Es la diferencia entre «panel vacío» y
 * «panel que te dice qué hacer».
 *
 * Y si lo que se ve es la **propuesta** del alta y no algo que el cliente ya
 * fijó, lo dice con un enlace directo a terminar el alta: si no, la lista
 * parece suya y vacía por falta de datos, cuando lo que falta es un clic.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, ExternalLink, Loader2, Settings2 } from 'lucide-react'

interface InformeApi {
  id: string
  etiqueta: string
  valor: string
  detalle: string
  vacio: boolean
  primerPaso: string
  enlace: string
  demuestra: string
}

export function PanelInformes() {
  const [informes, setInformes] = useState<InformeApi[]>([])
  const [pendienteDeAplicar, setPendienteDeAplicar] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/implantacion/entregables', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar tus informes')
        return json
      })
      .then((json) => {
        if (!vivo) return
        setInformes(Array.isArray(json.informes) ? json.informes : [])
        setPendienteDeAplicar(json.pendienteDeAplicar === true)
      })
      .catch((err) => {
        if (vivo) setError(err instanceof Error ? err.message : 'No se pudieron cargar tus informes')
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <Card className="h-full border-2 border-primary/5 bg-background/50 backdrop-blur-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-500" />
          Tus informes
        </CardTitle>
        <Link
          href="/dashboard/implantacion"
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Settings2 className="h-3 w-3" /> Ajustar
        </Link>
      </CardHeader>
      <CardContent className="overflow-y-auto">
        {cargando && (
          <p className="text-xs text-muted-foreground flex items-center gap-2 py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
          </p>
        )}

        {!cargando && error && <p className="text-xs text-destructive py-2">{error}</p>}

        {!cargando && !error && informes.length === 0 && (
          <div className="py-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Todavía no has fijado informes. Elige dos o tres y este panel deja de estar vacío.
            </p>
            <Link href="/dashboard/implantacion" className="text-xs text-primary hover:underline">
              Elegir mis informes →
            </Link>
          </div>
        )}

        {!cargando && !error && pendienteDeAplicar && (
          <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
              Estos informes los propone tu alta, pero todavía no están fijados en tu cuenta: se
              quedarán vacíos hasta que la termines.
            </p>
            <Link
              href="/dashboard/implantacion"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Terminar el alta →
            </Link>
          </div>
        )}

        {!cargando && informes.length > 0 && (
          <ul className="divide-y divide-border">
            {informes.map((informe) => (
              <li key={informe.id} className="py-2.5 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium text-foreground">{informe.etiqueta}</p>
                  <p
                    className={`text-sm font-black tabular-nums ${
                      informe.vacio ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {informe.valor}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{informe.detalle}</p>
                {informe.vacio && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1">
                    <ExternalLink className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                    <span>
                      Para llenarlo: {informe.primerPaso}{' '}
                      <Link href={informe.enlace} className="underline hover:no-underline">
                        Ir
                      </Link>
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
