export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPlaudernBot, updatePlaudernBot, deletePlaudernBot } from '@/lib/plaudern'

/**
 * GET /api/plaudern/bots/[id]
 * Obtiene un bot específico
 */
export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    // Obtener integrationId
    const integrationId = integration.botName || 'volkern-prod'

    const bot = await getPlaudernBot(integration.apiKey, params.id, integrationId)

    return NextResponse.json({ bot, success: true })
  } catch (error: any) {
    console.error('Error al obtener bot:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener bot' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/plaudern/bots/[id]
 * Actualiza un bot
 */
export async function PUT(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    const body = await req.json()
    const { name, personality, greetingMessage } = body

    // Obtener integrationId
    const integrationId = integration.botName || 'volkern-prod'

    const bot = await updatePlaudernBot(integration.apiKey, params.id, {
      name,
      personality,
      greetingMessage
    }, integrationId)

    // Audit log
    await prisma.auditLog.create({
      data: {
        accion: 'UPDATE',
        entidad: 'PlaudernBot',
        entidadId: params.id,
        userId: user.id,
        tenantId: user.tenantId,
        descripcion: `Bot actualizado en Plaudern`
      }
    })

    return NextResponse.json({ bot, success: true })
  } catch (error: any) {
    console.error('Error al actualizar bot:', error)
    return NextResponse.json(
      { error: error.message || 'Error al actualizar bot' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/plaudern/bots/[id]
 * Elimina un bot
 */
export async function DELETE(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    // Obtener integrationId
    const integrationId = integration.botName || 'volkern-prod'

    // Eliminar bot de Plaudern
    await deletePlaudernBot(integration.apiKey, params.id, integrationId)

    // Si este era el bot por defecto, actualizar la integración
    if (integration.botId === params.id) {
      await prisma.plaudernIntegration.update({
        where: { id: integration.id },
        data: { botId: null }
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        accion: 'DELETE',
        entidad: 'PlaudernBot',
        entidadId: params.id,
        userId: user.id,
        tenantId: user.tenantId,
        descripcion: `Bot eliminado de Plaudern`
      }
    })

    return NextResponse.json({ success: true, message: 'Bot eliminado exitosamente' })
  } catch (error: any) {
    console.error('Error al eliminar bot:', error)
    return NextResponse.json(
      { error: error.message || 'Error al eliminar bot' },
      { status: 500 }
    )
  }
}
