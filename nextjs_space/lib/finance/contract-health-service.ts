import { prisma } from '@/lib/db'
import { differenceInDays, subMonths, startOfMonth, endOfMonth } from 'date-fns'

export class ContractHealthService {
  /**
   * Calcula el Health Score definitivo (0-100) basado en ponderaciones estratégicas
   */
  static async calculateHealthScore(contractId: string) {
    const contract = await prisma.contrato.findUnique({
      where: { id: contractId },
      include: { 
        clientSubscription: { include: { attempts: true } },
        contact: true
      }
    })

    if (!contract) return 0

    let score = 0

    // 1. Comportamiento de Pago (40%) - El pilar de la salud financiera
    let paymentScore = 100
    if (contract.clientSubscription) {
      const recentFailures = contract.clientSubscription.attempts.filter(a => 
        a.estado === 'FAILED' && 
        differenceInDays(new Date(), new Date(a.fechaIntento)) < 90
      ).length
      paymentScore -= (recentFailures * 30)
      
      // Penalización inmediata si está en periodo de gracia
      if (contract.clientSubscription.estado === 'GRACE_PERIOD') paymentScore -= 20
      if (contract.clientSubscription.estado === 'PAUSED') paymentScore = 0
    }
    score += (Math.max(0, paymentScore) * 0.40)

    // 2. Vigencia y Tiempo (30%) - Estabilidad temporal
    let timeScore = 50
    if (contract.fechaFin) {
      const daysLeft = differenceInDays(new Date(contract.fechaFin), new Date())
      if (daysLeft > 180) timeScore = 100
      else if (daysLeft > 60) timeScore = 75
      else if (daysLeft > 0) timeScore = 20
      else timeScore = 0
    }
    score += (timeScore * 0.30)

    // 3. Suministro de Datos (20%) - Integridad operativa
    let dataScore = 100
    if (!contract.snapshotNif || !contract.snapshotDireccion) dataScore -= 40
    if (!contract.contact?.email || !contract.contact?.telefono) dataScore -= 30
    if (!contract.metodoPago) dataScore -= 30
    score += (Math.max(0, dataScore) * 0.20)

    // 4. Histórico de Relación (10%) - Fidelidad acumulada
    const ageInYears = differenceInDays(new Date(), new Date(contract.fechaCreacion)) / 365
    const historyScore = 50 + (ageInYears * 10) // +10 pts por año
    score += (Math.min(100, historyScore) * 0.10)

    return Math.round(score)
  }

  /**
   * Persiste los scores de salud en la base de datos para todos los contratos vigentes
   */
  static async updateAllHealthScores() {
    console.log('[Oráculo] Iniciando actualización diaria de Health Scores...')
    const contracts = await prisma.contrato.findMany({ 
      where: { estado: 'vigente' } 
    })

    for (const contract of contracts) {
      const score = await this.calculateHealthScore(contract.id)
      await prisma.contrato.update({
        where: { id: contract.id },
        data: { healthScore: score }
      })
    }

    // Alerta Crítica: NRR < 90%
    const metrics = await this.getExecutiveMetrics(contracts[0]?.tenantId)
    if (metrics.nrr < 90) {
      console.error(`🚨 ALERTA CRÍTICA: NRR actual (${metrics.nrr}%) por debajo del umbral del 90%.`)
      // Enviar a Telegram vía EventBus
    }

    console.log(`[Oráculo] Sincronización completa: ${contracts.length} contratos actualizados.`)
  }

  /**
   * Obtiene métricas agregadas de salud de cartera para el dashboard ejecutivo
   */
  static async getExecutiveMetrics(tenantId: string) {
    const contracts = await prisma.contrato.findMany({
      where: { tenantId, estado: 'vigente' },
      include: { clientSubscription: true }
    })

    let totalRevenueAtRisk = 0
    const riskDistribution = { high: 0, medium: 0, low: 0 }
    
    // Calcular NRR (Net Revenue Retention) simplificado
    // (Ingresos de renovaciones / Ingresos expirados)
    const nrr = 94.5 // Mock para el dashboard inicial

    contracts.forEach(c => {
      if (c.healthScore < 40) {
        riskDistribution.high++
        totalRevenueAtRisk += c.total
      } else if (c.healthScore < 70) {
        riskDistribution.medium++
      } else {
        riskDistribution.low++
      }
    })

    return {
      revenueAtRisk: totalRevenueAtRisk,
      riskDistribution,
      nrr,
      totalActive: contracts.length,
      averageHealth: contracts.length 
        ? contracts.reduce((acc, c) => acc + c.healthScore, 0) / contracts.length 
        : 0
    }
  }

  /**
   * Comparativa Year-over-Year (YoY)
   */
  static async getYoYGrowth(tenantId: string) {
    const now = new Date()
    const lastYear = subMonths(now, 12)

    const currentMonthRevenue = await prisma.contrato.aggregate({
      where: { 
        tenantId, 
        estado: 'vigente',
        fechaCreacion: { gte: startOfMonth(now), lte: endOfMonth(now) }
      },
      _sum: { total: true }
    })

    const lastYearMonthRevenue = await prisma.contrato.aggregate({
      where: { 
        tenantId, 
        estado: 'vigente',
        fechaCreacion: { gte: startOfMonth(lastYear), lte: endOfMonth(lastYear) }
      },
      _sum: { total: true }
    })

    const current = currentMonthRevenue._sum.total || 0
    const previous = lastYearMonthRevenue._sum.total || 0

    return {
      current,
      previous,
      growth: previous > 0 ? ((current - previous) / previous) * 100 : 100
    }
  }
}
