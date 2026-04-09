export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id

    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
    })

    if (!automation) {
      return NextResponse.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    const [
      totalExecutions,
      completedExecutions,
      errorExecutions,
      pausedExecutions,
      recentExecutions
    ] = await Promise.all([
      prisma.automationExecution.count({
        where: { automationId: params.id }
      }),
      prisma.automationExecution.count({
        where: { automationId: params.id, estado: 'completado' }
      }),
      prisma.automationExecution.count({
        where: { automationId: params.id, estado: 'error' }
      }),
      prisma.automationExecution.count({
        where: { automationId: params.id, estado: 'pausado' }
      }),
      prisma.automationExecution.findMany({
        where: { automationId: params.id },
        orderBy: { fechaInicio: 'desc' },
        take: 10,
        select: {
          id: true,
          estado: true,
          fechaInicio: true,
          fechaFin: true,
          errorMessage: true
        }
      })
    ])

    const successRate = totalExecutions > 0 
      ? ((completedExecutions / totalExecutions) * 100).toFixed(2)
      : '0'

    return NextResponse.json({
      totalExecutions,
      completedExecutions,
      errorExecutions,
      pausedExecutions,
      successRate: parseFloat(successRate),
      recentExecutions
    })
  } catch (error) {
    console.error('Error al obtener estadísticas:', error)
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 }
    )
  }
}, ['automations:read'])
