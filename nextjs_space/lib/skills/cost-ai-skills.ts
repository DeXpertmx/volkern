import { prisma } from '@/lib/db';

/**
 * SKILL: analyze_production_profitability
 * Detecta causas de baja rentabilidad en órdenes de producción
 */
export async function analyze_production_profitability({ tenantId }: { tenantId: string }) {
  const lowMarginRows = await (prisma as any).erp_production_costing.findMany({
    where: { 
      tenantId,
      margin: { lt: 20 } // Menos del 20% de margen
    },
    include: {
      erp_work_orders: {
        include: {
          bom: { include: { catalogoItem: true } },
          erp_industrial_assets: true
        }
      }
    },
    orderBy: { margin: 'asc' },
    take: 5
  });

  const lowMarginOrders = lowMarginRows;

  if (lowMarginOrders.length === 0) {
    return { status: 'OPTIMAL', message: 'Todas las órdenes recientes mantienen márgenes saludables (>20%).' };
  }

  const analysis = lowMarginOrders.map((order: any) => {
    let rootCause = 'Varianza de costo general';
    if (order.scrapCost > (order.totalCost * 0.1)) rootCause = 'Exceso de merma detectado por VISION-LOCK';
    if (order.laborCost > (order.estimatedCost * 0.5)) rootCause = 'Desviación significativa en tiempo de mano de obra';

    return {
      orderId: order.workOrderId,
      product: order.erp_work_orders.bom.catalogoItem?.nombre,
      margin: `${order.margin.toFixed(2)}%`,
      variance: `${order.variance.toFixed(2)}€`,
      rootCause,
      recommendation: rootCause.includes('merma') 
        ? 'Revisar calibración de máquina y calidad de insumos.' 
        : 'Optimizar turnos o revisar estándares de tiempo en BoM.'
    };
  });

  return {
    status: 'ATTENTION_REQUIRED',
    analysis,
    summary: `Se han detectado ${lowMarginOrders.length} órdenes con rentabilidad comprometida. El impacto total de la varianza es de ${lowMarginOrders.reduce((acc: number, o: any) => acc + o.variance, 0).toFixed(2)}€.`
  };
}
