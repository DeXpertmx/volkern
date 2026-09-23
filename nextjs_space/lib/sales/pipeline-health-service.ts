import { prisma } from '@/lib/db';
import { differenceInDays, differenceInHours } from 'date-fns';

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'ZOMBIE';

/**
 * Instantáneas para calibración (dataset de C6): cada recálculo con cambios
 * deja una fila con SUS entradas y el desenlace queda a NULL hasta que el
 * deal se cierra — entonces el PATCH del deal marca la última ('ganado' /
 * 'perdido'). El historial nunca se recrea ni se re-etiqueta en bloque: el
 * snapshot ANTERIOR al cierre conserva el score de entonces, que es lo que
 * hay que comparar con el desenlace. El dedupe de 24 h evita convertir el
 * barrido diario en un dataset inflado de filas idénticas.
 */
export const SNAPSHOT_DEDUPE_HORAS = 24;

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

    // Entradas del score (para la instantánea de calibración)
    const diasSinMovimiento = Math.max(0, differenceInDays(new Date(), deal.fechaActualizacion));
    const diasSinActividad = lastActivity
      ? Math.max(0, differenceInDays(new Date(), lastActivity))
      : 0;
    const maxDiasSLA = deal.prioridad === 'urgente' ? 5 : deal.prioridad === 'alta' ? 10 : 20;
    const slaVencido = deal.diasEnPipeline > maxDiasSLA;

    // DATASET DE CALIBRACIÓN: instantánea solo si el score cambió o la última
    // es vieja (> SNAPSHOT_DEDUPE_HORAS). El desenlace queda NULL: lo pone el
    // cierre del deal (marcarDesenlaceEnSnapshots) y nunca se recrea.
    try {
      const ultima = await prisma.healthSnapshot.findFirst({
        where: { dealId },
        orderBy: { createdAt: 'desc' },
        select: { healthScore: true, createdAt: true },
      });
      const scoreCambio = !ultima || ultima.healthScore !== score;
      const suficientementeVieja =
        ultima &&
        differenceInHours(new Date(), ultima.createdAt) >= SNAPSHOT_DEDUPE_HORAS;
      if (!ultima || scoreCambio || suficientementeVieja) {
        await prisma.healthSnapshot.create({
          data: {
            tenantId: deal.tenantId,
            dealId,
            healthScore: score,
            healthStatus: status,
            diasSinMovimiento,
            diasSinActividad,
            slaVencido,
            desenlace: null,
          },
        });
      }
    } catch (err) {
      // La instantánea no puede tumbar el recálculo del score.
      console.error('[HealthService] Error guardando snapshot de calibración:', err);
    }

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
   * Al cerrar un deal (ganado/perdido): marca el DESENLACE en el snapshot
   * más reciente — el score de ese momento es el que se evalúa contra lo que
   * pasó. Los anteriores quedan como historial, sin tocar.
   */
  static async marcarDesenlaceEnSnapshots(dealId: string, desenlace: 'ganado' | 'perdido') {
    const ultimo = await prisma.healthSnapshot.findFirst({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!ultimo) return null;

    return prisma.healthSnapshot.update({
      where: { id: ultimo.id },
      data: { desenlace, fechaCierre: new Date() },
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
