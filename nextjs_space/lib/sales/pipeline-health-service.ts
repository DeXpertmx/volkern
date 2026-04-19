import { prisma } from '@/lib/db';
import { differenceInDays } from 'date-fns';

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'ZOMBIE';

export class PipelineHealthService {
  /**
   * Calcula y actualiza el Health Score de un Deal
   */
  static async updateDealHealth(dealId: string) {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        actividades: {
          orderBy: { fechaCreacion: 'desc' },
          take: 10
        }
      }
    });

    if (!deal) return null;

    let score = 100;
    
    // 1. Ponderación por Estancamiento (40%)
    const daysSinceUpdate = differenceInDays(new Date(), deal.fechaActualizacion);
    // Penalizar si lleva más de 7 días en la misma etapa sin cambios
    if (daysSinceUpdate > 7) {
      score -= Math.min(40, (daysSinceUpdate - 7) * 5);
    }

    // 2. Velocidad de Actividad (40%)
    const lastActivity = deal.fechaUltimaActividad;
    if (!lastActivity) {
      score -= 40; // Sin actividad es crítico
    } else {
      const daysSinceActivity = differenceInDays(new Date(), lastActivity);
      if (daysSinceActivity > 3) {
        score -= Math.min(40, (daysSinceActivity - 3) * 8);
      }
    }

    // 3. SLA Compliance (20%) - Basado en prioridad
    const maxDays = deal.prioridad === 'urgente' ? 5 : deal.prioridad === 'alta' ? 10 : 20;
    if (deal.diasEnPipeline > maxDays) {
      score -= 20;
    }

    // Normalizar score
    score = Math.max(0, Math.min(100, score));

    // Determinar Status
    let status: HealthStatus = 'HEALTHY';
    if (score < 30) status = 'ZOMBIE';
    else if (score < 50) status = 'CRITICAL';
    else if (score < 75) status = 'WARNING';

    // Persistir
    return await prisma.deal.update({
      where: { id: dealId },
      data: {
        healthScore: score,
        healthStatus: status,
        lastHealthUpdate: new Date()
      }
    });
  }

  /**
   * Sincronización masiva de salud del pipeline
   */
  static async syncPipelineHealth(tenantId: string) {
    const activeDeals = await prisma.deal.findMany({
      where: {
        tenantId,
        estado: 'activo'
      },
      select: { id: true, lastHealthUpdate: true }
    });

    const results = [];
    for (const deal of activeDeals) {
      // Evitar recálculos innecesarios si se actualizó hace menos de 1 hora
      if (deal.lastHealthUpdate && differenceInDays(new Date(), deal.lastHealthUpdate) === 0) {
        // Podríamos añadir una comprobación de horas aquí
      }
      
      const updated = await this.updateDealHealth(deal.id);
      results.push(updated);
    }

    return results;
  }

  /**
   * Obtiene métricas de forecast pesado y win rate
   */
  static async getExecutiveMetrics(tenantId: string) {
    const activeDeals = await prisma.deal.findMany({
      where: { tenantId, estado: 'activo' }
    });

    const wonDeals = await prisma.deal.findMany({
      where: { tenantId, estado: 'ganado' }
    });

    const lostDeals = await prisma.deal.findMany({
      where: { tenantId, estado: 'perdido' }
    });

    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId }
    });

    // 1. Forecast Pesado
    let totalValue = 0;
    let weightedValue = 0;
    activeDeals.forEach(deal => {
      const stage = stages.find(s => s.nombre === deal.etapa);
      const prob = stage ? stage.probabilidad : 25;
      totalValue += deal.valor;
      weightedValue += (deal.valor * (prob / 100));
    });

    // 2. Win Rate por Canal
    const winRateByChannel: Record<string, number> = {};
    const totalByChannel: Record<string, number> = {};
    
    [...wonDeals, ...lostDeals].forEach(deal => {
      const channel = deal.origen || 'Desconocido';
      totalByChannel[channel] = (totalByChannel[channel] || 0) + 1;
      if (deal.estado === 'ganado') {
        winRateByChannel[channel] = (winRateByChannel[channel] || 0) + 1;
      }
    });

    Object.keys(winRateByChannel).forEach(ch => {
      winRateByChannel[ch] = Math.round((winRateByChannel[ch] / totalByChannel[ch]) * 100);
    });

    return {
      totalValue,
      weightedValue,
      winRateByChannel,
      totalByChannel,
      gapAnalysis: 100000 - weightedValue // Meta estática de ejemplo: 100k
    };
  }
}
