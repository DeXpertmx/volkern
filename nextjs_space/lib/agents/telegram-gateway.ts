import { prisma } from '@/lib/db';
import { TelegramService } from '@/lib/telegram';
import { rateLimiter } from '@/lib/rate-limiter';
import { formatearImporte } from '@/lib/moneda';
import { sanitizeInput, ConversationContextAgent } from './conversation-context';
import { ChatbotAuditLogger } from './audit-logger';
import { monedaDelTenant } from './moneda-tenant';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
  edited_message?: any;
  callback_query?: any;
}

export interface ParsedMessage {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  chatId: string;
  text: string;
  messageId: number;
}

export interface GatewayResponse {
  success: boolean;
  response?: string;
  error?: string;
}

export class TelegramGatewayAgent {
  static async processUpdate(
    tenantId: string,
    update: TelegramUpdate
  ): Promise<GatewayResponse> {
    try {
      // 1. Parsear mensaje
      const parsed = this.parseUpdate(update);
      if (!parsed) {
        return { success: false, error: 'Invalid update format' };
      }

      // 2. Validar que no es un mensaje de bot
      if (update.message?.from?.is_bot) {
        return { success: true, response: undefined }; // Ignorar mensajes de bots
      }

      // 3. Obtener o crear usuario de Telegram
      const telegramUser = await this.getOrCreateTelegramUser(
        tenantId,
        parsed
      );

      if (!telegramUser) {
        return { success: false, error: 'Failed to create Telegram user' };
      }

      // 4. Verificar si el usuario está bloqueado
      if (telegramUser.isBlocked) {
        return { success: false, error: 'Usuario bloqueado' };
      }

      // 5. Verificar whitelist si está configurada
      const config = await this.getChatbotConfig(tenantId);
      if (config && config.allowedUserIds && config.allowedUserIds.length > 0) {
        if (!config.allowedUserIds.includes(parsed.telegramUserId)) {
          await this.blockTelegramUser(telegramUser.id);
          return {
            success: false,
            error: 'No tienes autorización para usar este bot'
          };
        }
      }

      // 6. Verificar rate limit
      const rateLimitResult = await rateLimiter.checkLimit(
        tenantId,
        'telegram_message' as any
      );

      if (!rateLimitResult.allowed) {
        const response = 'Por favor, espera un momento antes de enviar otro mensaje.';
        await this.sendMessage(parsed.chatId, response, tenantId);
        return { success: true, response };
      }

      // 7. Manejo de Comandos Administrativos Especiales
      if (parsed.text.startsWith('/fiscal_status')) {
        const { AEATObservabilityService } = await import('../fiscal/aeat/observability-service');
        const metrics = await AEATObservabilityService.getRealTimeMetrics();
        const alerts = await AEATObservabilityService.runHealthCheck();

        let report = `📊 <b>ESTADO DE SALUD FISCAL (ON-DEMAND)</b>\n\n`;
        report += `✅ Aceptadas: ${metrics.database.accepted}\n`;
        report += `❌ Rechazadas: ${metrics.database.rejected}\n`;
        report += `⚠️ Errores (Retry): ${metrics.database.error}\n`;
        report += `🕒 En Cola: ${metrics.queue.waiting}\n\n`;

        if (alerts.length > 0) {
          report += `🚨 <b>ALERTAS ACTIVAS:</b>\n`;
          alerts.forEach(a => {
            const icon = a.severity === 'CRITICAL' ? '🔥' : '⚠️';
            report += `${icon} ${a.message}\n`;
          });
        } else {
          report += `✅ Todo el sistema opera dentro de los umbrales normales.`;
        }

        await this.sendMessage(parsed.chatId, report, tenantId);
        return { success: true, response: report };
      }

      // 8. Comando: /fiscal_retry_failed (Reintento Masivo)
      if (parsed.text.startsWith('/fiscal_retry_failed')) {
        const failedInvoices = await prisma.invoice.findMany({
          where: { 
            tenantId,
            aeatStatus: { in: ['ERROR', 'REJECTED'] }
          },
          select: { id: true }
        });

        if (failedInvoices.length === 0) {
          const msg = '✅ No hay facturas fallidas pendientes de reintento.';
          await this.sendMessage(parsed.chatId, msg, tenantId);
          return { success: true, response: msg };
        }

        const { aeatQueue } = await import('../queues/aeat-queue');
        for (const inv of failedInvoices) {
          await aeatQueue.add('ship_invoice', { 
            invoiceId: inv.id, 
            tenantId 
          });
        }

        const msg = `🚀 Se han encolado ${failedInvoices.length} facturas para reintento inmediato.`;
        
        // Registrar Auditoría
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: parsed.telegramUserId,
            accion: 'FISCAL_RETRY_FAILED',
            entidad: 'Invoice',
            entidadId: tenantId,
            descripcion: 'Reintento masivo de facturas fallidas vía Telegram',
            metadata: { count: failedInvoices.length, chatId: parsed.chatId }
          } as any
        });

