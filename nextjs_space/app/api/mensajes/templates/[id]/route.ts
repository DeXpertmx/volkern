export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { tenantIdDeSesion } from '@/lib/message-templates'

// Obtener un template específico
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const tenantId = await tenantIdDeSesion()
    if (!tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // findFirst con tenant: una plantilla de otro tenant responde 404, no 403,
    // para no revelar que existe.
    const template = await prisma.messageTemplate.findFirst({
      where: { id: params.id, tenantId },
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Template no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(template)
  } catch (error: any) {
    console.error('Error obteniendo template:', error)
    return NextResponse.json(
      { error: error.message || 'Error obteniendo template' },
      { status: 500 }
    )
  }
}

// Actualizar un template
export async function PATCH(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const tenantId = await tenantIdDeSesion()
    if (!tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      nombre,
      canal,
      asunto,
      contenido,
      variables,
      categoria,
      activo,
    } = body

    const existente = await prisma.messageTemplate.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    })
    if (!existente) {
      return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 })
    }

    const template = await prisma.messageTemplate.update({
      where: { id: params.id },
      data: {
        nombre,
        canal,
        asunto,
        contenido,
        variables,
        categoria,
        activo,
      },
    })

    return NextResponse.json(template)
  } catch (error: any) {
    console.error('Error actualizando template:', error)
    return NextResponse.json(
      { error: error.message || 'Error actualizando template' },
      { status: 500 }
    )
  }
}

// Eliminar un template
export async function DELETE(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const tenantId = await tenantIdDeSesion()
    if (!tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const borrado = await prisma.messageTemplate.deleteMany({
      where: { id: params.id, tenantId },
    })
    if (borrado.count === 0) {
      return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error eliminando template:', error)
    return NextResponse.json(
      { error: error.message || 'Error eliminando template' },
      { status: 500 }
    )
  }
}
