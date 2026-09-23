import { prisma } from '@/lib/db';
import { PipelineHealthService } from './pipeline-health-service';
import { createSystemContext } from '@/lib/skills/context';

export class PipelineWatchdog {
  /**
   * Ejecuta el escaneo de vigilancia para un tenant
   */
  static async runWatchdog(tenantId: string) {
    // 1. Recalcular salud
    const updatedDeals = await PipelineHealthService.syncPipelineHealth(tenantId);

    // 1.5 PUERTA DE PRÁCTICA (bucle riesgo → roleplay): los deals activos que
    // acaban de caer a CRÍTICO deben ensayar la conversación con su cliente
    // real antes de volver a contactarlo. Idempotente: si ya tenían la puerta,
    // no re-notifica ni re-emite. La levanta el post-mortem con puntuación
    // suficiente (training-gate).
    const { TrainingGateService } = await import('./training-gate-service');
    const puertas = await TrainingGateService.abrirPuertas(tenantId);
    
    // 2. Identificar riesgos críticos para alertas (Silenciar si se alertó hace menos de 24h)
    const criticalDeals = updatedDeals.filter(d => 
      d && d.healthStatus === 'CRITICAL' && d.valor > 5000 &&
      (!d.lastAlertSent || (Date.now() - new Date(d.lastAlertSent).getTime() > 24 * 60 * 60 * 1000))
    );

    if (criticalDeals.length > 0) {
      const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
      
      for (const deal of criticalDeals) {
        if (!deal) continue;
        
        await notifyByTelegram(
          `🚨 *ALERTA DE ABANDONO: DEAL EN RIESGO*\n\n` +
          `💰 *Valor:* ${deal.valor} ${deal.moneda}\n` +
          `📁 *Deal:* ${deal.titulo}\n` +
          `📉 *Salud:* ${deal.healthScore}/100\n` +
          `⏳ *Estado:* CRÍTICO - Requiere acción inmediata.`,
          createSystemContext(tenantId)
        ).catch(err => console.error('Error enviando alerta Watchdog:', err));

        // Actualizar fecha de última alerta
        await prisma.deal.update({
          where: { id: deal.id },
          data: { lastAlertSent: new Date() }
        });
      }
    }

    // 3. Auto-tagging
    for (const deal of updatedDeals) {
      if (!deal) continue;
      
      let tags = deal.tags ? deal.tags.split(',') : [];
      
      if (deal.healthScore > 85) {
        if (!tags.includes('HOT')) tags.push('HOT');
        tags = tags.filter(t => t !== 'ZOMBIE');
      } else if (deal.healthScore < 25) {
        if (!tags.includes('ZOMBIE')) tags.push('ZOMBIE');
        tags = tags.filter(t => t !== 'HOT');
      }

      await prisma.deal.update({
        where: { id: deal.id },
        data: { tags: tags.join(',') }
      });
    }

    return {
      scanned: updatedDeals.length,
      alerts: criticalDeals.length,
      puertasAbiertas: puertas.abiertas
    };
  }
}
