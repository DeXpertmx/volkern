export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener estadísticas de ejecución
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

    // Calcular tasa de éxito
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
}
