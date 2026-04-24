import { prisma } from '@/lib/db';
import { subDays } from 'date-fns';

export class ConnectRetentionService {
  /**
   * Ejecuta la limpieza de datos antiguos según la política de retención:
   * - Mensajes: 365 días
   * - Insights Gemma: 180 días
   * - Audit Logs: 5 años (1825 días)
   */
  static async pruneOldData() {
    console.log('🧹 [RetentionService] Iniciando limpieza de datos...');

    const now = new Date();
    
    // 1. Mensajes (1 año)
    const messageThreshold = subDays(now, 365);
    const deletedMessages = await prisma.chatMessage.deleteMany({
      where: {
        createdAt: { lt: messageThreshold },
        // No borramos mensajes si están pineados? 
        // En el esquema actual no hay 'isPinned' en el mensaje, solo en la suscripción del canal.
      }
    });
    console.log(`✅ [Retention] Mensajes eliminados: ${deletedMessages.count}`);

    // 2. Insights Gemma (6 meses)
    const gemmaThreshold = subDays(now, 180);
    const deletedInsights = await prisma.gemmaResponse.deleteMany({
      where: {
        createdAt: { lt: gemmaThreshold },
        status: { not: 'pending' } // Solo borramos si no están pendientes de acción
      }
    });
    console.log(`✅ [Retention] Insights eliminados: ${deletedInsights.count}`);

    // 3. Audit Logs (5 años)
    const auditThreshold = subDays(now, 1825);
    const deletedLogs = await prisma.auditLog.deleteMany({
      where: {
        fechaCreacion: { lt: auditThreshold }
      }
    });
    console.log(`✅ [Retention] Audit logs eliminados: ${deletedLogs.count}`);

    return {
      messages: deletedMessages.count,
      insights: deletedInsights.count,
      auditLogs: deletedLogs.count
    };
  }
}
