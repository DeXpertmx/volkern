/**
 * Notification Layer - Sistema unificado de notificaciones
 * 
 * Canales soportados:
 * - Email (Resend)
 * - WhatsApp (Evolution API)
 * - Telegram
 * - Push notifications (web)
 * - In-app notifications
 * - Webhooks externos
 */

import prisma from '@/lib/db';
import { loadTelegramCredentials, sendTelegramMessage } from '@/lib/telegram';
import { SkillContext } from './context';
import { skillsLogger } from './observability';

// ============================================================
// TIPOS
// ============================================================

export type NotificationChannel = 
  | 'email'
  | 'whatsapp'
  | 'telegram'
  | 'push'
  | 'in_app'
  | 'webhook';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationStatus = 
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface NotificationRecipient {
  type: 'user' | 'lead' | 'contact' | 'external';
  id?: string;           // ID interno si existe
  email?: string;
  phone?: string;
  telegramChatId?: string;
  webhookUrl?: string;
  name?: string;
}

export interface NotificationContent {
  subject?: string;      // Para email
  title?: string;        // Para push/in-app
  body: string;          // Contenido principal
  html?: string;         // HTML para email
  template?: string;     // Nombre de template
  variables?: Record<string, unknown>; // Variables para template
  attachments?: Array<{
    filename: string;
    content?: string;
    url?: string;
  }>;
  actions?: Array<{      // Botones/acciones
    label: string;
    url?: string;
    action?: string;
  }>;
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>; // inline_keyboard crudo de Telegram (callback_data)
}

export interface NotificationOptions {
  channel: NotificationChannel;
  priority?: NotificationPriority;
  scheduledFor?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  trackDelivery?: boolean;
  trackRead?: boolean;
  groupKey?: string;     // Para agrupar notificaciones
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  externalId?: string;   // ID del proveedor externo
  error?: string;
  sentAt?: Date;
}

// ============================================================
// NOTIFICATION SERVICE
// ============================================================

export class NotificationService {
  
  /**
   * Enviar notificación
   */
  async send(
    recipient: NotificationRecipient,
    content: NotificationContent,
    options: NotificationOptions,
    context: any
  ): Promise<NotificationResult> {
    const ctx = context instanceof SkillContext ? context : new SkillContext(context);
    const logger = skillsLogger.withContext(ctx);
    
    logger.info(`Sending ${options.channel} notification`, {
      recipientType: recipient.type,
      recipientId: recipient.id,
      priority: options.priority,
    });
    
    // Si el canal es email y el destinatario es admin/user, o si es un evento crítico,
    // intentar enviar también por Telegram si está conectado
    if (options.channel === 'email' && (recipient.type === 'user' || options.priority === 'high' || options.priority === 'urgent')) {
      this.maybeSendToTelegram(recipient, content, context).catch(err => 
        logger.error('Error in auto-telegram dispatch', err)
      );
    }
    
    try {
      // Crear registro de notificación
      const notification = await this.createNotificationRecord(
        recipient,
        content,
        options,
        context
      );
      
      // Si está programada, no enviar ahora
      if (options.scheduledFor && options.scheduledFor > new Date()) {
        return {
          success: true,
          notificationId: notification.id,
          channel: options.channel,
          status: 'queued',
        };
      }
      
      // Enviar según canal
      const result = await this.dispatchToChannel(
        recipient,
        content,
        options,
        context
      );
      
      // Actualizar registro
      await this.updateNotificationStatus(
        notification.id,
        result.status,
        result.externalId,
        result.error
      );
      
      return {
        ...result,
        notificationId: notification.id,
      };
      
    } catch (error) {
      logger.error('Failed to send notification', error as Error);
      return {
        success: false,
        channel: options.channel,
        status: 'failed',
        error: String(error),
      };
    }
  }
  
