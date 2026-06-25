import { prisma } from '@/lib/db';
import { AppriseService } from '@/lib/notifications/apprise-service';
import { NotificationPayload } from '@/lib/notifications/types';

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

interface UserWithEmail {
  id: string;
  email?: string | null;
  telefono?: string | null;
  tenantId: string;
}

async function getUserWithContact(userId: string): Promise<UserWithEmail | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      telefono: true,
      tenantId: true
    }
  }) as Promise<UserWithEmail | null>;
}

export async function sendPushNotification(userId: string, payload: PushNotificationPayload) {
  try {
    const user = await getUserWithContact(userId);
    if (!user?.tenantId) {
      return { success: false, error: 'User or tenant not found' };
    }

    const tenantId = user.tenantId;

    await prisma.inAppNotification.create({
      data: {
        userId,
        tenantId,
        title: payload.title,
        body: payload.body,
        type: payload.tag || 'info',
        actionUrl: payload.url,
      }
    });

    const channelConfig = await AppriseService.getChannelConfigs(tenantId);
    const enabledChannel = channelConfig.find(c => c.enabled);

    if (!enabledChannel) {
      console.warn(`[PushNotification] No enabled channel for tenant ${tenantId}`);
      return { success: true, inAppOnly: true };
    }

    const recipients: NotificationPayload['recipients'] = [];
    
    if (user.email) {
      recipients.push({ type: 'email', email: user.email });
    }
    if (user.telefono) {
      recipients.push({ type: 'phone', phone: user.telefono });
    }

    if (recipients.length === 0) {
      return { success: true, inAppOnly: true, error: 'No contact info' };
    }

    const notificationPayload: NotificationPayload = {
      title: payload.title,
      body: payload.body,
      channel: enabledChannel.channel as any,
      priority: payload.priority || 'normal',
      metadata: { url: payload.url, tag: payload.tag, ...payload.data },
      recipients,
    };

    const results = await AppriseService.send(tenantId, notificationPayload);
    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount > 0,
      inApp: true,
      external: successCount,
      results
    };
  } catch (error: any) {
    console.error('[PushNotification] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function notifyAdminsPush(
  payload: PushNotificationPayload & { data?: { url?: string } },
  tenantId: string
) {
  try {
    const finalPayload = {
      ...payload,
      url: payload.url || payload.data?.url
    };

    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        role: { nombre: 'admin' }
      },
      select: { id: true }
    });

    if (!admins.length) return { success: false, error: 'No admins found' };

    const results = await Promise.allSettled(
      admins.map(admin => sendPushNotification(admin.id, finalPayload))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;

    return { success: true, count: admins.length, sent: successCount };
  } catch (error: any) {
    console.error('[notifyAdminsPush] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function broadcastPushNotification(tenantId: string, payload: PushNotificationPayload) {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId, estado: 'activo' },
      select: { id: true }
    });

    const results = await Promise.allSettled(
      users.map(user => sendPushNotification(user.id, payload))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;

    return { success: true, count: users.length, sent: successCount };
  } catch (error: any) {
    console.error('[broadcastPushNotification] Error:', error);
    return { success: false, error: error.message };
  }
}