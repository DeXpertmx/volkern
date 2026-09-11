import cron from 'node-cron';
import { skills } from '../skills';
import { prisma } from '../db';
import {
  registerCronJob,
  cronJobStarted,
  cronJobCompleted,
  cronJobFailed,
  cronJobSkipped,
} from './cron-status';

/**
 * Orquestador de Tareas Programadas para Gemma 4 Proactivity
 * 
 * Este scheduler maneja el Radar de Ghosting y otras tareas en segundo plano.
 * Para entornos serverless, este archivo exporta la lógica que puede ser llamada
 * por un endpoint externo, pero en entornos persistentes usa node-cron.
 */

/**
 * Wrapper que instrumenta un job con métricas de estado para el panel.
 * Registra inicio, duración y resultado (success/error/skipped).
 */
function runCronJob(id: string, label: string, schedule: string, fn: () => Promise<void>) {
  registerCronJob(id, label, schedule)
  return async () => {
    const start = Date.now()
    cronJobStarted(id)
    try {
      await fn()
      const duration = Date.now() - start
      cronJobCompleted(id, `OK (${duration}ms)`, duration)
    } catch (err: any) {
      const duration = Date.now() - start
      cronJobFailed(id, err?.message || String(err), duration)
    }
  }
}

export function initCronJobs() {
  console.log('🚀 [Scheduler] Inicializando tareas programadas de Volkern CRM...');

  // 1. Morning Briefing
  cron.schedule('30 8 * * *', runCronJob('morning-briefing', 'Morning Briefing', '30 8 * * *', async () => {
    const { MorningBriefingService } = await import('../sales/morning-briefing-service');
    await MorningBriefingService.sendGlobalBriefing();
  }));

  // 2. Daily MRR
  cron.schedule('5 0 * * *', runCronJob('daily-mrr', 'Métricas SaaS diarias', '5 0 * * *', async () => {
    const { SaaSMetricsService } = await import('../saas-metrics');
    await SaaSMetricsService.recordMetrics();
  }));

  // 3. Monthly Snapshot
  cron.schedule('0 2 1 * *', runCronJob('monthly-snapshot', 'Snapshot mensual', '0 2 1 * *', async () => {
    const { SaaSMetricsService } = await import('../saas-metrics');
    await SaaSMetricsService.createSnapshot();
  }));

  // 4. Limit Alerts
  cron.schedule('0 10 * * *', runCronJob('limit-alerts', 'Alertas de límites', '0 10 * * *', async () => {
    const { checkAndNotifyLimitAlerts } = await import('../subscription');
    await checkAndNotifyLimitAlerts();
  }));

  // 5. Google Calendar Webhook Renewal
  cron.schedule('0 */12 * * *', runCronJob('calendar-renewal', 'Calendar Webhook Renewal', '0 */12 * * *', async () => {
    const { renewWebhookChannel } = await import('../google-calendar');
    const now = new Date();
    const expirationThreshold = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const integrationsToRenew = await prisma.googleCalendarIntegration.findMany({
      where: {
        activo: true,
        channelId: { not: null },
        channelExpiration: { not: null, lte: expirationThreshold },
      },
    });
    for (const integration of integrationsToRenew) {
      await renewWebhookChannel(integration.userId);
    }
  }));

  console.log('✅ [Scheduler] Morning Briefing programado (08:30 AM daily)');
  console.log('✅ [Scheduler] Métricas SaaS diarias programadas (00:05 AM)');
  console.log('✅ [Scheduler] Snapshot mensual programado (1st of month 02:00 AM)');
  console.log('✅ [Scheduler] Límites de planes programados (10:00 AM daily)');
  console.log('✅ [Scheduler] Google Calendar webhook renewal programado (cada 12h)');

  // 6. Recuperación Proactiva de Facturas
  cron.schedule('0 */4 * * *', runCronJob('invoice-recovery', 'Recuperación Proactiva Facturas', '0 */4 * * *', async () => {
    const { InboundInvoiceService } = await import('../finance/inbound-invoice-service');
    await InboundInvoiceService.runProactiveRecovery();
  }));

  // 7. Analytics Cleanup
  cron.schedule('0 3 * * 0', runCronJob('analytics-cleanup', 'Cleanup Analytics', '0 3 * * 0', async () => {
    const { cleanupOldEvents } = await import('../analytics/store');
    await cleanupOldEvents(90);
  }));

  // 8. IMAP Email Polling
  cron.schedule('*/5 * * * *', runCronJob('imap-polling', 'IMAP Polling', '*/5 * * * *', async () => {
    const { pollAllTenants } = await import('../imap/imap-engine');
    await pollAllTenants();
  }));

  // 9. Ad Schedule Evaluation
  cron.schedule('*/5 * * * *', runCronJob('ad-schedules', 'Ad Schedule Evaluation', '*/5 * * * *', async () => {
    const { evaluateSchedules } = await import('../ads/schedule-engine');
    await evaluateSchedules();
  }));

  // 10. AB Test Auto-Evaluation
  cron.schedule('*/30 * * * *', runCronJob('ab-tests', 'AB Test Evaluation', '*/30 * * * *', async () => {
    const { evaluateActiveTests } = await import('../ads/ab-test-engine');
    await evaluateActiveTests();
  }));

  // 11. Watchdog Budget
  cron.schedule('*/30 * * * *', runCronJob('budget-watchdog', 'Watchdog Presupuesto', '*/30 * * * *', async () => {
    const { BudgetWatchdog } = await import('../ads/budget-watchdog');
    const tenants = await prisma.tenant.findMany({ where: { estado: 'activo' }, select: { id: true } });
    for (const t of tenants) {
      await BudgetWatchdog.evaluateAll(t.id);
    }
  }));

  // 12. ADS Sync Campaigns
  cron.schedule('0 * * * *', runCronJob('ads-sync', 'ADS Sync Campañas', '0 * * * *', async () => {
    const { runSyncCampaigns } = await import('../ads/cron/ads-jobs');
    await runSyncCampaigns();
  }));

  // 13. ADS Full Sync
  cron.schedule('0 */6 * * *', runCronJob('ads-full-sync', 'ADS Full Sync', '0 */6 * * *', async () => {
    const { runFullSync } = await import('../ads/cron/ads-jobs');
    await runFullSync();
  }));

  // 14. Lead sin respuesta
  initLeadSinRespuestaCron();

  // 15. Tareas vencidas — aviso por Telegram al asignado
  initTaskOverdueCron();

  // 16. Hospitality: reservas con check-in en las próximas 24h (§22)
  cron.schedule('0 * * * *', runCronJob('hospitality-checkin-due', 'Hospitality Check-in Due (24h)', '0 * * * *', async () => {
    const { runHospitalityCheckinDueScan } = await import('./hospitality-checkin-due');
    await runHospitalityCheckinDueScan();
  }));

  console.log('✅ [Scheduler] Hospitality check-in due programado (cada hora)');

  // 16b. Hospitality: reconciliación diaria de reservas contra conectividad (§14).
  // Los webhooks no son la única fuente de verdad: detecta reservas faltantes,
  // modificaciones y cancelaciones no aplicadas. Conservador: nunca cancela
  // reservas internas ausentes, solo las registra como divergencia.
  cron.schedule('15 4 * * *', runCronJob('hospitality-reconcile', 'Hospitality Reconciliación (diaria)', '15 4 * * *', async () => {
    const { runHospitalityReconcileScan } = await import('./hospitality-reconcile');
    await runHospitalityReconcileScan();
  }));

  console.log('✅ [Scheduler] Hospitality reconciliación programada (diaria 04:15)');

  // 17. Automatizaciones: cerrar ejecuciones colgadas.
  // El motor crea el log en `queued` y el worker lo cierra con el resultado
  // real. Si el worker está caído, el log quedaría eternamente "en curso":
  // este job lo cierra como `failed` con la causa.
  cron.schedule('*/10 * * * *', runCronJob('automation-sweep', 'Cierre de ejecuciones colgadas (automatizaciones)', '*/10 * * * *', async () => {
    const { runAutomationSweep } = await import('./automation-sweep');
    await runAutomationSweep();
  }));

  console.log('✅ [Scheduler] Cierre de ejecuciones colgadas programado (cada 10 min)');
}