  /**
   * Enviar a múltiples destinatarios
   */
  async sendBulk(
    recipients: NotificationRecipient[],
    content: NotificationContent,
    options: NotificationOptions,
    context: SkillContext
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    
    // Procesar en batches de 10
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(r => this.send(r, content, options, context))
      );
      results.push(...batchResults);
    }
    
    return results;
  }
  
  /**
   * Enviar por múltiples canales
   */
  async sendMultiChannel(
    recipient: NotificationRecipient,
    content: NotificationContent,
    channels: NotificationChannel[],
    context: SkillContext,
    priority?: NotificationPriority
  ): Promise<Record<NotificationChannel, NotificationResult>> {
    const results: Record<string, NotificationResult> = {};
    
    for (const channel of channels) {
      results[channel] = await this.send(
        recipient,
        content,
        { channel, priority },
        context
      );
    }
    
    return results as Record<NotificationChannel, NotificationResult>;
  }
  
  // ============================================================
  // CHANNEL DISPATCHERS
  // ============================================================
  
  private async dispatchToChannel(
    recipient: NotificationRecipient,
    content: NotificationContent,
    options: NotificationOptions,
    context: SkillContext
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    switch (options.channel) {
      case 'email':
        return this.sendEmail(recipient, content, context);
      case 'whatsapp':
        return this.sendWhatsApp(recipient, content, context);
      case 'telegram':
        return this.sendTelegram(recipient, content, context);
      case 'in_app':
        return this.sendInApp(recipient, content, context);
      case 'webhook':
        return this.sendWebhook(recipient, content, options, context);
      case 'push':
        return this.sendPush(recipient, content, context);
      default:
        return {
          success: false,
          channel: options.channel,
          status: 'failed',
          error: `Unknown channel: ${options.channel}`,
        };
    }
  }
  
  private async sendEmail(
    recipient: NotificationRecipient,
    content: NotificationContent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: SkillContext
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    try {
      if (!recipient.email) {
        throw new Error('Email address required');
      }

      // Resolve tenant subdomain/name for correct FROM address
      const tenant = await prisma.tenant.findUnique({
        where: { id: _context.tenantId },
        select: { subdomain: true, nombre: true },
      });

      const tenantSubdomain = tenant?.subdomain ?? undefined;
      const tenantName = tenant?.nombre ?? undefined;
      const subject = content.subject || 'Notificación';
      const html = content.html || content.body;

      // 1. Try AWS SES / tenant SMTP first
      const { sendEmail: sendSesEmail } = await import('@/lib/ses-email');
      let result = await sendSesEmail({
        to: recipient.email,
        subject,
        html,
        text: content.body,
        tenantSubdomain,
        tenantId: _context.tenantId,
      });

      // Resend solo es fallback cuando el tenant no tiene SMTP propio.
      // Si está configurado, sus avisos nunca deben salir por otro proveedor.
      if (!result.success && process.env.RESEND_API_KEY && !result.tenantSmtpConfigured) {
        console.warn('[NotificationLayer] SMTP/SES falló sin SMTP tenant, probando Resend:', result.error);
        const { sendEmail: sendResendEmail } = await import('@/lib/resend-email');
        result = {
          ...(await sendResendEmail({
            to: recipient.email,
            subject,
            html,
            text: content.body,
            tenantSubdomain,
            tenantName,
          })),
          tenantSmtpConfigured: false,
        };
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        channel: 'email',
        status: 'sent',
        externalId: result.messageId,
        sentAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        channel: 'email',
        status: 'failed',
        error: String(error),
      };
    }
  }
  
  private async sendWhatsApp(
    recipient: NotificationRecipient,
    content: NotificationContent,
    context: SkillContext
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    try {
      if (!recipient.phone) {
        throw new Error('Phone number required');
      }
      
      const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
      
      const result = await sendWhatsAppMessage(
        recipient.phone,
        content.body,
        context.tenantId
      );
      
      return {
        success: result.success,
        channel: 'whatsapp',
        status: result.success ? 'sent' : 'failed',
        externalId: result.messageId,
        error: result.error,
        sentAt: result.success ? new Date() : undefined,
      };
    } catch (error) {
      return {
        success: false,
        channel: 'whatsapp',
        status: 'failed',
        error: String(error),
      };
    }
  }
  
  private async sendTelegram(
    recipient: NotificationRecipient,
    content: NotificationContent,
    context: SkillContext
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    try {
      const creds = await (loadTelegramCredentials as any)(context.tenantId);
      
      // Fallback: si no hay admin_chat_id, buscar el primer usuario del tenant
      if (!creds?.admin_chat_id && context.tenantId) {
        const { prisma } = await import('@/lib/db');
        const firstUser = await prisma.user.findFirst({
          where: { tenantId: context.tenantId },
          select: { telefono: true }
        });
        if (firstUser?.telefono) {
          // Usar el teléfono como fallback (no es ideal pero funciona)
          console.log('[NotificationLayer] Usando teléfono del usuario como fallback para Telegram');
        }
      }
      
      // Determinar el chatId: 1. Del destinatario, 2. De la integración del tenant (admin)
      const chatId = recipient.telegramChatId || creds?.admin_chat_id;
      
      if (!chatId) {
        throw new Error('Telegram chat ID required (not in recipient nor in tenant config)');
      }

      // Convertir a inline_keyboard de Telegram. `inlineKeyboard` (botones con
      // callback_data, p.ej. acciones de tarea) tiene prioridad sobre `actions`
      // (botones de URL) porque son botones accionables por el usuario.
      let replyMarkup = undefined;
      if (content.inlineKeyboard && content.inlineKeyboard.length > 0) {
        replyMarkup = { inline_keyboard: content.inlineKeyboard };
      } else if (content.actions && content.actions.length > 0) {
        replyMarkup = {
          inline_keyboard: [
            content.actions.map(action => ({
              text: action.label,
              url: action.url
            }))
          ]
        };
      }
      
      const sendResult = await sendTelegramMessage(
        chatId,
        content.body,
        creds?.bot_token,
        replyMarkup
      );
      
      return {
        success: sendResult as any,
        channel: 'telegram',
        status: sendResult ? 'sent' : 'failed',
        sentAt: sendResult ? new Date() : undefined,
      } as any;
    } catch (error) {
      return {
        success: false,
        channel: 'telegram',
        status: 'failed',
        error: String(error),
      };
    }
  }

  /**
   * Intenta enviar a Telegram si la integración está activa para el tenant
   */
  private async maybeSendToTelegram(
    recipient: NotificationRecipient,
    content: NotificationContent,
    context: SkillContext
  ): Promise<void> {
    try {
      const creds = await (loadTelegramCredentials as any)(context.tenantId);
      if (creds && (recipient.telegramChatId || creds.admin_chat_id)) {
        await this.sendTelegram(recipient, content, context);
      }
    } catch (error) {
      console.error('[NotificationLayer] Error in maybeSendToTelegram:', error);
    }
  }
  
  private async sendInApp(
    recipient: NotificationRecipient,
    content: NotificationContent,
    context: SkillContext
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    try {
      if (!recipient.id) {
        throw new Error('User ID required for in-app notifications');
      }
      
      // Crear notificación in-app en la base de datos
      const notification = await prisma.inAppNotification.create({
        data: {
          tenantId: context.tenantId,
          userId: recipient.id,
          title: content.title || 'Notificación',
          body: content.body,
          type: 'info',
          read: false,
          data: content.variables ? JSON.parse(JSON.stringify(content.variables)) : undefined,
        },
      });
      
      return {
        success: true,
        channel: 'in_app',
        status: 'delivered',
        externalId: notification.id,
        sentAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        channel: 'in_app',
        status: 'failed',
        error: String(error),
      };
    }
  }
  
  private async sendWebhook(
    recipient: NotificationRecipient,
    content: NotificationContent,
    options: NotificationOptions,
    context: SkillContext
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    try {
      if (!recipient.webhookUrl) {
        throw new Error('Webhook URL required');
      }
      
      const response = await fetch(recipient.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Volkern-Tenant': context.tenantId,
          'X-Volkern-Correlation-Id': context.correlationId,
        },
        body: JSON.stringify({
          type: 'notification',
          content,
          metadata: options.metadata,
          timestamp: new Date().toISOString(),
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }
      
      return {
        success: true,
        channel: 'webhook',
        status: 'delivered',
        sentAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        channel: 'webhook',
        status: 'failed',
        error: String(error),
      };
    }
  }
  
  private async sendPush(
    recipient: NotificationRecipient,
    content: NotificationContent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: SkillContext
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    // Push notifications requieren configuración adicional (Firebase, etc.)
    // Por ahora, retornar no implementado
    return {
      success: false,
      channel: 'push',
      status: 'failed',
      error: 'Push notifications not yet implemented',
    };
  }
  
  // ============================================================
  // DATABASE HELPERS
  // ============================================================
  
  private async createNotificationRecord(
    recipient: NotificationRecipient,
    content: NotificationContent,
    options: NotificationOptions,
    context: SkillContext
  ): Promise<{ id: string }> {
    try {
      const record = await prisma.notificationLog.create({
        data: {
          tenantId: context.tenantId,
          channel: options.channel,
          recipientType: recipient.type,
          recipientId: recipient.id || null,
          recipientEmail: recipient.email || null,
          recipientPhone: recipient.phone || null,
          subject: content.subject || null,
          body: content.body,
          status: 'pending',
          priority: options.priority || 'normal',
          scheduledFor: options.scheduledFor || null,
          metadata: options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : undefined,
          correlationId: context.correlationId,
        },
      });
      return { id: record.id };
    } catch {
      // Si la tabla no existe, generar ID temporal
      return { id: `temp_${Date.now()}` };
    }
  }
  
  private async updateNotificationStatus(
    notificationId: string,
    status: NotificationStatus,
    externalId?: string,
    error?: string
  ): Promise<void> {
    if (notificationId.startsWith('temp_')) return;
    
    try {
      await prisma.notificationLog.update({
        where: { id: notificationId },
        data: {
          status,
          externalId: externalId || null,
          errorMessage: error || null,
          sentAt: status === 'sent' || status === 'delivered' ? new Date() : null,
        },
      });
    } catch {
      // Ignorar errores de actualización
    }
  }
  
  // ============================================================
  // QUERIES
  // ============================================================
  
  async getNotificationHistory(
    tenantId: string,
    filters?: {
      channel?: NotificationChannel;
      status?: NotificationStatus;
      recipientId?: string;
      since?: Date;
      limit?: number;
    }
  ): Promise<Array<{
    id: string;
    channel: string;
    status: string;
    recipientType: string;
    subject: string | null;
    sentAt: Date | null;
    createdAt: Date;
  }>> {
    try {
      return await prisma.notificationLog.findMany({
        where: {
          tenantId,
          ...(filters?.channel && { channel: filters.channel }),
          ...(filters?.status && { status: filters.status }),
          ...(filters?.recipientId && { recipientId: filters.recipientId }),
          ...(filters?.since && { createdAt: { gte: filters.since } }),
        },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 100,
        select: {
          id: true,
          channel: true,
          status: true,
          recipientType: true,
          subject: true,
          sentAt: true,
          createdAt: true,
        },
      });
    } catch {
      return [];
    }
  }
  
  async getNotificationStats(
    tenantId: string,
    periodDays: number = 30
  ): Promise<{
    total: number;
    byChannel: Record<string, number>;
    byStatus: Record<string, number>;
    successRate: number;
  }> {
    try {
      const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      
      const notifications = await prisma.notificationLog.findMany({
        where: {
          tenantId,
          createdAt: { gte: since },
        },
        select: {
          channel: true,
          status: true,
        },
      });
      
      const byChannel: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      let successCount = 0;
      
      for (const n of notifications) {
        byChannel[n.channel] = (byChannel[n.channel] || 0) + 1;
        byStatus[n.status] = (byStatus[n.status] || 0) + 1;
        if (n.status === 'sent' || n.status === 'delivered' || n.status === 'read') {
          successCount++;
        }
      }
      
      return {
        total: notifications.length,
        byChannel,
        byStatus,
        successRate: notifications.length > 0 
          ? (successCount / notifications.length) * 100 
          : 0,
      };
    } catch {
      return {
        total: 0,
        byChannel: {},
        byStatus: {},
        successRate: 0,
      };
    }
  }
}

