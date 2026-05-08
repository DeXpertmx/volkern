export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/mensajes/conversaciones/[id] - Obtener una conversación específica con sus mensajes
export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;

    // El proxy redirige a la DB física del tenant.
    // Buscamos explícitamente por tenantId para doble seguridad.
    const conversacion = await prisma.conversation.findFirst({
      where: { 
        id: params.id,
        tenantId: tenantId
      },
      include: {
        lead: {
          include: {
            perfilFiscal: true
          }
        },
        estudiante: true,
        mensajes: {
          orderBy: { fechaCreacion: 'asc' },
        },
      },
    })

    if (!conversacion) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 }
      )
    }

    // Marcar mensajes como leídos
    await prisma.conversation.update({
      where: { id: params.id },
      data: { noLeidos: 0 },
    })

    return NextResponse.json(conversacion)
  } catch (error: any) {
    console.error('Error obteniendo conversación:', error)
    return NextResponse.json(
      { error: error.message || 'Error obteniendo conversación' },
      { status: 500 }
    )
  }
}, ['conversations:read', 'messages:read'])

// PATCH /api/mensajes/conversaciones/[id] - Actualizar una conversación
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json()
    const { estado, leadId, estudianteId } = body

    // Verificamos propiedad antes de editar
    const existing = await prisma.conversation.findFirst({
      where: { id: params.id, tenantId: tenantId }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }

    const conversacion = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        estado,
        leadId,
        estudianteId,
      },
      include: {
        lead: true,
        estudiante: true,
      },
    })

    return NextResponse.json(conversacion)
  } catch (error: any) {
    console.error('Error actualizando conversación:', error)
    return NextResponse.json(
      { error: error.message || 'Error actualizando conversación' },
      { status: 500 }
    )
  }
}, ['conversations:write', 'messages:write'])

// Eliminar una conversación
export const DELETE = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;

    const existing = await prisma.conversation.findFirst({
      where: { id: params.id, tenantId: tenantId }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }

    await prisma.conversation.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error eliminando conversación:', error)
    return NextResponse.json(
      { error: error.message || 'Error eliminando conversación' },
      { status: 500 }
    )
  }
}, ['conversations:delete'])
