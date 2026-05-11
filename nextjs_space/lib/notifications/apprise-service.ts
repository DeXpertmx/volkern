import { prisma } from '@/lib/db';
import {
  NotificationPayload,
  NotificationResult,
  NotificationChannelType,
  ChannelConfig,
} from './types';

const APPRISE_URL = process.env.APPRISE_URL || 'https://notify.dimension.expert/notify';
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;

const CHANNEL_URLS: Record<string, string> = {
  email: 'mailto://',
  sms: 'json://sms://',
  whatsapp: 'json://whatsapp://',
  telegram: 'json://tgram://',
  slack: 'json://slack://',
  discord: 'json://discord://',
  webhook: 'json://',
};

export class AppriseService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  static async send(
    tenantId: string,
    payload: NotificationPayload
  ): Promise<NotificationResult[]> {
    const service = new AppriseService(tenantId);
    return service.sendNotification(payload);
  }

  async sendNotification(payload: NotificationPayload): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const recipient of payload.recipients) {
      const result = await this.sendWithRetry({
        ...payload,
        recipient,
      });
      results.push(result);

      await this.logNotification({
        ...payload,
        recipient,
        result,
      });
    }

    return results;
  }

  private async sendWithRetry(
    payload: NotificationPayload & { recipient: NotificationPayload['recipients'][0] }
  ): Promise<NotificationResult> {
    const maxAttempts = MAX_RETRY_ATTEMPTS;
    const baseDelay = BASE_RETRY_DELAY_MS;

    let lastError = '';
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await this.sendToApprise(payload);

        if (result.success) {
          return {
            success: true,
            channel: payload.channel,
            status: 'sent',
            externalId: result.externalId,
            attempts: attempt,
          };
        }

        lastError = result.error || 'Unknown error';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      channel: payload.channel,
      status: 'failed',
      error: lastError,
      attempts: attempt,
    };
  }

  private async sendToApprise(
    payload: NotificationPayload & { recipient: NotificationPayload['recipients'][0] }
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: this.tenantId },
        select: { subdomain: true },
      });

      if (!tenant) {
        return { success: false, error: 'Tenant not found' };
      }

      const channelUrls = await this.getChannelUrls(payload.channel);
      if (channelUrls.length === 0) {
        return { success: false, error: `No URLs configured for channel ${payload.channel}` };
      }

      const tag = `tenant_${tenant.subdomain}`;
      const urlsParam = encodeURIComponent(channelUrls.join(','));

      const url = `${APPRISE_URL}?urls=${urlsParam}&tag=${tag}`;

      const body: Record<string, any> = {
        title: payload.title,
        body: payload.body,
        type: payload.priority || 'info',
      };

      if (payload.recipient.email) {
        body.to = [payload.recipient.email];
      }
      if (payload.recipient.phone) {
        body.to = [...(body.to || []), payload.recipient.phone];
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return {
          success: true,
          externalId: `apprise_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        };
      }

      const errorText = await response.text();
      return {
        success: false,
        error: `Apprise error: ${response.status} - ${errorText}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getChannelUrls(channel: string): Promise<string[]> {
    try {
      const channelConfig = await prisma.notificationChannel.findUnique({
        where: {
          tenantId_channel: {
            tenantId: this.tenantId,
            channel,
          },
        },
      });

      if (channelConfig?.enabled && channelConfig.webhookUrl) {
        return [channelConfig.webhookUrl];
      }

      const defaultUrl = CHANNEL_URLS[channel];
      return defaultUrl ? [defaultUrl] : [];
    } catch (error) {
      console.error('[AppriseService] Error getting channel URLs:', error);
      return [];
    }
  }

  private async logNotification(
    payload: NotificationPayload & {
      recipient: NotificationPayload['recipients'][0];
      result: NotificationResult;
    }
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          tenantId: this.tenantId,
          channel: payload.channel,
          recipientType: payload.recipient.type,
          recipientId: payload.recipient.id,
          recipientEmail: payload.recipient.email,
          recipientPhone: payload.recipient.phone,
          subject: payload.title,
          body: payload.body,
          status: payload.result.status,
          priority: payload.metadata?.priority || 'normal',
          externalId: payload.result.externalId,
          errorMessage: payload.result.error,
          sentAt: payload.result.success ? new Date() : null,
        },
      });
    } catch (error) {
      console.error('[AppriseService] Error logging notification:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async getChannelConfigs(tenantId: string): Promise<ChannelConfig[]> {
    try {
      const dbChannels = await prisma.notificationChannel.findMany({
        where: { tenantId },
      });

      return dbChannels.map((ch) => ({
        channel: ch.channel as NotificationChannelType,
        name: ch.name,
        enabled: ch.enabled,
        priority: ch.priority as any,
        rateLimitPerDay: ch.rateLimitPerDay,
        retryAttempts: ch.retryAttempts,
        retryDelayMs: ch.retryDelayMs,
        timeoutMs: ch.timeoutMs,
        webhookUrl: ch.webhookUrl,
      }));
    } catch (error) {
      console.error('[AppriseService] Error getting channel configs:', error);
      return [];
    }
  }

  static async updateChannelConfig(
    tenantId: string,
    channel: NotificationChannelType,
    config: Partial<ChannelConfig>
  ): Promise<void> {
    await prisma.notificationChannel.upsert({
      where: {
        tenantId_channel: {
          tenantId,
          channel,
        },
      },
      update: {
        enabled: config.enabled,
        webhookUrl: config.webhookUrl,
        config: config.config,
      },
      create: {
        tenantId,
        channel,
        name: channel.charAt(0).toUpperCase() + channel.slice(1),
        enabled: config.enabled || false,
        priority: config.priority || 'normal',
        rateLimitPerDay: config.rateLimitPerDay || 100,
        retryAttempts: config.retryAttempts || 3,
        retryDelayMs: config.retryDelayMs || 2000,
        timeoutMs: config.timeoutMs || 30000,
        webhookUrl: config.webhookUrl,
        config: config.config,
      },
    });
  }
}

export default AppriseService;