// Singleton
export const notificationService = new NotificationService();

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Enviar notificación rápida por email
 */
export async function notifyByEmail(
  email: string,
  subject: string,
  body: string,
  context: SkillContext
): Promise<NotificationResult> {
  return notificationService.send(
    { type: 'external', email },
    { subject, body },
    { channel: 'email' },
    context
  );
}

/**
 * Enviar notificación rápida por WhatsApp
 */
export async function notifyByWhatsApp(
  phone: string,
  message: string,
  context: SkillContext
): Promise<NotificationResult> {
  return notificationService.send(
    { type: 'external', phone },
    { body: message },
    { channel: 'whatsapp' },
    context
  );
}

/**
 * Enviar notificación rápida por Telegram al admin del tenant.
 * `inlineKeyboard` opcional: filas de botones inline con callback_data
 * (p.ej. buildTaskButtonsMarkup(...).inline_keyboard) para mensajes outbound
 * del cron que no pasan por el webhook.
 */
export async function notifyByTelegram(
  message: string,
  context: SkillContext,
  inlineKeyboard?: NotificationContent['inlineKeyboard']
): Promise<NotificationResult> {
  return notificationService.send(
    { type: 'external' },
    { body: message, inlineKeyboard },
    { channel: 'telegram' },
    context
  );
}

