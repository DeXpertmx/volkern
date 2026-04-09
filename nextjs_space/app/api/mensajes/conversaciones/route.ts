export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/mensajes/conversaciones - Obtener todas las conversaciones del tenant
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const canal = searchParams.get('canal')
    const estado = searchParams.get('estado')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: any = {
      tenantId: auth.tenant!.id
    }
    
    if (canal && canal !== 'todos') {
      where.canal = canal
    }
    
    if (estado && estado !== 'todos') {
      where.estado = estado
    }

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const [conversaciones, total] = await Promise.all([
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

    return NextResponse.json({
      conversaciones,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
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
