
import fs from 'fs';
import path from 'path';
import { prisma } from './db';

interface TelegramConfig {
  bot_token: string;
  admin_chat_id?: string;
}

/**
 * Carga la configuración global de Telegram desde secretos (fallback)
 */
function getGlobalTelegramConfig(): TelegramConfig | null {
  try {
    if (!process.env.HOME) {
      return null;
    }
    
    const secretsPath = path.join(process.env.HOME, '.config', 'abacusai_auth_secrets.json');
    
    if (!fs.existsSync(secretsPath)) {
      return null;
    }

    const secretsData = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    
    if (!secretsData.telegram?.secrets?.bot_token?.value) {
      return null;
    }

    return {
      bot_token: secretsData.telegram.secrets.bot_token.value,
    };
  } catch (error) {
    console.error('Error al cargar configuración global de Telegram:', error);
    return null;
  }
}

/**
 * Carga las credenciales de Telegram para un tenant específico desde la DB
 */
export async function loadTelegramCredentials(tenantId: string): Promise<TelegramConfig | null> {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId,
        tipo: 'telegram',
        activo: true,
        conectado: true
      }
    });

    if (!integration || !integration.credenciales) {
      return getGlobalTelegramConfig();
    }

    const creds = integration.credenciales as any;
    
    if (!creds.bot_token) {
      return getGlobalTelegramConfig();
    }

    return {
      bot_token: creds.bot_token,
      admin_chat_id: creds.admin_chat_id || creds.chat_id
    };
  } catch (error) {
    console.error(`Error al cargar credenciales de Telegram para tenant ${tenantId}:`, error);
    return getGlobalTelegramConfig();
  }
}

/**
 * Envía un mensaje de Telegram
 */
export async function sendTelegramMessage(
  chatId: string, 
  message: string, 
  botToken?: string,
  replyMarkup?: any
): Promise<boolean> {
  try {
    let finalToken = botToken;
    
    if (!finalToken) {
      const globalConfig = getGlobalTelegramConfig();
      if (!globalConfig) {
        throw new Error('Telegram no está configurado globalmente ni se proporcionó un token.');
      }
      finalToken = globalConfig.bot_token;
    }

    const response = await fetch(`https://api.telegram.org/bot${finalToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error de Telegram API: ${errorData.description || 'Error desconocido'}`);
    }

    return true;
  } catch (error) {
    console.error('Error al enviar mensaje de Telegram:', error);
    throw error;
  }
}

/**
 * Obtiene información del bot de Telegram
 */
export async function getTelegramBotInfo(botToken?: string): Promise<any> {
  try {
    let finalToken = botToken;
    
    if (!finalToken) {
      const globalConfig = getGlobalTelegramConfig();
      if (!globalConfig) return null;
      finalToken = globalConfig.bot_token;
    }

    const response = await fetch(`https://api.telegram.org/bot${finalToken}/getMe`);
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Error al obtener información del bot de Telegram:', error);
    return null;
  }
}

/**
 * Verifica si Telegram está configurado (global o para un tenant)
 */
export async function isTelegramConfigured(tenantId?: string): Promise<boolean> {
  if (tenantId) {
    const creds = await loadTelegramCredentials(tenantId);
    return creds !== null;
  }
  
  const config = getGlobalTelegramConfig();
  return config !== null;
}
