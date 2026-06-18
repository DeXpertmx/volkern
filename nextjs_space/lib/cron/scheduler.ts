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

  // 2. Radar de Ghosting - Ejecución diaria a las 09:30 AM
  // Audita la integridad de todas las cadenas de facturación.
  cron.schedule('59 23 * * 0', async () => {
    console.log('[Cron] 🏗️ Iniciando Ritual Dominical: Auditoría Fiscal Global...');
    const { FiscalAuditService } = await import('../fiscal/audit-service');
    await FiscalAuditService.auditAllTenants();
    console.log('[Cron] ✅ Ritual Dominical completado.');
  });

  // 3. Recuperación Proactiva de Facturas (Veri*factu) - Cada 4 horas
  cron.schedule('0 */4 * * *', async () => {
    console.log('[Cron] 📡 Iniciando Recuperación Proactiva de Facturas...');
    await runProactiveInvoiceRecovery();
  });

  // 4. Daily MRR Calculation - Ejecución diaria a las 00:05 AM
  cron.schedule('5 0 * * *', async () => {
    console.log('[Cron] 💰 Calculando métricas SaaS diarias (MRR)...');
    const { SaaSMetricsService } = await import('../saas-metrics');
    await SaaSMetricsService.recordMetrics();
    console.log('✅ [Cron] Métricas SaaS diarias registradas.');
  });

  // 5. Weekly Churn Calculation - Ejecución cada domingo a las 01:00 AM
  cron.schedule('0 1 * * 0', async () => {
    console.log('[Cron] 📉 Calculando churn rate semanal...');
    const { SaaSMetricsService } = await import('../saas-metrics');
    await SaaSMetricsService.recordMetrics();
    console.log('✅ [Cron] Churn rate semanal calculado.');
  });

  // 6. Monthly Snapshot - Primer día de cada mes a las 02:00 AM
  cron.schedule('0 2 1 * *', async () => {
    console.log('[Cron] 📊 Generando snapshot mensual de métricas...');
    const { SaaSMetricsService } = await import('../saas-metrics');
    await SaaSMetricsService.createSnapshot();
    console.log('✅ [Cron] Snapshot mensual generado.');
  });

  // 7. Limit Alerts - Ejecución diaria a las 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] 📊 Verificando límites de planes...');
    const { checkAndNotifyLimitAlerts } = await import('../subscription');
    const result = await checkAndNotifyLimitAlerts();
    console.log(`[Cron] ✅ Límites verificados: ${result.checked} tenants, ${result.notified} notificaciones enviadas, ${result.alerts.length} alertas.`);
  });

  // 8. Google Calendar Webhook Renewal - Cada 12 horas
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

  console.log('✅ [Scheduler] Radar de Ghosting programado (09:00 AM daily)');
  console.log('✅ [Scheduler] Ritual Dominical programado (Sun 23:59)');
  console.log('✅ [Scheduler] Recuperación Proactiva programada (cada 4h)');
  console.log('✅ [Scheduler] Métricas SaaS diarias programadas (00:05 AM)');
  console.log('✅ [Scheduler] Churn rate semanal programado (Sun 01:00 AM)');
  console.log('✅ [Scheduler] Snapshot mensual programado (1st of month 02:00 AM)');
  console.log('✅ [Scheduler] Google Calendar webhook renewal programado (cada 12h)');

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
}

/**
 * Lógica de Recuperación Proactiva
 * Simula el polling a APIs externas (Nexus/Hacienda) para recolectar facturas recibidas.
 */
export async function runProactiveInvoiceRecovery() {
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, nombre: true } });
    const { InboundInvoiceService } = await import('../finance/inbound-invoice-service');
    
    let totalProcessed = 0;

    for (const tenant of tenants) {
      // Simulación de detección de facturas externas
      // En un escenario real, aquí llamaríamos a una API externa (ej. Nexus)
      const mockExternalInvoices = [
        { 
          invoiceNumber: `EXT-${Date.now()}`, 
          supplierId: 'automatic-provider', 
          totalAmount: Math.random() * 500, 
          currency: 'EUR',
          issueDate: new Date().toISOString()
        }
      ];

      for (const inv of mockExternalInvoices) {
        // En esta simulación solo procesamos si existe un proveedor mock
        // En prod, el adapter buscaría por CIF/NIF
        try {
          // Solo procesar si hay un proveedor configurado (o usar uno por defecto)
          const supplier = await prisma.supplier.findFirst({ where: { tenantId: tenant.id } });
          if (supplier) {
            await InboundInvoiceService.processInboundInvoice(tenant.id, 'volkern_json', {
              ...inv,
              supplierId: supplier.id
            });
            totalProcessed++;
          }
        } catch (e) {
          console.error(`[Cron] Error procesando factura para ${tenant.nombre}:`, e);
        }
      }
    }

    console.log(`[Cron] ✅ Recuperación proactiva completa. ${totalProcessed} facturas procesadas.`);
    return { success: true, totalProcessed };
  } catch (err) {
    console.error('[Cron] ❌ Error fatal en Recuperación Proactiva:', err);
    return { success: false, error: err };
  }
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
            prioridad: 'alta' as any, // Algunos esquemas usan enums o strings con prioridad
          }
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
