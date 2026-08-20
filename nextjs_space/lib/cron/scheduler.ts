import cron from 'node-cron';
import { skills } from '../skills';
import { prisma } from '../db';

/**
 * Orquestador de Tareas Programadas para Gemma 4 Proactivity
 * 
 * Este scheduler maneja el Radar de Ghosting y otras tareas en segundo plano.
 * Para entornos serverless, este archivo exporta la lógica que puede ser llamada
 * por un endpoint externo, pero en entornos persistentes usa node-cron.
 */

export function initCronJobs() {
  console.log('🚀 [Scheduler] Inicializando tareas programadas de Volkern CRM...');

  // 1. Morning Briefing - Ejecución diaria a las 08:30 AM
  cron.schedule('30 8 * * *', async () => {
    console.log('[Cron] ☀️ Generando Morning Briefing...');
    const { MorningBriefingService } = await import('../sales/morning-briefing-service');
    await MorningBriefingService.sendGlobalBriefing();
    console.log('[Cron] ✅ Morning Briefing enviado.');
  });

  // 2. Daily MRR Calculation - Ejecución diaria a las 00:05 AM
  cron.schedule('5 0 * * *', async () => {
    console.log('[Cron] 💰 Calculando métricas SaaS diarias (MRR)...');
    const { SaaSMetricsService } = await import('../saas-metrics');
    await SaaSMetricsService.recordMetrics();
    console.log('✅ [Cron] Métricas SaaS diarias registradas.');
  });

  // 3. Monthly Snapshot - Primer día de cada mes a las 02:00 AM
  cron.schedule('0 2 1 * *', async () => {
    console.log('[Cron] 📊 Generando snapshot mensual de métricas...');
    const { SaaSMetricsService } = await import('../saas-metrics');
    await SaaSMetricsService.createSnapshot();
    console.log('✅ [Cron] Snapshot mensual generado.');
  });

  // 4. Limit Alerts - Ejecución diaria a las 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] 📊 Verificando límites de planes...');
    const { checkAndNotifyLimitAlerts } = await import('../subscription');
    const result = await checkAndNotifyLimitAlerts();
    console.log(`[Cron] ✅ Límites verificados: ${result.checked} tenants, ${result.notified} notificaciones enviadas, ${result.alerts.length} alertas.`);
  });

  // 5. Google Calendar Webhook Renewal - Cada 12 horas
  cron.schedule('0 */12 * * *', async () => {
    console.log('[Cron] 🔄 Iniciando renovación de canales webhook de Google Calendar...');
    try {
      const { renewWebhookChannel } = await import('../google-calendar');
      
      const now = new Date();
      const expirationThreshold = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const integrationsToRenew = await prisma.googleCalendarIntegration.findMany({
        where: {
          activo: true,
          channelId: { not: null },
          channelExpiration: {
            not: null,
            lte: expirationThreshold,
          },
        },
      });

      console.log(`[Cron] 📊 Encontradas ${integrationsToRenew.length} integraciones para renovar`);

      for (const integration of integrationsToRenew) {
        try {
          const horasRestantes = Math.round(
            (integration.channelExpiration!.getTime() - now.getTime()) / (1000 * 60 * 60)
          );
          console.log(`[Cron] 🔄 Renovando canal para usuario ${integration.userId} (expira en ${horasRestantes}h)`);
          await renewWebhookChannel(integration.userId);
          console.log(`[Cron] ✅ Canal renovado para usuario ${integration.userId}`);
        } catch (error: any) {
          console.error(`[Cron] ❌ Error renovando canal para usuario ${integration.userId}:`, error.message);
        }
      }

      console.log(`[Cron] ✅ Renovación de canales webhook completada`);
    } catch (error: any) {
      console.error('[Cron] ❌ Error en renovación de canales webhook:', error.message);
    }
  });

  console.log('✅ [Scheduler] Morning Briefing programado (08:30 AM daily)');
  console.log('✅ [Scheduler] Métricas SaaS diarias programadas (00:05 AM)');
  console.log('✅ [Scheduler] Snapshot mensual programado (1st of month 02:00 AM)');
  console.log('✅ [Scheduler] Límites de planes programados (10:00 AM daily)');
  console.log('✅ [Scheduler] Google Calendar webhook renewal programado (cada 12h)');

  // 6. Recuperación Proactiva de Facturas — cada 4 horas
  // Solo procesa tenants con Tenant.configuracion.recuperacionProactiva.enabled=true.
  // Sin configuración es un no-op. Sin un proveedor real conectado, los adaptadores
  // (verifactu, nexus) son stubs que devuelven [].
  cron.schedule('0 */4 * * *', async () => {
    console.log('[Cron] 📡 Recuperación proactiva de facturas...');
    try {
      const { InboundInvoiceService } = await import('../finance/inbound-invoice-service');
      const results = await InboundInvoiceService.runProactiveRecovery();
      const total = results.reduce((acc, r) => acc + r.processed, 0);
      if (total > 0) {
        console.log(`[Cron] ✅ Recuperación proactiva: ${total} facturas procesadas en ${results.length} tenant(s)`);
      } else {
        console.log('[Cron] ℹ️  Recuperación proactiva: sin tenants habilitados o sin facturas pendientes');
      }
    } catch (error: any) {
      console.error('[Cron] ❌ Error en recuperación proactiva:', error.message);
    }
  });

  console.log('✅ [Scheduler] Recuperación proactiva programada (cada 4h, tenants habilitados)');

  // 9. Analytics Cleanup — semanal, domingo a las 03:00 AM
  cron.schedule('0 3 * * 0', async () => {
    console.log('[Cron] 🧹 Limpiando eventos de analytics antiguos (>90 días)...');
    try {
      const { cleanupOldEvents } = await import('../analytics/store');
      const deleted = await cleanupOldEvents(90);
      console.log(`[Cron] ✅ Analytics cleanup: ${deleted} eventos eliminados.`);
    } catch (error: any) {
      console.error('[Cron] ❌ Error en analytics cleanup:', error.message);
    }
  });

  console.log('✅ [Scheduler] Analytics cleanup programado (Sun 03:00 AM)');

  // 10. IMAP Email Polling — cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] 📬 Polling IMAP para todos los tenants...');
    try {
      const { pollAllTenants } = await import('../imap/imap-engine');
      await pollAllTenants();
    } catch (error: any) {
      console.error('[Cron] ❌ Error en IMAP polling:', error.message);
    }
  });

  console.log('✅ [Scheduler] IMAP Polling programado (cada 5 min)');

  // 11. Ad Schedule Evaluation — cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] ⏰ Evaluando schedules de campañas...');
    try {
      const { evaluateSchedules } = await import('../ads/schedule-engine');
      await evaluateSchedules();
    } catch (error: any) {
      console.error('[Cron] ❌ Error en schedule evaluation:', error.message);
    }
  });

  console.log('✅ [Scheduler] Ad Schedule Evaluation programado (cada 5 min)');

  // 12. AB Test Auto-Evaluation — cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] 🧪 Evaluando tests A/B activos...');
    try {
      const { evaluateActiveTests } = await import('../ads/ab-test-engine');
      await evaluateActiveTests();
    } catch (error: any) {
      console.error('[Cron] ❌ Error en AB test evaluation:', error.message);
    }
  });

  console.log('✅ [Scheduler] AB Test Auto-Evaluation programado (cada 30 min)');

  // 13. Watchdog Budget Evaluation — cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] 🐕 Evaluando reglas watchdog de presupuesto...');
    try {
      const { BudgetWatchdog } = await import('../ads/budget-watchdog');
      const tenants = await prisma.tenant.findMany({
        where: { estado: 'activo' },
        select: { id: true },
      });
      for (const t of tenants) {
        await BudgetWatchdog.evaluateAll(t.id).catch((err: any) =>
          console.error(`[Cron] Error watchdog para tenant ${t.id}:`, err.message)
        );
      }
    } catch (error: any) {
      console.error('[Cron] ❌ Error en watchdog evaluation:', error.message);
    }
  });

  console.log('✅ [Scheduler] Watchdog Evaluation programado (cada 30 min)');

  // 14. ADS Sync Campaigns — cada 1 hora
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] 🔄 Sincronizando campañas ADS...');
    try {
      const { runSyncCampaigns } = await import('../ads/cron/ads-jobs');
      await runSyncCampaigns();
    } catch (error: any) {
      console.error('[Cron] ❌ Error en ADS sync:', error.message);
    }
  });

  console.log('✅ [Scheduler] ADS Sync programado (cada 1 hora)');

  // 15. ADS Full Sync — cada 6 horas
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] 🔄 Sincronización completa ADS...');
    try {
      const { runFullSync } = await import('../ads/cron/ads-jobs');
      await runFullSync();
    } catch (error: any) {
      console.error('[Cron] ❌ Error en ADS full sync:', error.message);
    }
  });

  console.log('✅ [Scheduler] ADS Full Sync programado (cada 6 horas)');

  // 16. Trigger lead_sin_respuesta — cada 30 minutos
  initLeadSinRespuestaCron();
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
 * Registra SOLO el cron de `lead_sin_respuesta`. Se inicializa desde
 * instrumentation.ts (runtime Node). No llama a initCronJobs() completo:
 * varios jobs de ese scheduler son peligrosos en producción (p. ej. la
 * recuperación proactiva crea facturas mock) y nunca se han activado.
 */
export function initLeadSinRespuestaCron() {
  cron.schedule('*/30 * * * *', () => {
    runLeadSinRespuestaScan(24).catch((e) =>
      console.error('[Cron] lead_sin_respuesta job error:', e)
    )
  })
  console.log('✅ [Scheduler] Cron lead_sin_respuesta programado (cada 30 min, leads inactivos 24h)')
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
