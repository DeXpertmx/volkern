export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/session/status
 *
 * Informa al aviso del dashboard cuánto le queda a la sesión antes de cerrarse
 * por inactividad. Es de SOLO LECTURA: el middleware exime esta ruta del
 * refresco deslizante de la cookie (ver SESSION_STATUS_PATH en
 * lib/session-policy.ts), de modo que sondearla no mantiene viva la sesión.
 *
 * Si la sesión ya expiró por inactividad (o una revocación con logout-all la
 * invalidó), el
 * session callback devuelve una sesión vacía y aquí se responde 401.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as
    | { id?: string; lastActivity?: number; idleTimeoutSeconds?: number; idleWarningSeconds?: number }
    | undefined

  if (!user?.id) {
    return NextResponse.json(
      { error: 'Sesión expirada por inactividad', code: 'SESSION_IDLE_EXPIRED' },
      { status: 401 }
    )
  }

  const lastActivity = typeof user.lastActivity === 'number' ? user.lastActivity : null
  const idleTimeoutSeconds = user.idleTimeoutSeconds ?? 30 * 60
  const warnSeconds = user.idleWarningSeconds ?? 2 * 60
  // Sin `lastActivity` (sesión legacy) no hay cierre por inactividad: se informa
  // `remainingSeconds: null` y el aviso no se muestra.
  const remainingSeconds =
    lastActivity === null
      ? null
      : Math.max(0, lastActivity + idleTimeoutSeconds - Math.floor(Date.now() / 1000))

  return NextResponse.json({
    authenticated: true,
    lastActivity,
    idleTimeoutSeconds,
    warnSeconds,
    remainingSeconds,
  })
}
