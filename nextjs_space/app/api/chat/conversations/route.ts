export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createConversation, listConversations } from '@/lib/chat/gemma-conversations'

/** Historial de conversaciones + perfil del usuario y su tenant. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const userId = session.user.id
  const tenantId = session.user.tenantId!

  const [conversations, usuario, tenant] = await Promise.all([
    listConversations(userId, tenantId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, image: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true, plan: true, brandingConfig: true },
    }),
  ])

  const branding = (tenant?.brandingConfig as Record<string, unknown> | null) || {}
  const logo = typeof branding.logoUrl === 'string' ? branding.logoUrl : null

  return NextResponse.json({
    conversations,
    perfil: {
      nombre: usuario?.name || usuario?.email?.split('@')[0] || 'Usuario',
      email: usuario?.email || '',
      avatar: usuario?.image || null,
      // `roleName` lo añade el callback de sesión (lib/auth.ts) pero no está en
      // el tipo de Session: mismo acceso que en el resto de rutas.
      rol: (session.user as any).roleName || null,
      tenant: tenant?.nombre || 'Volkern',
      plan: tenant?.plan || 'basico',
      logo,
    },
  })
}

/** Nueva conversación vacía. */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const conversacion = await createConversation(session.user.id, session.user.tenantId!)
  return NextResponse.json({ id: conversacion.id, titulo: 'Nueva conversación' })
}
