import { sendTelegramMessage, loadTelegramCredentials } from '../telegram';
import { prisma } from '../db';

export class TelegramWatchdog {
  /**
   * Envía un Security Brief de emergencia al OWNER del tenant
   */
  static async sendSecurityBrief(tenantId: string, payload: {
    event: 'OFFBOARDING_START' | 'CRITICAL_ACCESS_DETECTED' | 'PAYROLL_ANOMALY_SIGNATURE',
    employeeName: string,
    riskSummary: string,
    roadmapLink?: string,
    metadata?: any
  }) {
    // 1. Obtener al OWNER del tenant
    const owner = await prisma.employee.findFirst({
      where: { tenantId, user: { role: 'OWNER' } },
      select: { fullName: true }
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true, configuracion: true, slug: true }
    });

    // 2. Verificar si las notificaciones de Telegram están habilitadas en config
    const config = (tenant?.configuracion as any) || {};
    if (config?.notifications?.disableTelegramWatchdog) return;

    // 3. Cargar credenciales del tenant
    const creds = await loadTelegramCredentials(tenantId);
    if (!creds?.chatId) {
      console.warn(`[Watchdog] No se pudo enviar alerta de Telegram: Sin chatId configurado para tenant ${tenantId}`);
      return;
    }

    // 4. Construir Mensaje (Briefing Militar/Soberano)
    let icon = '🚨';
    let title = 'ALERTA DE SEGURIDAD';

    if (payload.event === 'OFFBOARDING_START') {
      icon = '⚔️';
      title = 'BAJA DE EMPLEADO CRÍTICO';
    } else if (payload.event === 'PAYROLL_ANOMALY_SIGNATURE') {
      icon = '💰';
      title = 'NÓMINA CON ANOMALÍA SELLADA';
    }

    let message = `
${icon} *VOLKERN SECURITY BRIEFING* ${icon}
*Tenant:* ${tenant?.nombre}
*Evento:* ${title}

*Sujeto:* ${payload.employeeName}
*Riesgo:* ${payload.riskSummary}
`.trim();

    if (payload.metadata?.attendancePercent !== undefined) {
      message += `\n*Asistencia:* ${payload.metadata.attendancePercent.toFixed(1)}%`;
    }

    if (payload.metadata?.operatorNote) {
      message += `\n*Justificación:* _"${payload.metadata.operatorNote}"_`;
    }

    if (payload.roadmapLink) {
      message += `\n\n🔗 [Ver Detalles](${payload.roadmapLink})`;
    }

    message += `\n\n_Este mensaje se envía bajo el protocolo de Soberanía de Mando de Volkern Nexus._`;

    // 5. Enviar
    try {
      await sendTelegramMessage({
        tenantId,
        text: message,
        parseMode: 'Markdown'
      });
      
      // Registrar en el Trust Protocol
      await prisma.systemAlert.create({
        data: {
          level: 'INFO',
          message: `[WATCHDOG] ${title} enviado vía Telegram al OWNER de ${tenant?.nombre}.`,
        }
      });
    } catch (error) {
      console.error('[Watchdog] Error al enviar Security Brief:', error);
    }
  }
}
