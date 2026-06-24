import { prisma } from '@/lib/db'
import { Decimal } from 'decimal.js'

export class StrategyPredictor {
  /**
   * Genera proyecciones de Cashflow a 30, 60 y 90 días
   */
  static async predictCashflow(tenantId: string) {
    // 1. Obtener facturas pendientes (Entradas)
    const pendingInvoices = await prisma.invoice.findMany({
      where: { tenantId, status: 'OPEN' } as any,
      select: { total: true, dueDate: true } as any
    })

    // 2. Obtener gastos proyectados y nóminas (Salidas)
    // Simulado para este bloque
    const averagePayroll = new Decimal(50000) 
    
    const now = new Date()
    const projection = [30, 60, 90].map(days => {
      const limitDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
      
      const expectedInflow = pendingInvoices
        .filter(inv => new Date((inv as any).dueDate) <= limitDate)
        .reduce((acc, inv) => acc.plus(new Decimal((inv as any).total.toString())), new Decimal(0))
      
      const expectedOutflow = averagePayroll.mul(Math.ceil(days / 30))
      
      return {
        days,
        inflow: expectedInflow,
        outflow: expectedOutflow,
        balance: expectedInflow.minus(expectedOutflow),
        riskLevel: expectedInflow.lt(expectedOutflow) ? 'HIGH' : 'LOW'
      }
    })

    return projection
  }

  /**
   * Detecta anomalías predictivas en margen y ventas
   */
  static async detectAnomalies(tenantId: string) {
    const alerts = []
    
    // Simulación de detección: Si el margen proyectado cae por debajo del umbral
    const thresholds = await prisma.strategicThreshold.findMany({
      where: { tenantId, isActive: true }
    })

    for (const threshold of thresholds) {
      if (threshold.metric === 'MARGIN') {
        // Lógica de comparación
        alerts.push({
          metric: 'MARGIN',
          message: 'Se proyecta una caída de margen del 5% para el próximo trimestre.',
          severity: 'CRITICAL'
        })
      }
    }

    return alerts
  }
}
