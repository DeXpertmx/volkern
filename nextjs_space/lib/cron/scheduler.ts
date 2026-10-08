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
import {
  JOB_ID_HEALTH_CHECK,
  JOB_LABEL_HEALTH_CHECK,
  JOB_SCHEDULE_HEALTH_CHECK,
} from './hospitality-connectivity-health';
import {
  JOB_ID_PUESTA_EN_MARCHA_AVISOS,
  JOB_LABEL_PUESTA_EN_MARCHA_AVISOS,
  JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS,
} from './hospitality-puesta-en-marcha-avisos';

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
/**
 * Lo que un job puede devolver para contarlo en el panel de estado.
 *
 * Opcional: la mayoría de los jobs no devuelven nada y el panel sigue mostrando
 * `OK (150ms)`. Existe para los que tienen algo que decir SIN ser un error —por
 * ejemplo el registro de viajeros, que avisa de los partes que ya no se van a
 * reintentar—, porque el mensaje de un error se pinta en rojo y un aviso no.
 */
interface SalidaDeJob {
  mensaje?: string
  avisos?: string[]
}

function runCronJob(
  id: string,
  label: string,
  schedule: string,
  fn: () => Promise<SalidaDeJob | void>,
) {
  registerCronJob(id, label, schedule)
  return async () => {
    const start = Date.now()
    cronJobStarted(id)
    try {
      const salida = await fn()
      const duration = Date.now() - start
      cronJobCompleted(id, salida?.mensaje ?? `OK (${duration}ms)`, duration, salida?.avisos ?? [])
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

  // 16c. Hospitality: solicitud de reseña post-salida (§21).
  //     24h después del check-out, con ventana de recuperación de 72h; guard
  //     por reserva para no pedir dos veces la misma reseña.
  cron.schedule('30 10 * * *', runCronJob('hospitality-review-request', 'Hospitality Solicitud de Reseña', '30 10 * * *', async () => {
    const { runHospitalityReviewRequestScan } = await import('./hospitality-review-request');
    await runHospitalityReviewRequestScan(24, 72);
  }));

  console.log('✅ [Scheduler] Hospitality solicitud de reseña programada (diaria 10:30)');

  // 16d. Hospitality: recordatorio de los vínculos de conectividad que el
  //      sistema creó solo (webhook) y nadie ha confirmado. Un vínculo
  //      automático cambia la configuración de canales sin que nadie lo pida:
  //      su aviso puntual se pierde si el operador no está. El resumen respeta
  //      un intervalo mínimo y solo se adelanta si aparecen vínculos nuevos.
  cron.schedule('45 9 * * *', runCronJob('hospitality-vinculos-pendientes', 'Hospitality Vínculos Automáticos por Revisar', '45 9 * * *', async () => {
    const { runHospitalityVinculosPendientesScan } = await import('./hospitality-vinculos-pendientes');
    await runHospitalityVinculosPendientesScan();
  }));

  console.log('✅ [Scheduler] Hospitality recordatorio de vínculos automáticos programado (diaria 09:45)');

  // 16h. Hospitality: aviso al operador por cuentas con la puesta en marcha
  //      parada. El listado del panel ya dice quién está a medias, pero hay que
  //      abrirlo; esto lo saca por email (Resend/Apprise) para que un alta
  //      olvidada no espere a que alguien entre a mirar. Los días se cuentan
  //      desde la última señal de Hospitality, no desde el alta del cliente, y
  //      cada cuenta tiene su intervalo: no repite el mismo aviso a diario.
  // El id/etiqueta/cadencia deben coincidir con las constantes del módulo
  // (`JOB_ID_PUESTA_EN_MARCHA_AVISOS` etc.): hay un test que lo exige, porque el
  // panel de estado cruza los dos registros.
  cron.schedule(JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS, runCronJob(JOB_ID_PUESTA_EN_MARCHA_AVISOS, JOB_LABEL_PUESTA_EN_MARCHA_AVISOS, JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS, async () => {
    const { runHospitalityPuestaEnMarchaAvisosScan } = await import(
      './hospitality-puesta-en-marcha-avisos'
    );
    const resultado = await runHospitalityPuestaEnMarchaAvisosScan();
    // El mismo resumen y los mismos avisos que el disparo por HTTP: el panel de
    // estado no puede contar una cosa u otra según quién haya lanzado el job.
    return { mensaje: resultado.message, avisos: resultado.avisos };
  }));

  console.log('✅ [Scheduler] Hospitality aviso de puestas en marcha paradas programado (diaria 09:20)');

  // 16e. Hospitality: caducidad de holds `pending` olvidados.
  //      Una reserva pendiente bloquea la unidad en todas las vistas; si nadie
  //      la confirma, este barrido la cancela al cumplir la ventana de su
  //      propiedad (`holdHoras`, 0 = sin caducidad), libera la unidad y la
  //      vuelve a publicar a los canales. Nunca toca un hold con pagos
  //      registrados (eso lo decide una persona).
  // El id/etiqueta/cadencia deben coincidir con las constantes del módulo
  // (`JOB_ID_HOLDS_CADUCADOS` etc.): hay un test que lo exige, porque el panel
  // de estado cruza los dos registros.
  cron.schedule('0 * * * *', runCronJob('hospitality-holds-expirados', 'Hospitality Holds Caducados', '0 * * * *', async () => {
    const { runHospitalityHoldExpiryScan } = await import('./hospitality-holds');
    await runHospitalityHoldExpiryScan();
  }));

  console.log('✅ [Scheduler] Hospitality caducidad de holds programada (cada hora)');

  // 16f. Hospitality: registro de viajeros ante el Ministerio del Interior.
  //      El RD 933/2021 (art. 6) obliga a comunicar los viajeros en un plazo
  //      máximo de 24 h desde el inicio del servicio: este barrido envía los
  //      partes pendientes, consulta los lotes (el alta es asíncrona) y anula
  //      los de reservas canceladas. Sin credenciales del tenant no envía nada.
  // El id/etiqueta/cadencia deben coincidir con las constantes del módulo
  // (`JOB_ID_REGISTRO_VIAJEROS` etc.): hay un test que lo exige, porque el
  // panel de estado cruza los dos registros.
  cron.schedule('30 * * * *', runCronJob('hospitality-registro-viajeros', 'Hospitality Registro de Viajeros (MIR)', '30 * * * *', async () => {
    const { runRegistroViajerosScan, resumenDelBarrido, avisosDelBarrido } = await import(
      './hospitality-registro-viajeros'
    );
    const resultado = await runRegistroViajerosScan();
    // El mismo resumen y los mismos avisos que el disparo por HTTP: el panel de
    // estado no puede contar una cosa u otra según quién haya lanzado el job.
    return { mensaje: resumenDelBarrido(resultado), avisos: avisosDelBarrido(resultado) };
  }));

  console.log('✅ [Scheduler] Hospitality registro de viajeros programado (cada hora, minuto 30)');

  // 16g. Hospitality: health-check diario de la capa de conectividad.
  //      El estado del panel solo cambia con tráfico: si el proveedor revoca
  //      las credenciales un día sin reservas ni pushes, el badge seguiría
  //      «Conectado» por inercia. Esta sonda llama a property_details (la
  //      misma del botón «Probar»), mueve el estado con las mismas reglas y
  //      deja la marca de última verificación.
  // El id/etiqueta/cadencia deben coincidir con las constantes del módulo
  // (`JOB_ID_HEALTH_CHECK` etc.): hay un test que lo exige, porque el panel
  // de estado cruza los dos registros.
  cron.schedule(JOB_SCHEDULE_HEALTH_CHECK, runCronJob(JOB_ID_HEALTH_CHECK, JOB_LABEL_HEALTH_CHECK, JOB_SCHEDULE_HEALTH_CHECK, async () => {
    const { runConnectivityHealthCheck, mensajeDelHealthCheck, avisosDelHealthCheck } = await import(
      './hospitality-connectivity-health'
    );
    const resultado = await runConnectivityHealthCheck();
    // El mismo resumen y los mismos avisos que el disparo por HTTP: el panel de
    // estado no puede contar una cosa u otra según quién haya lanzado el job.
    return { mensaje: mensajeDelHealthCheck(resultado), avisos: avisosDelHealthCheck(resultado) };
  }));

  console.log('✅ [Scheduler] Hospitality conectividad health-check programado (diaria 05:00)');

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
