import { prisma } from '@/lib/db';
import { aeatQueue } from '@/lib/queues/aeat-queue';

/**
 * Servicio de Observabilidad y Alertas para Veri*factu
 */
export class AEATObservabilityService {
  static CONSTANTS = {
    CERT_CRITICAL_DAYS: 7,
    CERT_WARNING_DAYS: 30,
    ERROR_RATE_WARNING: 0.05,
    ERROR_RATE_CRITICAL: 0.1,
    QUEUE_WARNING: 50,
    QUEUE_CRITICAL: 100,
    MIN_REQUESTS_WARNING: 10,
    JOB_AGE_CRITICAL_MS: 30 * 60 * 1000,
    JOB_AGE_WARNING_MS: 15 * 60 * 1000,
  };

  /**
   * Obtiene métricas en tiempo real para el Dashboard de Auditoría
   */
  static async getRealTimeMetrics() {
    const [counts, queueMetrics] = await Promise.all([
      prisma.invoice.groupBy({
        by: ['aeatStatus'],
        _count: true,
        where: { verifactuVersion: '2' as any }
      }),
      aeatQueue.getJobCounts('waiting', 'active', 'failed', 'delayed')
    ]);

    const stats = counts.reduce((acc: any, curr) => {
      acc[curr.aeatStatus || 'UNKNOWN'] = curr._count;
      return acc;
    }, {});

    return {
      database: {
        total: Object.values(stats).reduce((a: any, b: any) => a + b, 0),
        accepted: stats['ACCEPTED'] || 0,
        rejected: stats['REJECTED'] || 0,
        pending: stats['PENDING'] || 0,
        error: stats['ERROR'] || 0
      },
      queue: queueMetrics
    };
  }

