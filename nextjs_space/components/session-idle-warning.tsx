'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SESSION_RENEW_PATH, SESSION_STATUS_PATH } from '@/lib/session-policy'

/** Cada cuánto se pregunta al servidor cuánto queda (no renueva la sesión). */
const POLL_INTERVAL_MS = 30_000

type InfoSesion = {
  remainingSeconds: number | null
  warnSeconds: number
  idleTimeoutSeconds: number
}

function formatearCuentaAtras(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  return `${minutos}:${String(resto).padStart(2, '0')}`
}

function urlLoginActual(): string {
  if (typeof window === 'undefined') return '/auth/login'
  const callbackUrl = `${window.location.pathname}${window.location.search}`
  return `/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
}

/**
 * Aviso de sesión a punto de expirar por inactividad.
 *
 * La cuenta atrás sale del servidor (GET /api/session/status), no del reloj
 * local: la expiración real la decide el `lastActivity` del JWT, que refresca
 * el middleware en cada petición. Consultar el estado NO renueva la sesión; solo
 * el botón «Seguir conectado» (POST /api/session/renew) la renueva.
 */
export function SessionIdleWarning() {
  const { status } = useSession()
  const [info, setInfo] = useState<InfoSesion | null>(null)
  const [restante, setRestante] = useState<number | null>(null)
  const [expirada, setExpirada] = useState(false)
  const [renovando, setRenovando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const consultar = useCallback(async () => {
    try {
      const res = await fetch(SESSION_STATUS_PATH, { credentials: 'include', cache: 'no-store' })
      if (res.status === 401) {
        setExpirada(true)
        setInfo(null)
        setRestante(null)
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as Partial<InfoSesion>
      const warnSeconds = typeof data.warnSeconds === 'number' ? data.warnSeconds : 2 * 60
      const idleTimeoutSeconds =
        typeof data.idleTimeoutSeconds === 'number' ? data.idleTimeoutSeconds : 30 * 60
      setInfo({ remainingSeconds: data.remainingSeconds ?? null, warnSeconds, idleTimeoutSeconds })
      setRestante(typeof data.remainingSeconds === 'number' ? data.remainingSeconds : null)
    } catch {
      // Sin red: se reintenta en el siguiente sondeo.
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') {
      setInfo(null)
      setRestante(null)
      return
    }

    void consultar()

    const sondeo = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void consultar()
    }, POLL_INTERVAL_MS)

    // La cuenta atrás avanza en local entre sondeos (no genera peticiones).
    const tictac = setInterval(() => {
      setRestante((actual) => (actual === null ? null : Math.max(0, actual - 1)))
    }, 1000)

    // Al volver a la pestaña se pregunta de nuevo: pudo pasar tiempo con la
    // pestaña oculta y el sondeo pausado.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void consultar()
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      clearInterval(sondeo)
      clearInterval(tictac)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [status, consultar])

  const renovar = useCallback(async () => {
    setRenovando(true)
    setError(null)
    try {
      const res = await fetch(SESSION_RENEW_PATH, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.status === 401) {
        setExpirada(true)
        setInfo(null)
        setRestante(null)
        return
      }
      if (!res.ok) {
        setError('No se pudo renovar la sesión. Inténtalo de nuevo.')
        return
      }
      const data = (await res.json()) as { idleTimeoutSeconds?: number }
      const nuevo = data.idleTimeoutSeconds ?? info?.idleTimeoutSeconds
      if (typeof nuevo === 'number') setRestante(nuevo)
    } catch {
      setError('No se pudo renovar la sesión. Inténtalo de nuevo.')
    } finally {
      setRenovando(false)
    }
  }, [info])

  if (status !== 'authenticated') return null

  if (expirada) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)]">
        <Alert variant="destructive">
          <AlertTitle>Sesión cerrada por inactividad</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Tu sesión ha expirado. Vuelve a iniciar sesión para continuar donde estabas.</p>
            <Button asChild size="sm" variant="destructive">
              <a href={urlLoginActual()}>Iniciar sesión</a>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!info || restante === null || restante > info.warnSeconds) return null

  const minutos = Math.floor(restante / 60)
  const texto = minutos >= 1 ? `en ${minutos} min` : `en ${restante} s`

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)]">
      <Alert
        aria-live="polite"
        className="border-amber-500/60 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-50"
      >
        <AlertTitle className="flex items-center gap-2">
          <span aria-hidden="true">⏳</span> Tu sesión está a punto de cerrarse
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Se cerrará por inactividad {texto} (<span className="tabular-nums">{formatearCuentaAtras(restante)}</span>).
            ¿Seguimos?
          </p>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button size="sm" onClick={() => void renovar()} disabled={renovando}>
            {renovando ? 'Renovando…' : 'Seguir conectado'}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}
