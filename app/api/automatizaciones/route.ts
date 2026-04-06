export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateLimit } from '@/lib/limits'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/automatizaciones - Obtener todas las automatizaciones del tenant
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // El proxy redirige automáticamente a la DB física del tenant
    const automations = await prisma.automation.findMany({
      where: {
        tenantId: tenantId
      },
      orderBy: {
        fechaActualizacion: 'desc'
      }
    })

    return NextResponse.json(automations)
  } catch (error) {
    console.error('Error al obtener automatizaciones:', error)
    return NextResponse.json(
      { error: 'Error al obtener automatizaciones' },
      { status: 500 }
    )
  }
}, ['automations:read'])

// POST /api/automatizaciones - Crear una nueva automatización
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // Validar límite de automatizaciones (consulta tanto global como local)
    const limitCheck = await validateLimit(tenantId, 'automations');
    if (!limitCheck.allowed) {
      return NextResponse.json(limitCheck.error, { status: limitCheck.error.status });
    }

    const body = await request.json()
    const { nombre, descripcion, trigger, flowData } = body

    if (!nombre || !trigger) {
      return NextResponse.json(
        { error: 'Nombre y trigger son requeridos' },
        { status: 400 }
      )
    }

    const automation = await prisma.automation.create({
      data: {
        nombre,
        descripcion,
        trigger,
        flowData: flowData || { nodes: [], edges: [] },
        activo: false,
        tenantId: tenantId
      }
    })

    return NextResponse.json(automation, { status: 201 })
  } catch (error) {
    console.error('Error al crear automatización:', error)
    return NextResponse.json(
      { error: 'Error al crear automatización' },
      { status: 500 }
    )
  }
}, ['automations:write'])