  /**
   * Calcula un Health Score Unificado (0-100)
   */
  static async calculateHealthScore(metrics: any, alerts: any[]) {
    let score = 100;

    // Penalizaciones por Alertas
    for (const alert of alerts) {
      if (alert.severity === 'CRITICAL') score -= 25;
      if (alert.severity === 'WARNING') score -= 10;
    }

    // Penalización por errores (Escalado)
    const errorRate = metrics.database.error / (metrics.database.total || 1);
    if (errorRate > 0.1) score -= 15;
    if (errorRate > 0.05) score -= 5;

    // Penalización por demora en cola
    if (metrics.queue.oldestAgeMs > this.CONSTANTS.JOB_AGE_CRITICAL_MS) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Escaneo proactivo para detectar riesgos (Certificados, Fallos críticos)
   */
  static async runHealthCheck() {
    // ... (rest of the logic)
    const alerts: Array<{ type: string, severity: 'CRITICAL' | 'WARNING' | 'INFO', message: string, tenantId?: string }> = [];
    const now = new Date();
    
    // 1. Certificados (Capa Adaptativa)
    const emisores = await prisma.configuracionFiscalEmisor.findMany({
      where: { verifactuEnabled: true },
      select: { tenantId: true, razonSocial: true, certExpiresAt: true }
    });

    for (const emisor of emisores) {
      if (!emisor.certExpiresAt) continue;
      
      const diffDays = Math.ceil((emisor.certExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        alerts.push({ type: 'CERT_EXPIRED', severity: 'CRITICAL', message: `¡CRÍTICO! El certificado de ${emisor.razonSocial} ha caducado.` });
      } else if (diffDays <= this.CONSTANTS.CERT_CRITICAL_DAYS) {
        alerts.push({ type: 'CERT_CRITICAL', severity: 'CRITICAL', message: `¡EXTREMA URGENCIA! El certificado de ${emisor.razonSocial} vence en ${diffDays} días.` });
      } else if (diffDays <= this.CONSTANTS.CERT_WARNING_DAYS) {
        alerts.push({ type: 'CERT_WARNING', severity: 'WARNING', message: `Aviso: El certificado de ${emisor.razonSocial} vence en ${diffDays} días.` });
      }
    }

    // 2. Anomalías AEAT (Capa Inteligente con Baselines)
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
    const [recentSent, recentErrors] = await Promise.all([
      prisma.invoice.count({ where: { aeatSentAt: { gte: windowStart } } }),
      prisma.invoice.count({ where: { aeatStatus: 'ERROR', aeatSentAt: { gte: windowStart } } })
    ]);

    const errorRate = recentSent > 0 ? (recentErrors / recentSent) : 0;
    const { AEATAnomalyDetector } = await import('./anomaly-detector');
    const errorBaseline = await AEATAnomalyDetector.getBaseline('aeat_error_rate');
    
    const errorSeverity = AEATAnomalyDetector.evaluate(errorRate, errorBaseline, {
      warning: this.CONSTANTS.ERROR_RATE_WARNING,
      critical: this.CONSTANTS.ERROR_RATE_CRITICAL
    });      if (errorSeverity !== 'OK' && recentSent >= this.CONSTANTS.MIN_REQUESTS_WARNING as any) {
      alerts.push({ 
        type: `HIGH_ERROR_${errorSeverity}`, 
        severity: errorSeverity, 
        message: `Tasa de error ${(errorRate * 100).toFixed(1)}% detectada como ${errorSeverity === 'CRITICAL' ? 'ANOMALÍA CRÍTICA' : 'DESVIACIÓN'}.` 
      });
    }

    // 3. Estado de la Cola (Volumen + Baseline)
    const [waitingJobs, oldestJob] = await Promise.all([
      aeatQueue.getWaitingCount(),
      aeatQueue.getJobs(['waiting'], 0, 0, true)
    ]);

    const queueBaseline = await AEATAnomalyDetector.getBaseline('queue_size');
    const queueSeverity = AEATAnomalyDetector.evaluate(waitingJobs, queueBaseline, {
      warning: this.CONSTANTS.QUEUE_WARNING,
      critical: this.CONSTANTS.QUEUE_CRITICAL
    });

    if (queueSeverity !== 'OK') {
      alerts.push({ 
        type: `QUEUE_${queueSeverity}`, 
        severity: queueSeverity, 
        message: `Cola de ${waitingJobs} facturas detectada como ${queueSeverity === 'CRITICAL' ? 'SATURACIÓN ANÓMALA' : 'AVISO POR VOLUMEN'}.` 
      });
    }

    // Evaluación por Edad (Indicador de salud real - Fijo por ahora ya que es el Gold Standard)
    if (oldestJob && oldestJob.length > 0) {
      const ageMs = now.getTime() - oldestJob[0].timestamp;
      if (ageMs > this.CONSTANTS.JOB_AGE_CRITICAL_MS) {
        alerts.push({ type: 'JOB_AGE_CRITICAL', severity: 'CRITICAL', message: `¡ATASCO! La factura más antigua lleva ${(ageMs / 60000).toFixed(1)} min esperando.` });
      } else if (ageMs > this.CONSTANTS.JOB_AGE_WARNING_MS) {
        alerts.push({ type: 'JOB_AGE_WARNING', severity: 'WARNING', message: `Demora en procesamiento: ${(ageMs / 60000).toFixed(1)} min.` });
      }
    }

    // 4. Trend Detection (Detección de Degradación Silenciosa)
    const errorTrend = await AEATAnomalyDetector.calculateTrend('aeat_error_rate');
    if (errorTrend > 0.05) { // Pendiente positiva significativa
      alerts.push({ 
        type: 'TREND_DEGRADATION', 
        severity: 'WARNING', 
        message: `Aviso: Se detecta una tendencia de crecimiento constante en la tasa de error.` 
      });
    }

    // 5. Drift Analysis (Baselines Duales: Corto vs Largo)
    const errorDrift = await AEATAnomalyDetector.detectDrift('aeat_error_rate');
    if (errorDrift && errorDrift.severity === 'WARNING') {
      alerts.push({ 
        type: 'BASELINE_DRIFT', 
        severity: 'WARNING', 
        message: `Desviación estructural: La tasa de error actual es un ${(errorDrift.drift * 100).toFixed(1)}% superior al promedio histórico de la semana.` 
      });
    }

    // 6. Root Cause Engine (Correlación de Métricas)
    let rootCause = null;
    if (errorSeverity === 'CRITICAL' && queueSeverity === 'CRITICAL') {
      rootCause = 'AEAT_OUTAGE_OR_LATENCY_SPIKE';
    } else if (queueSeverity === 'CRITICAL' && errorSeverity === 'OK') {
      rootCause = 'WORKER_BOTTLENECK_OR_HIGH_LOAD';
    } else if (errorSeverity === 'CRITICAL' && queueSeverity === 'OK') {
      rootCause = 'CERTIFICATE_OR_DATA_INTEGRITY_ISSUE';
    }

    if (rootCause) {
      alerts.push({ 
        type: 'ROOT_CAUSE_DIAGNOSIS', 
        severity: 'CRITICAL', 
        message: `Diagnóstico de Causa Raíz: ${rootCause}` 
      });
    }

    return alerts;
  }
}
