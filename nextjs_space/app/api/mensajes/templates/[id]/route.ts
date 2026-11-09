export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

// Obtener un template específico
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const template = await prisma.messageTemplate.findUnique({
      where: { id: params.id },
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
    const session = await getServerSession(authOptions)
    if (!session) {
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
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    await prisma.messageTemplate.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error eliminando template:', error)
    return NextResponse.json(
      { error: error.message || 'Error eliminando template' },
      { status: 500 }
    )
  }
}
