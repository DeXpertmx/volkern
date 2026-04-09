export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST - Crear una nueva interacción para un lead
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const userId = (session.user as any).id as string
    const tenantId = (session.user as any).tenantId as string

    const body = await request.json()
    const { leadId, tipo, titulo, descripcion, metadata, resultado } = body

    if (!leadId || !tipo) {
      return NextResponse.json(
        { error: 'leadId y tipo son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que el lead pertenece al tenant
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId }
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    // Construir el contenido de la interacción
    const contenido = titulo 
      ? `${titulo}${descripcion ? `\n\n${descripcion}` : ''}`
      : descripcion || ''

    // Crear la interacción
    const interaccion = await prisma.interaction.create({
      data: {
        leadId,
        tipo,
        contenido,
        resultado: resultado || null,
        creadoPor: userId,
        metadatos: metadata || null
      }
    })

    // Actualizar fecha de última actividad del lead
    await prisma.lead.update({
      where: { id: leadId },
      data: { fechaUltimaActividad: new Date() }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: 'CREATE',
        entidad: 'Interaction',
        entidadId: interaccion.id,
        descripcion: `Interacción de tipo "${tipo}" registrada para lead ${lead.nombre}`,
        cambiosDespues: JSON.stringify({
          tipo,
          contenido: contenido.substring(0, 200)
        })
      }
    })

    return NextResponse.json({
      success: true,
      interaccion
    })

  } catch (error) {
    console.error('Error creating interaction:', error)
    return NextResponse.json(
      { error: 'Error al crear interacción' },
      { status: 500 }
    )
  }
}

// GET - Obtener interacciones de un lead
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const tenantId = (session.user as any).tenantId as string
    const { searchParams } = new URL(request.url)
    const leadId = searchParams.get('leadId')

    if (!leadId) {
      return NextResponse.json(
        { error: 'leadId es requerido' },
        { status: 400 }
      )
    }

    // Verificar que el lead pertenece al tenant
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId }
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    const interacciones = await prisma.interaction.findMany({
      where: { leadId },
      include: {
        creador: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { fechaCreacion: 'desc' }
    })

    return NextResponse.json(interacciones)

  } catch (error) {
    console.error('Error fetching interactions:', error)
    return NextResponse.json(
      { error: 'Error al obtener interacciones' },
      { status: 500 }
    )
  }
}
