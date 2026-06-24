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
    const tenantId = auth.tenant!.id

    // Estadísticas de webhooks desde audit logs
    const [totalDispatched, totalDelivered, totalFailed, recentDeliveries] = await Promise.all([
      prisma.auditLog.count({
        where: { tenantId, accion: 'WEBHOOK_DISPATCHED' } as any,
      }),
      prisma.auditLog.count({
        where: { tenantId, accion: 'WEBHOOK_DELIVERED' } as any,
      }),
      prisma.auditLog.count({
        where: { tenantId, accion: 'WEBHOOK_FAILED' } as any,
      }),
      prisma.auditLog.count({
        where: {
          tenantId,
          accion: { in: ['WEBHOOK_DISPATCHED', 'WEBHOOK_DELIVERED', 'WEBHOOK_FAILED'] },
          fechaCreacion: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        } as any,
      }),
    ])

    // Actividad reciente
    const recent = await prisma.auditLog.findMany({
      where: {
        tenantId,
        accion: { in: ['WEBHOOK_DISPATCHED', 'WEBHOOK_DELIVERED', 'WEBHOOK_FAILED'] },
      } as any,
      orderBy: { fechaCreacion: 'desc' } as any,
      take: 15,
      select: {
        id: true,
        accion: true,
        descripcion: true,
        metadata: true,
        fechaCreacion: true,
      } as any,
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
        createdAt: (r as any).fechaCreacion?.toISOString(),
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
