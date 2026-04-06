export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

// GET /api/automatizaciones/templates - Listar templates
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const categoria = searchParams.get('categoria')
    const busqueda = searchParams.get('busqueda')
    const tags = searchParams.get('tags')

    // Construir filtros
    const where: any = {}
    
    if (categoria && categoria !== 'todas') {
      where.categoria = categoria
    }

    if (busqueda) {
      where.OR = [
        { nombre: { contains: busqueda, mode: 'insensitive' } },
        { descripcion: { contains: busqueda, mode: 'insensitive' } },
      ]
    }

    if (tags) {
      const tagArray = tags.split(',')
      where.tags = {
        hasSome: tagArray
      }
    }

    const templates = await prisma.automationTemplate.findMany({
      where,
      orderBy: [
        { popularidad: 'desc' },
        { fechaCreacion: 'desc' }
      ]
    })

    return NextResponse.json(templates)
  } catch (error) {
    console.error('Error al obtener templates:', error)
    return NextResponse.json(
      { error: 'Error al obtener templates' },
      { status: 500 }
    )
  }
}

// POST /api/automatizaciones/templates - Crear automatización desde template
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { templateId, nombre, personalizar } = body

    // Obtener el template
    const template = await prisma.automationTemplate.findUnique({
      where: { id: templateId }
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Template no encontrado' },
        { status: 404 }
      )
    }

    // Crear automatización desde el template
    const automation = await prisma.automation.create({
      data: {
        nombre: nombre || template.nombre,
        descripcion: template.descripcion,
        trigger: template.trigger,
        flowData: template.flowData as any,
        activo: false, // Desactivada por defecto hasta que el usuario la revise
      }
    })

    // Incrementar popularidad del template
    await prisma.automationTemplate.update({
      where: { id: templateId },
      data: {
        popularidad: {
          increment: 1
        }
      }
    })

    return NextResponse.json(automation)
  } catch (error) {
    console.error('Error al crear automatización desde template:', error)
    return NextResponse.json(
      { error: 'Error al crear automatización' },
      { status: 500 }
    )
  }
}
