import { prisma } from '@/lib/db';
import { sendTelegramMessage, loadTelegramCredentials } from '@/lib/telegram';

/**
 * Servicio de Gestión de Incidentes Fiscales
 */
export class AEATIncidentService {
  
  /**
   * Registra o actualiza un incidente basado en una alerta
   */
  static async reportAlert(alert: { type: string, severity: string, message: string, tenantId?: string }) {
    // 1. Buscar si ya existe un incidente abierto del mismo tipo para el mismo tenant
    const existingIncident = await prisma.fiscalIncident.findFirst({
      where: {
        type: alert.type,
        tenantId: alert.tenantId || null,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] }
      }
    });

    if (existingIncident) {
      // Solo actualizamos metadatos o logs, no notificamos de nuevo (prevención de spam)
      return existingIncident;
    }

    // 2. Crear nuevo incidente
    const incident = await prisma.fiscalIncident.create({
      data: {
        type: alert.type,
        severity: alert.severity,
        title: `Incidente: ${alert.type}`,
        description: alert.message,
        tenantId: alert.tenantId || null,
        status: 'OPEN',
        metadata: { lastAlert: alert.message, occurrences: 1 }
      }
    });

    // 3. Notificar apertura
    await this.notifyIncident(incident);

    return incident;
  }

  /**
   * Resuelve incidentes que ya no están presentes en el health check
   */
  static async resolveIncidents(activeAlertTypes: string[]) {
    const openIncidents = await prisma.fiscalIncident.findMany({
      where: { 
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        type: { notIn: activeAlertTypes }
      }
    });

    for (const incident of openIncidents) {
      await prisma.fiscalIncident.update({
        where: { id: incident.id },
        data: { 
          status: 'RESOLVED',
          resolvedAt: new Date(),
          endTime: new Date()
        }
      });

      await this.notifyResolution(incident);
    }
  }

  private static async notifyIncident(incident: any) {
    const creds = await loadTelegramCredentials(incident.tenantId);
    // Solo con el bot PROPIO del tenant: sin él no se avisa (el bot del
    // sistema no lleva datos de tenants).
    if (creds.admin_chat_id && creds.bot_token) {
      const msg = `🚨 <b>NUEVO INCIDENTE FISCAL</b>\n\n` +
                  `🆔 ID: ${incident.id}\n` +
                  `🔥 Tipo: ${incident.type}\n` +
                  `⚠️ Severidad: ${incident.severity}\n` +
                  `📝 ${incident.description}\n\n` +
                  `Usa /fiscal_ack ${incident.id} para reconocerlo.`;
      await sendTelegramMessage(creds.admin_chat_id, msg, creds.bot_token);
    }
  }

  private static async notifyResolution(incident: any) {
    const creds = await loadTelegramCredentials(incident.tenantId);
    if (creds.admin_chat_id && creds.bot_token) {
      const msg = `✅ <b>INCIDENTE RESUELTO</b>\n\n` +
                  `🆔 ID: ${incident.id}\n` +
                  `🔥 Tipo: ${incident.type}\n` +
                  `El sistema ha detectado que la anomalía ha desaparecido.`;
      await sendTelegramMessage(creds.admin_chat_id, msg, creds.bot_token);
    }
  }
}
