export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPlaudernBots, createPlaudernBot } from '@/lib/plaudern'

/**
 * GET /api/plaudern/bots
 * Lista todos los bots de Plaudern del tenant
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { tenant: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 })
    }

    // Obtener integración de Plaudern
    const integration = await prisma.plaudernIntegration.findUnique({
      where: { tenantId: user.tenantId }
    })

    if (!integration || !integration.activo) {
      return NextResponse.json({ error: 'Integración de Plaudern no activa' }, { status: 400 })
    }

    // Obtener integrationId (usar botName si existe, sino por defecto volkern-prod)
    const integrationId = integration.botName || 'volkern-prod'

    // Obtener bots desde la API de Plaudern
    const bots = await getPlaudernBots(integration.apiKey, integrationId)

    // Agregar estado local (activo/desactivado) a cada bot
    const botsDesactivados = integration.botsDesactivados || []
    const botsWithStatus = bots.map(bot => ({
      ...bot,
      activoLocal: !botsDesactivados.includes(bot.id)
    }))

    return NextResponse.json({ bots: botsWithStatus, success: true })
  } catch (error: any) {
    console.error('Error al obtener bots de Plaudern:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener bots' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/plaudern/bots
 * Crea un bot O lista bots con autenticación temporal (para formulario de integración)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    
    // Modo 1: Autenticación temporal (para cargar bots antes de guardar integración)
    if (body.tempAuth === true) {
      const { apiKey, integrationId } = body

      if (!apiKey || !integrationId) {
        return NextResponse.json(
          { error: 'Se requiere apiKey e integrationId para autenticación temporal' },
          { status: 400 }
        )
      }

      try {
        // Obtener bots usando credenciales temporales
        const bots = await getPlaudernBots(apiKey, integrationId)
        return NextResponse.json({ bots, success: true })
      } catch (error: any) {
        console.error('Error al obtener bots con auth temporal:', error)
        return NextResponse.json(
          { error: error.message || 'Error al cargar bots' },
          { status: 500 }
        )
      }
    }

    // Modo 2: Creación de bot (lógica existente)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { tenant: true }
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

    const integrationId = integration.botName || 'volkern-prod'

    // Crear el bot
    const bot = await createPlaudernBot(
      integration.apiKey,
      {
        name: body.name,
        personality: body.personality,
        greetingMessage: body.greetingMessage,
        description: body.description,
        settings: body.settings
      },
      integrationId
    )

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        accion: 'CREATE',
        entidad: 'PlaudernBot',
        entidadId: bot.id,
        descripcion: `Bot de Plaudern creado: ${bot.name}`,
        tenantId: user.tenantId
      }
    })

    return NextResponse.json({ bot, success: true }, { status: 201 })
  } catch (error: any) {
    console.error('Error en POST /api/plaudern/bots:', error)
    return NextResponse.json(
      { error: error.message || 'Error al procesar solicitud' },
      { status: 500 }
    )
  }
}
