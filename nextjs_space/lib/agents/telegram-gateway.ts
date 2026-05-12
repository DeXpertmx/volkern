import { prisma } from '@/lib/db';
import { TelegramService } from '@/lib/telegram';
import { rateLimiter } from '@/lib/rate-limiter';
import { sanitizeInput, ConversationContextAgent } from './conversation-context';
import { ChatbotAuditLogger } from './audit-logger';

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
        'telegram_message'
      );

      if (!rateLimitResult.allowed) {
        const response = 'Por favor, espera un momento antes de enviar otro mensaje.';
        await this.sendMessage(parsed.chatId, response, tenantId);
        return { success: true, response };
      }

      // 7. Obtener o crear contexto de conversación
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
    let user = await prisma.telegramUser.findUnique({
      where: {
        tenantId_telegramUserId: {
          tenantId,
          telegramUserId: parsed.telegramUserId
        }
      }
    });

    if (!user) {
      user = await prisma.telegramUser.create({
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
      user = await prisma.telegramUser.update({
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
    await prisma.telegramUser.update({
      where: { id: userId },
      data: { isBlocked: true }
    });
  }

  private static async updateUserStats(userId: string): Promise<void> {
    await prisma.telegramUser.update({
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