/**
 * Registra el cron de tareas vencidas. Se llama desde initCronJobs().
 */
export function initTaskOverdueCron() {
  cron.schedule('*/30 * * * *', runCronJob('task-overdue', 'Tareas Vencidas (Telegram)', '*/30 * * * *', async () => {
    const { runTaskOverdueScan } = await import('./task-overdue-jobs');
    await runTaskOverdueScan();
  }))
}

/**
 * Trigger programado `lead_sin_respuesta` — escanea leads sin actividad en
 * las últimas 24h y dispara las automatizaciones que tengan ese trigger.
 *
 * Guard contra repetidos: se registra un AuditLog (accion `lead_sin_respuesta`,
 * entidad `lead`, entidadId = lead.id) en cada disparo; si el lead ya tiene un
 * log de este tipo en las últimas 24h, se omite (auditable y trazable).
 */
export async function runLeadSinRespuestaScan(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
  console.log(`[Cron] 📭 Escaneando leads sin respuesta en ${hours}h (corte ${cutoff.toISOString()})...`)

  try {
    const { triggerAutomation } = await import('../automation-engine')

    // Leads con tenant, sin convertir, sin actividad desde el corte
    const candidates = await prisma.lead.findMany({
      where: {
        tenantId: { not: null },
        convertedToContactId: null,
        fechaUltimaActividad: { lt: cutoff },
      },
      select: {
        id: true,
        tenantId: true,
        nombre: true,
        email: true,
        fechaUltimaActividad: true,
      },
      take: 500,
    })

    let fired = 0
    let skipped = 0

    for (const lead of candidates) {
      if (!lead.tenantId) continue

      // Guard contra repetidos: ya disparado en las últimas `hours`h para este lead
      const alreadyFired = await prisma.auditLog.findFirst({
        where: {
          tenantId: lead.tenantId,
          accion: 'lead_sin_respuesta',
          entidad: 'lead',
          entidadId: lead.id,
          fechaCreacion: { gte: cutoff },
        },
        select: { id: true },
      })
      if (alreadyFired) {
        skipped++
        continue
      }

      await triggerAutomation('lead_sin_respuesta', {
        tenantId: lead.tenantId,
        leadId: lead.id,
        lead: {
          id: lead.id,
          nombre: lead.nombre,
          email: lead.email,
          fechaUltimaActividad: lead.fechaUltimaActividad?.toISOString(),
        },
        source: 'cron',
      })

      // Registrar el disparo (auditable) — también evita repetir en el siguiente ciclo
      await prisma.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          accion: 'lead_sin_respuesta',
          entidad: 'lead',
          entidadId: lead.id,
          descripcion: `Lead sin respuesta en ${hours}h disparado por cron (corte ${cutoff.toISOString()})`,
          metadata: { trigger: 'lead_sin_respuesta', horas: hours, nombre: lead.nombre },
        },
      })
      fired++
    }

    console.log(`[Cron] ✅ lead_sin_respuesta: ${fired} disparados, ${skipped} omitidos (ya cubiertos), ${candidates.length} candidatos`)
    return { total: candidates.length, fired, skipped }
  } catch (err: any) {
    console.error('[Cron] ❌ Error fatal en scan lead_sin_respuesta:', err)
    return { total: 0, fired: 0, skipped: 0, error: err?.message }
  }
}

