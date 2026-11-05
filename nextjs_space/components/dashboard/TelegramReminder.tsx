'use client'

/**
 * Recordatorio descartable del paso de Telegram omitido en el alta.
 *
 * Solo aparece cuando se cumplen las tres condiciones a la vez:
 *   1. la empresa omitió Telegram en el onboarding (`configuracion.onboarding`
 *      `.telegramOmitidoEn`, escrito por `handleSkipTelegram`),
 *   2. sigue sin conectar el bot (si ya lo conectó, no hay nada que recordar), *  3. nadie lo ha descartado (`telegramAvisoDescartadoEn`) ni lo ha silenciado
 *     (`telegramAvisoSilenciadoEn`).
 *
 * Las dos acciones se guardan en el tenant, no en `localStorage`: así no
 * reaparecen al recargar ni las ve cada persona de la empresa por separado, y
 * ambas caducan (lo resuelve el `GET`). Descartar oculta el aviso 30 días;
 * silenciar, solo 7 — para quien no quiere cerrarlo del todo todavía.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EstadoTelegram {
  telegramConnected?: boolean
  telegramOmitido?: boolean
  telegramAvisoDescartado?: boolean
  telegramAvisoSilenciado?: boolean
  telegramOmitidoEn?: string | null
}

const MS_DIA = 24 * 60 * 60 * 1000

/**
 * «hace unas horas» / «hace 12 días» / «hace un mes» para la marca de omisión.
 * Devuelve `null` si no hay fecha legible (o si está en el futuro, por reloj
 * desfasado): entonces el aviso se muestra sin la antigüedad en vez de mentir.
 */
function antiguedad(marca: string | null | undefined, ahora: number = Date.now()): string | null {
  if (!marca) return null
  const fecha = Date.parse(marca)
  if (Number.isNaN(fecha)) return null
  const transcurrido = ahora - fecha
  if (transcurrido < 0) return null
  if (transcurrido < MS_DIA) return 'hace unas horas'

  const dias = Math.floor(transcurrido / MS_DIA)
  if (dias === 1) return 'hace un día'
  if (dias < 30) return `hace ${dias} días`

  const meses = Math.floor(dias / 30)
  if (meses === 1) return 'hace un mes'
  if (meses < 12) return `hace ${meses} meses`
  return 'hace más de un año'
}

export function TelegramReminder() {
  const [estado, setEstado] = useState<EstadoTelegram | null>(null)
  const [oculto, setOculto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      try {
        const res = await fetch('/api/onboarding/quick')
        if (!res.ok) return
        const data: EstadoTelegram = await res.json()
        if (vivo) setEstado(data)
      } catch {
        // Sin estado no se muestra nada: el recordatorio no es crítico.
      }
    }
    cargar()
    return () => {
      vivo = false
    }
  }, [])

  const ocultar = async (step: 'dismiss-telegram-reminder' | 'snooze-telegram-reminder') => {
    setGuardando(true)
    // Se oculta de inmediato y, si el guardado falla, vuelve a aparecer.
    setOculto(true)
    try {
      const res = await fetch('/api/onboarding/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      })
      if (!res.ok) setOculto(false)
    } catch {
      setOculto(false)
    } finally {
      setGuardando(false)
    }
  }

  if (oculto || !estado) return null
  if (!estado.telegramOmitido || estado.telegramAvisoDescartado) return null
  if (estado.telegramAvisoSilenciado) return null
  if (estado.telegramConnected) return null

  // Cuánto lleva pendiente: da urgencia sin inventar fechas. Si la marca no se
  // puede leer, la frase sigue teniendo sentido sin ella.
  const pendiente = antiguedad(estado.telegramOmitidoEn)

  return (
    <div className="relative bg-sky-50 border-b border-sky-200 px-4 py-3">
      {/*
        En móvil manda el texto: las tres acciones (conectar, silenciar y X)
        no caben en la misma fila que la frase a 360 px, así que se apilan
        hasta `sm` y la fila de acciones puede partirse si hace falta.
      */}
      <div className="max-w-7xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <MessageCircle className="w-5 h-5 mt-0.5 text-sky-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sky-900">
              Dejaste Telegram para después{pendiente ? ` ${pendiente}` : ''}: aún no recibes el
              briefing ni los avisos urgentes.
            </p>
            <p className="text-xs text-sky-700/80 mt-0.5">
              Con el bot de tu empresa también se puede registrar un gasto, agendar una cita o
              consultar un lead por chat.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          <Link href="/dashboard/integraciones">
            <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap">
              Conectar Telegram
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => ocultar('snooze-telegram-reminder')}
            disabled={guardando}
            aria-label="Silenciar el recordatorio de Telegram 7 días"
            title="Ocultarlo una semana y volver a recordarlo después"
            className="h-8 px-2 text-xs font-normal whitespace-nowrap text-sky-700 hover:bg-sky-100"
          >
            Silenciar 7 días
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => ocultar('dismiss-telegram-reminder')}
            disabled={guardando}
            aria-label="Descartar el recordatorio de Telegram"
            title="No volver a mostrarlo en 30 días"
            className="h-8 w-8 p-0 text-sky-700 hover:bg-sky-100"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
