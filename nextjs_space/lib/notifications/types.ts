export type NotificationChannelType =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'telegram'
  | 'slack'
  | 'discord'
  | 'webhook'
  | 'push';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationPayload {
  title: string;
  body: string;
  channel: NotificationChannelType;
  priority?: NotificationPriority;
  scheduledFor?: Date;
  metadata?: Record<string, any>;
  recipients: NotificationRecipient[];
}

export interface NotificationRecipient {
  type: 'user' | 'contact' | 'email' | 'phone';
  id?: string;
  email?: string;
  phone?: string;
  name?: string;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannelType;
  status: 'sent' | 'queued' | 'failed' | 'pending';
  notificationId?: string;
  externalId?: string;
  error?: string;
  attempts?: number;
}

export interface ChannelConfig {
  channel: NotificationChannelType;
  name: string;
  enabled: boolean;
  priority: NotificationPriority;
  rateLimitPerDay: number;
  retryAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
  webhookUrl?: string;
  apiKey?: string;
  apiKeyName?: string;
  config?: Record<string, any>;
}

export const AVAILABLE_CHANNELS: ChannelConfig[] = [
  {
    channel: 'email',
    name: 'Email',
    enabled: true,
    priority: 'normal',
    rateLimitPerDay: 500,
    retryAttempts: 3,
    retryDelayMs: 2000,
    timeoutMs: 30000,
  },
  {
    channel: 'sms',
    name: 'SMS',
    enabled: true,
    priority: 'high',
    rateLimitPerDay: 100,
    retryAttempts: 3,
    retryDelayMs: 3000,
    timeoutMs: 15000,
  },
  {
    channel: 'whatsapp',
    name: 'WhatsApp',
    enabled: true,
    priority: 'high',
    rateLimitPerDay: 200,
    retryAttempts: 3,
    retryDelayMs: 2000,
    timeoutMs: 20000,
  },
  {
    channel: 'telegram',
    name: 'Telegram',
    enabled: true,
    priority: 'normal',
    rateLimitPerDay: 300,
    retryAttempts: 3,
    retryDelayMs: 1000,
    timeoutMs: 15000,
  },
  {
    channel: 'slack',
    name: 'Slack',
    enabled: true,
    priority: 'normal',
    rateLimitPerDay: 100,
    retryAttempts: 3,
    retryDelayMs: 1000,
    timeoutMs: 10000,
  },
  {
    channel: 'discord',
    name: 'Discord',
    enabled: true,
    priority: 'normal',
    rateLimitPerDay: 100,
    retryAttempts: 3,
    retryDelayMs: 1000,
    timeoutMs: 10000,
  },
];
