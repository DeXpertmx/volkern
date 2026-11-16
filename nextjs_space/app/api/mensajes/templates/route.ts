export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { tenantIdDeSesion } from '@/lib/message-templates'

// Obtener todos los templates
export async function GET(request: NextRequest) {
  try {
    const tenantId = await tenantIdDeSesion()
    if (!tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const canal = searchParams.get('canal')
    const categoria = searchParams.get('categoria')
    const activo = searchParams.get('activo')

    // Solo las plantillas del tenant de la sesión: antes eran globales y se
    // filtraban las de cualquier cliente.
    const where: any = { tenantId }
    
    if (canal && canal !== 'todos') {
      where.canal = canal
    }
    
    if (categoria && categoria !== 'todos') {
      where.categoria = categoria
    }
    
    if (activo) {
      where.activo = activo === 'true'
    }

    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: { fechaCreacion: 'desc' },
    })

    return NextResponse.json({ templates })
  } catch (error: any) {
    console.error('Error obteniendo templates:', error)
    return NextResponse.json(
      { error: error.message || 'Error obteniendo templates' },
      { status: 500 }
    )
  }
}

// Crear nuevo template
export async function POST(request: NextRequest) {
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
      activo = true,
    } = body

    if (!nombre || !canal || !contenido) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    const template = await prisma.messageTemplate.create({
      data: {
        tenantId,
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
    console.error('Error creando template:', error)
    return NextResponse.json(
      { error: error.message || 'Error creando template' },
      { status: 500 }
    )
  }
}
