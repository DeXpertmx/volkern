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

  // 1. Radar de Ghosting - Ejecución diaria a las 09:00 AM
  // Monitorea leads sin actividad y genera alertas/tasks para los agentes.
  cron.schedule('0 9 * * *', async () => {
    await runGhostingRadar();
  });

  console.log('✅ [Scheduler] Radar de Ghosting programado (09:00 AM daily)');
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
