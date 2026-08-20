export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateLimit } from '@/lib/limits'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getTriggerFromFlow } from '@/lib/automation/flow-trigger'

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

    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
      )
    }

    // La fuente de verdad del trigger es el nodo del canvas; nunca confiar en
    // el valor que envía el cliente (puede traer un estado viejo y dejar la
    // columna desincronizada, haciendo que la automatización nunca se ejecute).
    const flowFinal = flowData || { nodes: [], edges: [] }
    const triggerReal = getTriggerFromFlow(flowFinal, trigger)

    const automation = await prisma.automation.create({
      data: {
        nombre,
        descripcion,
        trigger: triggerReal,
        flowData: flowFinal,
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
