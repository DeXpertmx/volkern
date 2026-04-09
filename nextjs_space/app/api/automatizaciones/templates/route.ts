export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const categoria = searchParams.get('categoria')
    const busqueda = searchParams.get('busqueda')
    const tags = searchParams.get('tags')

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
}, ['automations:read'])

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const body = await request.json()
    const { templateId, nombre, personalizar } = body

    const template = await prisma.automationTemplate.findUnique({
      where: { id: templateId }
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Template no encontrado' },
        { status: 404 }
      )
    }

    const automation = await prisma.automation.create({
      data: {
        nombre: nombre || template.nombre,
        descripcion: template.descripcion,
        trigger: template.trigger,
        flowData: template.flowData as any,
        activo: false,
        tenantId,
      }
    })

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
}, ['automations:write'])
