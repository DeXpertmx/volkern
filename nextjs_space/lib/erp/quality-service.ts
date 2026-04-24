import { prisma } from '@/lib/db';

export class QualityService {
  /**
   * Obtiene los puntos de control configurados para el tenant
   */
  static async getControlPoints(tenantId: string) {
    return await (prisma as any).qualityPoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Obtiene las inspecciones recientes
   */
  static async getRecentInspections(tenantId: string, limit = 10) {
    return await (prisma as any).qualityCheck.findMany({
      where: { tenantId },
      include: {
        point: true,
        project: { select: { name: true } },
        workOrder: { select: { batchNumber: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * Obtiene las no conformidades (incidencias)
   */
  static async getNonConformities(tenantId: string) {
    return await (prisma as any).nonConformity.findMany({
      where: { tenantId },
      include: {
        project: { select: { name: true } },
        workOrder: { select: { batchNumber: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Calcula estadísticas de calidad
   */
  static async getQualityStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [inspectionsToday, openNC, totalPassed, totalFailed] = await Promise.all([
      (prisma as any).qualityCheck.count({
        where: { tenantId, createdAt: { gte: today } }
      }),
      (prisma as any).nonConformity.count({
        where: { tenantId, status: 'OPEN' }
      }),
      (prisma as any).qualityCheck.count({
        where: { tenantId, status: 'PASSED' }
      }),
      (prisma as any).qualityCheck.count({
        where: { tenantId, status: 'FAILED' }
      })
    ]);

    const total = totalPassed + totalFailed;
    const approvalRate = total > 0 ? (totalPassed / total) * 100 : 100;

    return {
      inspectionsToday,
      openNonConformities: openNC,
      approvalRate: `${approvalRate.toFixed(1)}%`,
      signedReports: totalPassed // Simulamos reportes firmados como inspecciones aprobadas
    };
  }
}