        await this.sendMessage(parsed.chatId, msg, tenantId);
        return { success: true, response: msg };
      }

      // 9. Comando: /fiscal_ack (Reconocer Incidente)
      if (parsed.text.startsWith('/fiscal_ack')) {
        const incidentId = parsed.text.split(' ')[1];
        if (!incidentId) {
          const msg = '❌ Debes proporcionar el ID del incidente. Ej: /fiscal_ack clx...';
          await this.sendMessage(parsed.chatId, msg, tenantId);
          return { success: true, response: msg };
        }

        const incident = await prisma.fiscalIncident.update({
          where: { id: incidentId },
          data: { 
            status: 'ACKNOWLEDGED',
            acknowledgedAt: new Date()
          }
        });

        // Registrar Auditoría
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: parsed.telegramUserId,
            accion: 'FISCAL_INCIDENT_ACK',
            entidad: 'FiscalIncident',
            entidadId: incident.id,
            descripcion: 'Incidente fiscal reconocido vía Telegram',
            metadata: { incidentId: incident.id, chatId: parsed.chatId }
          } as any
        });

        const msg = `🤝 Incidente ${incident.id} reconocido. El equipo de guardia ya está al tanto.`;
        await this.sendMessage(parsed.chatId, msg, tenantId);
        return { success: true, response: msg };
      }

      // 10. Comando: /fiscal_ai_forecast (Predicción de Negocio)
      if (parsed.text.startsWith('/fiscal_ai_forecast')) {
        const { AEAAIOpsService } = await import('../fiscal/aeat/ai-ops-service');
        const forecast = await AEAAIOpsService.getFiscalForecast(tenantId);

        if (!forecast) {
          const msg = '⚠️ No hay datos suficientes para generar una predicción fiable aún.';
          await this.sendMessage(parsed.chatId, msg, tenantId);
          return { success: true, response: msg };
        }

        // La previsión es dinero que el usuario lee, así que va en la divisa de su
        // cuenta: el euro escrito a mano mostraba euros a un tenant en pesos.
        const moneda = await monedaDelTenant(tenantId);
        let msg = `🤖 <b>INTELIGENCIA FISCAL AI (30 DÍAS)</b>\n\n`;
        msg += `💰 Facturación Est.: ${formatearImporte(forecast.totalInvoiced, moneda)}\n`;
        msg += `🏛️ IVA Estimado: ${formatearImporte(forecast.estimatedVAT, moneda)}\n`;
        msg += `📈 Tendencia: <b>${forecast.trend}</b>\n\n`;
        msg += `<i>Nota: Esta es una estimación basada en patrones de facturación.</i>`;

        await this.sendMessage(parsed.chatId, msg, tenantId);
        return { success: true, response: msg };
      }

      // 11. Obtener o crear contexto de conversación
      const context = await ConversationContextAgent.getOrCreateContext(
        tenantId,
        parsed.telegramUserId,
        config?.maxContextMessages || 10
      );

      // 8. Loggear input
      await ChatbotAuditLogger.log({
        tenantId,
        sessionId: context.sessionId,
        telegramUserId: parsed.telegramUserId,
        messageId: parsed.messageId.toString(),
        inputRaw: parsed.text,
        status: 'PENDING'
      });

      // 9. Actualizar stats del usuario
      await this.updateUserStats(telegramUser.id);

      // Retornar los datos necesarios para continuar el flujo
      return {
        success: true,
        response: undefined // El agente principal decidirá la respuesta
      };

    } catch (error) {
      console.error('[TelegramGateway] Error processing update:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static parseUpdate(update: TelegramUpdate): ParsedMessage | null {
    const message = update.message;

    if (!message || !message.from || !message.chat) {
      return null;
    }

    const text = message.text?.trim();
    if (!text) {
      return null;
    }

    return {
      telegramUserId: message.from.id.toString(),
      username: message.from.username,
      firstName: message.from.first_name,
      lastName: message.from.last_name,
      languageCode: message.from.language_code,
      chatId: message.chat.id.toString(),
      text: sanitizeInput(text),
      messageId: message.message_id
    };
  }

  private static async getOrCreateTelegramUser(
    tenantId: string,
    parsed: ParsedMessage
  ): Promise<any> {
    let user = await (prisma as any).telegramUser.findUnique({
      where: {
        tenantId_telegramUserId: {
          tenantId,
          telegramUserId: parsed.telegramUserId
        }
      }
    });

    if (!user) {
      user = await (prisma as any).telegramUser.create({
        data: {
          tenantId,
          telegramUserId: parsed.telegramUserId,
          telegramUsername: parsed.username,
          telegramFirstName: parsed.firstName,
          telegramLastName: parsed.lastName,
          telegramLanguageCode: parsed.languageCode,
          isAuthorized: false
        }
      });
    } else {
      // Actualizar información
      user = await (prisma as any).telegramUser.update({
        where: { id: user.id },
        data: {
          telegramUsername: parsed.username,
          telegramFirstName: parsed.firstName,
          telegramLastName: parsed.lastName,
          telegramLanguageCode: parsed.languageCode,
          lastMessageAt: new Date()
        }
      });
    }

    return user;
  }

  private static async getChatbotConfig(tenantId: string): Promise<any> {
    try {
      return await prisma.telegramChatbotConfig.findUnique({
        where: { tenantId }
      });
    } catch {
      return null;
    }
  }

  private static async blockTelegramUser(userId: string): Promise<void> {
    await (prisma as any).telegramUser.update({
      where: { id: userId },
      data: { isBlocked: true }
    });
  }

  private static async updateUserStats(userId: string): Promise<void> {
    await (prisma as any).telegramUser.update({
      where: { id: userId },
      data: {
        totalMessages: { increment: 1 },
        lastMessageAt: new Date()
      }
    });
  }

  static async sendMessage(
    chatId: string,
    message: string,
    tenantId: string
  ): Promise<boolean> {
    try {
      const config = await this.getChatbotConfig(tenantId);
      const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        console.error('[TelegramGateway] No bot token found');
        return false;
      }

      const result = await TelegramService.sendMessage(
        botToken,
        chatId,
        message
      );

      return result.success;
    } catch (error) {
      console.error('[TelegramGateway] Error sending message:', error);
      return false;
    }
  }

  static async setWebhook(
    botToken: string,
    webhookUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'edited_message', 'callback_query']
        })
      });

      const data = await response.json();

      if (!data.ok) {
        return { success: false, error: data.description };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async verifyWebhook(
    botToken: string
  ): Promise<{ success: boolean; webhookInfo?: any }> {
    try {
      const url = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.ok) {
        return { success: false };
      }

      return { success: true, webhookInfo: data.result };
    } catch {
      return { success: false };
    }
  }
}