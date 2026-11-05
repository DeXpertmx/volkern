import { loadTelegramCredentials } from '../telegram';
import { prisma } from '../db';
import { chatVinculadoSoloA } from '../telegram/context-resolver';
import { sendBotMessage } from '../telegram/quick-replies';

/**
 * Credenciales con las que este watchdog puede avisar a un tenant.
 *
 * Solo el bot y el chat del PROPIO tenant: un security brief lleva nombre de
 * empleado y datos de nómina de una empresa, así que ni sale por el bot del
 * sistema ni puede acabar en el chat de otra (TELEGRAM_ARQUITECTURA.md §1).
 */
async function credencialesDelTenant(tenantId: string) {
  const creds = await loadTelegramCredentials(tenantId);
  const botToken = creds.bot_token;
  const chatId = creds.admin_chat_id;

  if (!botToken) return { ok: false as const, motivo: 'sin bot propio' };
  if (!chatId) return { ok: false as const, motivo: 'sin chat de administración' };

  // Un chat = un tenant: si el chat ya está vinculado a otra empresa, no se envía.
  if (!(await chatVinculadoSoloA(chatId, tenantId))) {
    return { ok: false as const, motivo: 'el chat está vinculado a otro tenant' };
  }

  return { ok: true as const, botToken, chatId };
}

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
      where: { tenantId, user: { role: { nombre: 'OWNER' } } } as any,
      select: { fullName: true }
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true, configuracion: true, slug: true }
    });

    // 2. Verificar si las notificaciones de Telegram están habilitadas en config
    const config = (tenant?.configuracion as any) || {};
    if (config?.notifications?.disableTelegramWatchdog) return;

    // 3. Credenciales del propio tenant (nunca las de plataforma)
    const destino = await credencialesDelTenant(tenantId);
    if (!destino.ok) {
      console.warn(
        `[Watchdog] Security Brief no enviado (${destino.motivo}) para tenant ${tenantId}`
      );
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
      // `sendBotMessage` manda en Markdown (el brief usa *negrita* e _cursiva_) y
      // reintenta en texto plano si Telegram rechaza el parseo. Antes se llamaba
      // a `sendTelegramMessage` con la firma equivocada —un objeto como `chatId`—
      // y, de haber llegado, el `parse_mode` sería HTML: las marcas saldrían
      // literales.
      const envio = await sendBotMessage(destino.chatId, message, destino.botToken);
      if (!envio.success) {
        console.error('[Watchdog] Error al enviar Security Brief:', envio.error);
        return;
      }

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

  /**
   * Notifica sobre un nuevo LEAD capturado desde la web pública
   */
  static async sendLeadAlert(tenantId: string, lead: { name: string, email: string, source: string }) {
    try {
      const destino = await credencialesDelTenant(tenantId);
      if (!destino.ok) {
        console.warn(
          `[Watchdog] Aviso de lead no enviado (${destino.motivo}) para tenant ${tenantId}`
        );
        return;
      }

      const message = `
🎯 *NUEVO LEAD CAPTURADO* 🎯
*Nombre:* ${lead.name}
*Email:* ${lead.email}
*Fuente:* ${lead.source}

_Acción Requerida: Inicia secuencia de Nurturing en el Marketing Hub._
`.trim();

      const envio = await sendBotMessage(destino.chatId, message, destino.botToken);
      if (!envio.success) {
        console.error('[Watchdog] Error al enviar alerta de lead:', envio.error);
      }
    } catch (error) {
      console.error('[Watchdog] Error al enviar alerta de lead:', error);
    }
  }
}
