export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * POST /api/plaudern/bots/[id]/toggle
 * Activa o desactiva un bot localmente (sin eliminarlo de Plaudern)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Obtener el array actual de bots desactivados
    const botsDesactivados = integration.botsDesactivados || []
    const botId = params.id
    const isCurrentlyDisabled = botsDesactivados.includes(botId)

    // Toggle: si está desactivado, activarlo; si está activado, desactivarlo
    let updatedBotsDesactivados: string[]
    let newStatus: 'activo' | 'desactivado'

    if (isCurrentlyDisabled) {
      // Activar: remover del array
      updatedBotsDesactivados = botsDesactivados.filter(id => id !== botId)
      newStatus = 'activo'
    } else {
      // Desactivar: agregar al array
      updatedBotsDesactivados = [...botsDesactivados, botId]
      newStatus = 'desactivado'
    }

    // Actualizar la integración
    await prisma.plaudernIntegration.update({
      where: { id: integration.id },
      data: {
        botsDesactivados: updatedBotsDesactivados
      }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        accion: 'UPDATE',
        entidad: 'PlaudernBot',
        entidadId: botId,
        userId: user.id,
        tenantId: user.tenantId,
        descripcion: `Bot ${newStatus === 'activo' ? 'activado' : 'desactivado'} localmente`
      }
    })

    return NextResponse.json({
      success: true,
      botId,
      status: newStatus,
      message: `Bot ${newStatus === 'activo' ? 'activado' : 'desactivado'} exitosamente`
    })
  } catch (error: any) {
    console.error('Error al cambiar estado del bot:', error)
    return NextResponse.json(
      { error: error.message || 'Error al cambiar estado del bot' },
      { status: 500 }
    )
  }
}