/**
 * Enviar notificación in-app a usuario
 */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  context: any
): Promise<NotificationResult | Record<NotificationChannel, NotificationResult>> {
  // 1. Obtener datos del usuario para ver canales disponibles
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { metadata: true, email: true, telefono: true }
  });

  const metadata = (user?.metadata as any) || {};
  const channels: NotificationChannel[] = ['in_app'];

  // Si tiene Telegram configurado en metadata, añadirlo
  if (metadata.telegram_chat_id) {
    channels.push('telegram');
  }

  // Si no tiene telegram pero el contexto pide urgencia, podríamos añadir email,
  // pero mantendremos la lógica simple solicitada: In-App + Telegram.

  if (channels.length > 1) {
    return notificationService.sendMultiChannel(
      { 
        type: 'user', 
        id: userId, 
        email: user?.email || undefined, 
        phone: user?.telefono || undefined,
        telegramChatId: metadata.telegram_chat_id 
      },
      { title, body },
      channels,
      context,
      'high'
    );
  }

  return notificationService.send(
    { type: 'user', id: userId },
    { title, body },
    { channel: 'in_app' },
    context
  );
}

/**
 * Notificar a lead por su canal disponible (WhatsApp primero, luego email)
 */
export async function notifyLead(
  leadId: string,
  content: NotificationContent,
  context: SkillContext
): Promise<NotificationResult[]> {
  // Obtener datos del lead
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      email: true,
      telefono: true,
    },
  });
  
  if (!lead) {
    return [{
      success: false,
      channel: 'email',
      status: 'failed',
      error: 'Lead not found',
    }];
  }
  
  const results: NotificationResult[] = [];
  
  // Priorizar WhatsApp si hay teléfono, sino email
  if (lead.telefono) {
    results.push(await notificationService.send(
      { type: 'lead', id: leadId, phone: lead.telefono },
      content,
      { channel: 'whatsapp' },
      context
    ));
  } else if (lead.email) {
    results.push(await notificationService.send(
      { type: 'lead', id: leadId, email: lead.email },
      content,
      { channel: 'email' },
      context
    ));
  }
  
  return results;
}
