import { prisma } from '@/lib/db';

/**
 * Motor de Detección de Anomalías basado en Ventana Móvil (Baselines)
 */
export class AEATAnomalyDetector {
  
  /**
   * Calcula el baseline (promedio y desviación estándar) de una métrica
   */
  static async getBaseline(metricType: string, tenantId?: string, windowHours = 168) { // 1 semana por defecto
    const startTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    const historicalData = await prisma.systemMetric.findMany({
      where: {
        metricType,
        tenantId: tenantId || null,
        timestamp: { gte: startTime }
      },
      select: { value: true }
    });

    if (historicalData.length < 20) {
      return null; // No hay suficientes datos para un baseline fiable
    }

    const values = historicalData.map(d => d.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / values.length
    );

    return { avg, stdDev, count: values.length };
  }

  /**
   * Evalúa si un valor es anómalo según el baseline
   */
  static evaluate(value: number, baseline: { avg: number, stdDev: number } | null, thresholds: { warning: number, critical: number }) {
    if (!baseline) {
      // Fallback a umbrales fijos durante el Warmup
      if (value > thresholds.critical) return 'CRITICAL';
      if (value > thresholds.warning) return 'WARNING';
      return 'OK';
    }

  /**
   * Calcula el drift (desviación entre baseline corto y largo)
   */
  static async detectDrift(metricType: string, tenantId?: string) {
    const shortBaseline = await this.getBaseline(metricType, tenantId, 24); // 1 día
    const longBaseline = await this.getBaseline(metricType, tenantId, 168); // 1 semana

    if (!shortBaseline || !longBaseline) return null;

    const drift = (shortBaseline.avg - longBaseline.avg) / (longBaseline.avg || 1);
    
    return {
      drift,
      severity: Math.abs(drift) > 0.5 ? 'WARNING' : 'OK', // 50% de cambio es sospechoso
      shortAvg: shortBaseline.avg,
      longAvg: longBaseline.avg
    };
  }

  /**
   * Evalúa la tendencia (Slope) en la última hora
   */
  static async calculateTrend(metricType: string, tenantId?: string) {
    const startTime = new Date(Date.now() - 4 * 60 * 60 * 1000); // Últimas 4 horas
    const data = await prisma.systemMetric.findMany({
      where: { metricType, tenantId: tenantId || null, timestamp: { gte: startTime } },
      orderBy: { timestamp: 'asc' }
    });

    if (data.length < 3) return 0;

    // Cálculo de pendiente simple (Slope)
    const first = data[0].value;
    const last = data[data.length - 1].value;
    return (last - first) / data.length;
  }

  /**
   * Predice el tiempo restante hasta la saturación de la cola (Forecasting)
   */
  static async forecastCapacity() {
    const currentQueue = await aeatQueue.getWaitingCount();
    const trend = await this.calculateTrend('queue_size');

    if (trend <= 0) return null; // No hay crecimiento

    const remainingToCritical = 100 - currentQueue; // 100 es el umbral crítico
    const hoursToSaturation = remainingToCritical / trend;

    return {
      hoursToSaturation,
      isImminent: hoursToSaturation < 4
    };
  }
}
