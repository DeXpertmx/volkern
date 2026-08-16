export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/mensajes/conversaciones - Obtener todas las conversaciones del tenant
// Soporta la pestaña del hub: tab=mias|sin_asignar|todas (asignación real del
// agente en Chatwoot). Devuelve además counts con el desglose por pestaña.
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const canal = searchParams.get('canal')
    const estado = searchParams.get('estado')
    const tab = searchParams.get('tab') || 'todas'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const userEmail = (auth.user?.email || '').toLowerCase()

    const where: any = {
      tenantId: auth.tenant!.id
    }
    
    if (canal && canal !== 'todos') {
      where.canal = canal
    }
    
    if (estado && estado !== 'todos') {
      where.estado = estado
    }

    // Asignación real desde el hub (Chatwoot): mapa conversationId → assignee.
    // Si el hub no está disponible (sin token/account), todas quedan "sin
    // asignar" conocida: no romper la bandeja, solo mostrar sin filtro.
    let assigneeByConv = new Map<number, string>() // conversationId -> email agente
    let hubAvailable = false
    try {
      const [hub, channel] = await Promise.all([
        prisma.messagingHubConfig.findFirst({ where: { tenantId: auth.tenant!.id } }),
        prisma.channel.findFirst({
          where: { tenantId: auth.tenant!.id, type: 'whatsapp', isActive: true },
          select: { config: true },
        }),
      ])
      const accountId = hub?.chatwootAccountId ?? null
      const accountToken =
        (channel?.config as any)?.apiToken ||
        (hub?.hubApiToken as string) ||
        ''
      if (accountId && accountToken) {
        const { chatwootApi } = await import('@/lib/nexus/chatwoot-api')
        const result = await chatwootApi.listConversations(accountId, accountToken, {
          status: 'all',
          assigneeType: 'all',
          maxPages: 5,
        })
        if (!result.error) {
          hubAvailable = true
          for (const c of result.conversations) {
            if (c.assignee?.email) assigneeByConv.set(c.id, c.assignee.email)
          }
        }
      }
    } catch (hubErr) {
      console.warn('[Mensajes] Hub no disponible para asignación, sin filtro:', hubErr)
    }

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const [conversacionesRaw, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true,
              nombre: true,
              email: true,
              estado: true,
            },
          },
          estudiante: {
            select: {
              id: true,
              nombre: true,
              email: true,
            },
          },
          mensajes: {
            take: 1,
            orderBy: { fechaCreacion: 'desc' },
          },
        },
        orderBy: {
          fechaUltimoMensaje: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ])

    // Enriquecer cada conversación con el agente asignado (email) y clasificarla.
    let counts = { mias: 0, sin_asignar: 0, todas: total }
    const conversaciones = conversacionesRaw.map((c: any) => {
      const convId = (c.hubMetadata as any)?.chatwootConversationId
        ?? (typeof c.externalRef === 'string' && c.externalRef.startsWith('chatwoot_')
          ? Number(c.externalRef.replace('chatwoot_', ''))
          : null)
      const asignadaA = hubAvailable && convId ? (assigneeByConv.get(Number(convId)) || null) : null
      const esMia = !!asignadaA && asignadaA === userEmail
      return { ...c, asignadaA, esMia }
    })

    if (hubAvailable) {
      // Contadores reales sobre el total del tenant (sin paginar): consultar
      // todas las conversaciones locales una sola vez para clasificar bien.
      const allLocal = await prisma.conversation.findMany({
        where,
        select: { id: true, hubMetadata: true, externalRef: true },
      })
      let mias = 0
      let sinAsignar = 0
      for (const c of allLocal) {
        const convId = (c.hubMetadata as any)?.chatwootConversationId
          ?? (typeof c.externalRef === 'string' && c.externalRef.startsWith('chatwoot_')
            ? Number(c.externalRef.replace('chatwoot_', ''))
            : null)
        const asignadaA = convId ? (assigneeByConv.get(Number(convId)) || null) : null
        if (asignadaA === userEmail) mias += 1
        else if (!asignadaA) sinAsignar += 1
      }
      counts = { mias, sin_asignar: sinAsignar, todas: allLocal.length }
    }

    // Aplicar el filtro de la pestaña activa sobre la página devuelta. Si el
    // hub no está disponible (sin asignación conocida), degradar a "Todas" en
    // lugar de vaciar la bandeja.
    const filtradas = !hubAvailable
      ? conversaciones
      : tab === 'mias'
        ? conversaciones.filter((c: any) => c.esMia)
        : tab === 'sin_asignar'
          ? conversaciones.filter((c: any) => !c.asignadaA)
          : conversaciones

    return NextResponse.json({
      conversaciones: filtradas,
      counts,
      pagination: {
        total: filtradas.length,
        page,
        limit,
        totalPages: Math.ceil(filtradas.length / limit),
      },
    })
  } catch (error: any) {
    console.error('Error obteniendo conversaciones:', error)
    return NextResponse.json(
      { error: error.message || 'Error obteniendo conversaciones' },
      { status: 500 }
    )
  }
}, ['conversations:read', 'messages:read'])

// POST /api/mensajes/conversaciones - Crear nueva conversación
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json()
    const {
      contactoNombre,
      contactoEmail,
      contactoTelefono,
      canal,
      leadId,
      estudianteId,
    } = body

    if (!contactoNombre || !canal) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    const conversacion = await prisma.conversation.create({
      data: {
        tenantId,
        contactoNombre,
        contactoEmail,
        contactoTelefono,
        canal,
        leadId,
        estudianteId,
        estado: 'abierta',
      },
      include: {
        lead: true,
        estudiante: true,
      },
    })

    return NextResponse.json(conversacion)
  } catch (error: any) {
    console.error('Error creando conversación:', error)
    return NextResponse.json(
      { error: error.message || 'Error creando conversación' },
      { status: 500 }
    )
  }
}, ['conversations:write', 'messages:write'])
