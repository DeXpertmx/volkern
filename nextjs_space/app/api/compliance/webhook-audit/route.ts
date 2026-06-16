import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/compliance/webhook-audit
 * Retorna estadísticas de trazabilidad de webhooks desde audit logs.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenantId

    // Estadísticas de webhooks desde audit logs
    const [totalDispatched, totalDelivered, totalFailed, recentDeliveries] = await Promise.all([
      prisma.auditLog.count({
        where: { tenantId, action: 'WEBHOOK_DISPATCHED' },
      }),
      prisma.auditLog.count({
        where: { tenantId, action: 'WEBHOOK_DELIVERED' },
      }),
      prisma.auditLog.count({
        where: { tenantId, action: 'WEBHOOK_FAILED' },
      }),
      prisma.auditLog.count({
        where: {
          tenantId,
          action: { in: ['WEBHOOK_DISPATCHED', 'WEBHOOK_DELIVERED', 'WEBHOOK_FAILED'] },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ])

    // Actividad reciente
    const recent = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: { in: ['WEBHOOK_DISPATCHED', 'WEBHOOK_DELIVERED', 'WEBHOOK_FAILED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        action: true,
        description: true,
        metadata: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      stats: {
        totalDispatched,
        totalDelivered,
        totalFailed,
        recentDeliveries,
        timestamp: new Date().toISOString(),
      },
      recent: recent.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[WebhookAudit] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error cargando datos de auditoría de webhooks',
      },
      { status: 500 }
    )
  }
})
