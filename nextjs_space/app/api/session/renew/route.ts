export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/session/renew
 *
 * Botón «Seguir conectado» del aviso de inactividad. El middleware NO exime
 * esta ruta del refresco deslizante, así que al pasar por él re-emite la cookie
 * con `lastActivity = ahora` y la cuenta vuelve a empezar.
 *
 * Si la sesión ya expiró, el session callback la trata como vacía y se responde
 * 401 para que el aviso ofrezca volver a iniciar sesión.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; idleTimeoutSeconds?: number } | undefined

  if (!user?.id) {
    return NextResponse.json(
      { error: 'Sesión expirada por inactividad', code: 'SESSION_IDLE_EXPIRED' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    renewed: true,
    idleTimeoutSeconds: user.idleTimeoutSeconds ?? 30 * 60,
  })
}
