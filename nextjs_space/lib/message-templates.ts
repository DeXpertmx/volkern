import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

/**
 * Tenant del usuario de la sesión, o null si no hay sesión/tenant.
 *
 * Las plantillas de mensajes son por tenant: todas las rutas que las leen o
 * escriben deben resolverlo aquí y filtrar por él, no fiarse de la sesión a
 * medias (antes eran globales y cualquier tenant veía las de los demás).
 */
export async function tenantIdDeSesion(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { tenantId: true },
  })

  return user?.tenantId ?? null
}
