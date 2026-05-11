export type NotificationChannelType =
  | 'telegram'
  | 'slack';

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
  botToken?: string;
  defaultChannel?: string;
  config?: Record<string, any>;
}

export const AVAILABLE_CHANNELS: ChannelConfig[] = [
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
    defaultChannel: '#general',
  },
];
