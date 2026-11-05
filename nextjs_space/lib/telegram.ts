
/**
 * Servicio de Notificaciones vía Telegram para el Módulo de Igualdad.
 */
export class TelegramService {
  private static readonly TELEGRAM_API = 'https://api.telegram.org/bot';

  /**
   * Envía un mensaje a un chat específico usando un bot token.
   * `extra` puede incluir `reply_markup` (inline_keyboard, etc.).
   */
  static async sendMessage(token: string, chatId: string, text: string, extra?: Record<string, unknown>) {
    try {
      const url = `${this.TELEGRAM_API}${token}/sendMessage`;
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      };
      if (extra?.reply_markup) {
        payload.reply_markup = extra.reply_markup;
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[TelegramService] Error:', error);
        return { success: false, error: error.description };
      }

      return { success: true };
    } catch (error) {
      console.error('[TelegramService] Exception:', error);
      return { success: false, error: 'Failed to connect to Telegram' };
    }
  }

  /**
   * Obtiene la información del bot para validar el token.
   */
  static async getMe(token: string) {
    try {
      const url = `${this.TELEGRAM_API}${token}/getMe`;
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      return { ok: false, error: 'Connection failed' };
    }
  }
}

/**
 * Legacy exports for backward compatibility
 */
export async function sendTelegramMessage(
  chatId: string, 
  message: string, 
  token?: string,
  extra?: Record<string, unknown>
) {
  const botToken = token || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[telegram] No token provided');
    return { success: false, error: 'No bot token' };
  }
  return TelegramService.sendMessage(botToken, chatId, message, extra);
}

/**
 * Carga las credenciales de Telegram para un tenant.
 *
 * Resolución en cascada (solo credenciales DEL PROPIO tenant):
 * 1) Integration legacy (credenciales.bot_token en texto plano)
 * 2) Channel moderno (config.botToken cifrado con AES)
 * 3) Nada → `bot_token` y `admin_chat_id` a `null`
 *
 * **No hay fallback a las variables de entorno cuando hay tenantId**: ese
 * fallback era lo que hacía que notificaciones de cualquier tenant sin bot
 * propio cayeran en el chat personal `TELEGRAM_ADMIN_CHAT_ID` y salieran por
 * el bot del sistema, que según `documentacion_tecnica/TELEGRAM_ARQUITECTURA.md`
 * nunca debe recibir datos de un tenant. Un tenant sin Telegram propio no
 * envía por Telegram.
 *
 * Si NO se pasa tenantId (uso de plataforma: avisos de sistema, colas de
 * infraestructura) se devuelven las variables de entorno, que no llevan datos
 * de tenants.
 */
export async function loadTelegramCredentials(tenantId?: string | null) {
  if (tenantId) {
    try {
      const { default: prisma } = await import('@/lib/db');

      // 1) Integration legacy (texto plano)
      const integration = await prisma.integration.findFirst({
        where: { tenantId, tipo: 'telegram', activo: true },
        select: { credenciales: true },
      });
      const creds = integration?.credenciales as any;
      if (creds?.bot_token) {
        return {
          bot_token: creds.bot_token,
          admin_chat_id: creds.admin_chat_id || null,
        };
      }

      // 2) Channel moderno (botToken cifrado)
      const channel = await prisma.channel.findFirst({
        where: { tenantId, type: 'telegram' },
        select: { config: true },
      });
      const config = channel?.config as any;
      if (config?.botToken) {
        const { decrypt } = await import('@/lib/core/crypto');
        return {
          bot_token: decrypt(config.botToken),
          admin_chat_id: config.adminChatId || config.admin_chat_id || null,
        };
      }
    } catch (e) {
      console.error('[telegram] Error resolviendo credenciales del tenant:', e);
    }

    // Tenant sin bot/chat propios: nada de entorno. Quien llame con tenantId
    // debe comprobar el resultado y no enviar por Telegram.
    return { bot_token: null, admin_chat_id: null };
  }

  // Sin tenantId → solo entorno (uso de plataforma, sin datos de tenants).
  return {
    bot_token: process.env.TELEGRAM_BOT_TOKEN,
    admin_chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
  };
}
