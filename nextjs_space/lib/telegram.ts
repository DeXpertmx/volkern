
/**
 * Servicio de Notificaciones vía Telegram para el Módulo de Igualdad.
 */
export class TelegramService {
  private static readonly TELEGRAM_API = 'https://api.telegram.org/bot';

  /**
   * Envía un mensaje a un chat específico usando un bot token.
   */
  static async sendMessage(token: string, chatId: string, text: string) {
    try {
      const url = `${this.TELEGRAM_API}${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        })
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
  return TelegramService.sendMessage(botToken, chatId, message);
}

export async function loadTelegramCredentials() {
  return {
    bot_token: process.env.TELEGRAM_BOT_TOKEN,
    admin_chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
  };
}
