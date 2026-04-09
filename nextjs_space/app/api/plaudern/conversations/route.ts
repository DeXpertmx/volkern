export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPlaudernConversations, getPlaudernConversationStats } from '@/lib/plaudern'

/**
 * GET /api/plaudern/conversations
 * Lista conversaciones y estadísticas
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 })
    }

    const integration = await prisma.plaudernIntegration.findUnique({
      where: { tenantId: user.tenantId }
    })

    if (!integration || !integration.activo) {
      return NextResponse.json({ error: 'Integración de Plaudern no activa' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Obtener conversaciones
    const conversationsData = await getPlaudernConversations(integration.apiKey, {
      status: status || undefined,
      offset: (page - 1) * limit,
      limit
    })

    // Obtener estadísticas
    const stats = await getPlaudernConversationStats(integration.apiKey)

    return NextResponse.json({
      conversations: conversationsData.conversations || [],
      total: conversationsData.total || 0,
      stats,
      success: true
    })
  } catch (error: any) {
    console.error('Error al obtener conversaciones:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener conversaciones' },
      { status: 500 }
    )
  }
}
