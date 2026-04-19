import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ContractHealthService } from '@/lib/finance/contract-health-service'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
    }

    // 1. Obtener Métricas Ejecutivas (Fase Final)
    const executiveMetrics = await ContractHealthService.getExecutiveMetrics(tenantId)

    // 2. Obtener Crecimiento YoY
    const growthMetrics = await ContractHealthService.getYoYGrowth(tenantId)

    // 3. Obtener Proyección de Expiraciones (Próximos 60 días)
    const expiringSoon = await prisma.contrato.findMany({
      where: {
        tenantId,
        estado: 'vigente',
        fechaFin: {
          gte: new Date(),
          lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        id: true,
        titulo: true,
        total: true,
        fechaFin: true,
        contact: { select: { nombre: true } }
      }
    })

    // Calcular health score individual para expiraciones
    const expiringWithHealth = await Promise.all(expiringSoon.map(async (c) => ({
      ...c,
      healthScore: await ContractHealthService.calculateHealthScore(c.id)
    })))

    return NextResponse.json({
      executive: executiveMetrics,
      growth: growthMetrics,
      expiring: expiringWithHealth,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('[AnalyticsAPI] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
