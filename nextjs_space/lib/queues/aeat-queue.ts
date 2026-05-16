import { Queue, Worker } from 'bullmq';
import { prisma } from '@/lib/db';
import { InvoicingService } from '@/lib/invoicing-service';
import { redis } from '@/lib/redis'; // Asumiendo que existe una instancia de redis

/**
 * Cola de Procesamiento AEAT Veri*factu
 */
export const aeatQueue = new Queue('aeat-shipment', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000, // Comienza en 5s
    },
    removeOnComplete: true,
  }
});

// Programar Health Check Diario (8:00 AM) - Resumen Completo
aeatQueue.add('daily_health_check', {}, {
  repeat: { cron: '0 8 * * *' }
});

// Programar Monitoreo Continuo (Cada 5 min) - Alertas Críticas
aeatQueue.add('continuous_monitor', {}, {
  repeat: { cron: '*/5 * * * *' }
});

// Programar Agregación de Métricas (Cada Hora)
aeatQueue.add('aggregate_metrics', {}, {
  repeat: { cron: '0 * * * *' }
});

/**
 * Worker para procesar los envíos a la AEAT y Health Checks
 */
export const aeatWorker = new Worker('aeat-shipment', async (job) => {
  const { sendTelegramMessage, loadTelegramCredentials } = await import('../telegram');
  const { AEATObservabilityService } = await import('../fiscal/aeat/observability-service');
  const { AEATAnomalyDetector } = await import('../fiscal/aeat/anomaly-detector');
  const creds = await loadTelegramCredentials();

  // Caso C: Agregación de Métricas (Cada Hora)
  if (job.name === 'aggregate_metrics') {
    const metrics = await AEATObservabilityService.getRealTimeMetrics();
    const now = new Date();
    const hourOfDay = now.getHours();

    await prisma.systemMetric.createMany({
      data: [
        { metricType: 'aeat_error_rate', value: metrics.database.error / (metrics.database.total || 1), metadata: { hourOfDay } },
        { metricType: 'queue_size', value: metrics.queue.waiting, metadata: { hourOfDay } }
      ]
    });
    return;
  }

  // Caso A: Monitoreo Continuo (Gestión de Incidentes + AIOps)
  if (job.name === 'continuous_monitor') {
    const { AEATIncidentService } = await import('../fiscal/aeat/incident-service');
    const { AEAAIOpsService } = await import('../fiscal/aeat/ai-ops-service');
    
    // 1. Ciclo de Inteligencia AIOps (Diagnóstico + Auto-healing)
    await AEAAIOpsService.runOpsCycle();

    // 2. Reportar alertas críticas como incidentes
    const alerts = await AEATObservabilityService.runHealthCheck();
    const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
    for (const alert of criticalAlerts) {
      await AEATIncidentService.reportAlert(alert);
    }

    // 3. Auto-resolver incidentes
    const activeAlertTypes = criticalAlerts.map(a => a.type);
    await AEATIncidentService.resolveIncidents(activeAlertTypes);

    return;
  }

  // Caso B: Resumen Diario (Notifica Todo + Baselines + Health Score)
  if (job.name === 'daily_health_check') {
    const metrics = await AEATObservabilityService.getRealTimeMetrics();
    const alerts = await AEATObservabilityService.runHealthCheck();
    const { AEATAnomalyDetector } = await import('../fiscal/aeat/anomaly-detector');
    
    const healthScore = await AEATObservabilityService.calculateHealthScore(metrics, alerts);
    const forecast = await AEATAnomalyDetector.forecastCapacity();
    const errorBaseline = await AEATAnomalyDetector.getBaseline('aeat_error_rate');

    if (creds.admin_chat_id) {
      let report = `📊 <b>RESUMEN FISCAL DIARIO</b>\n\n`;
      
      // Health Score con Icono
      const healthIcon = healthScore > 90 ? '🟢' : healthScore > 70 ? '🟡' : '🔴';
      report += `${healthIcon} <b>Health Score: ${healthScore}/100</b>\n\n`;

      // Métricas y Baselines
      const errorRate = (metrics.database.error / (metrics.database.total || 1) * 100).toFixed(1);
      report += `📈 Error Rate: ${errorRate}%${errorBaseline ? ` (vs ${(errorBaseline.avg * 100).toFixed(1)}%)` : ''}\n`;
      report += `📦 Cola: ${metrics.queue.waiting}\n`;
      
      if (forecast && forecast.isImminent) {
        report += `⏳ <b>FORECAST:</b> Saturación en aprox. ${forecast.hoursToSaturation.toFixed(1)}h\n`;
      }
      
      report += `\n✅ Aceptadas: ${metrics.database.accepted}\n`;
      report += `❌ Rechazadas: ${metrics.database.rejected}\n\n`;
      
      if (alerts.length > 0) {
        report += `🚨 <b>AVISOS Y ALERTAS:</b>\n`;
        alerts.forEach(a => {
          const icon = a.severity === 'CRITICAL' ? '🔥' : '⚠️';
          report += `${icon} ${a.message}\n`;
        });
      }
      await sendTelegramMessage(creds.admin_chat_id, report);
    }
    return;
  }

  const { invoiceId, tenantId } = job.data;
  // ... resto de la lógica de envío ...

  try {
    const response = await InvoicingService.shipToAEAT(tenantId, {
      invoiceId: invoice.id,
      numero: invoice.numero,
      monto: invoice.monto,
      moneda: invoice.moneda,
      fecha: invoice.fechaEmision.toISOString(),
      receptorNif: await (InvoicingService as any).getReceptorNif(invoice),
      encadenamiento: { fingerprintAnterior: invoice.parentFingerprint }
    });

    // Procesar respuesta (Simplificado)
    // En un caso real, parsearíamos el SOAP Response para extraer el CSV y el estado real
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        aeatStatus: 'ACCEPTED',
        aeatSentAt: new Date(),
        aeatResponse: { response } as any,
        fiscalStatus: 'completado'
      }
    });

  } catch (error: any) {
    console.error(`[Worker] Error enviando factura ${invoiceId}:`, error.message);
    
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        aeatStatus: 'ERROR',
        aeatErrorCount: { increment: 1 },
        aeatResponse: { error: error.message } as any
      }
    });

    throw error; // Permite que BullMQ haga el retry
  }
}, { connection: redis });
