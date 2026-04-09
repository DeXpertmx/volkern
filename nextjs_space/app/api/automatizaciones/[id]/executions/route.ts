export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
    })

    if (!automation) {
      return NextResponse.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    const executions = await prisma.automationExecution.findMany({
      where: { automationId: params.id },
      include: {
        logs: {
          orderBy: {
            fechaCreacion: 'asc'
          }
        }
      },
      orderBy: {
        fechaInicio: 'desc'
      },
      take: limit,
      skip: offset
    })

    const total = await prisma.automationExecution.count({
      where: { automationId: params.id }
    })

    return NextResponse.json({
      executions,
      total,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error al obtener ejecuciones:', error)
    return NextResponse.json(
      { error: 'Error al obtener ejecuciones' },
      { status: 500 }
    )
  }
}, ['automations:read'])