/**
 * Registra el cron de `lead_sin_respuesta`. Se llama desde initCronJobs().
 */
export function initLeadSinRespuestaCron() {
  cron.schedule('*/30 * * * *', runCronJob('lead-sin-respuesta', 'Lead Sin Respuesta (24h)', '*/30 * * * *', async () => {
    await runLeadSinRespuestaScan(24)
  }))
}

/**
 * Lógica principal del Radar de Ghosting
 */
export async function runGhostingRadar() {
  console.log('[Cron] 📡 Iniciando Radar de Ghosting...');
  
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    let totalAlerts = 0;

    for (const tenant of tenants) {
      // Detectar leads que llevan más de 48h en silencio en etapas críticas
      const inactiveLeads = await (skills as any).detect_ghosting(tenant.id, 48);
      
      for (const lead of inactiveLeads) {
        // Crear tarea de recuperación automática vinculada al lead y tenant
        await prisma.task.create({
          data: {
            tenantId: tenant.id,
            leadId: lead.leadId,
            tipo: 'followup',
            titulo: `🚑 Ghosting Detectado: ${lead.nombre}`,
            descripcion: `Gemma 4 detectó inactividad de ${lead.horasInactivo}h. 
Sugerencia de Proactividad: El cliente parece haber dejado de responder. Revisa el historial para enviar un mensaje de rescate.`,
            fechaVencimiento: new Date(Date.now() + 1000 * 60 * 60 * 5), // Vence en 5 horas
            prioridad: 'alta',
          } as any
        });
        totalAlerts++;
      }
    }

    console.log(`[Cron] ✅ Radar completado. Se generaron ${totalAlerts} alertas de recuperación.`);
    return { success: true, alertsCreated: totalAlerts };
  } catch (err) {
    console.error('[Cron] ❌ Error fatal en Radar de Ghosting:', err);
    return { success: false, error: err };
  }
}
