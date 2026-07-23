import { prisma } from '@/lib/db';
import { AppriseService } from '@/lib/notifications/apprise-service';
import { NotificationPayload } from '@/lib/notifications/types';
import { sendNotification as sendOneSignal } from '@/lib/onesignal';
import webPush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@volkern.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

interface UserWithMeta {
  id: string;
  email?: string | null;
  telefono?: string | null;
  tenantId: string;
  metadata: Record<string, any> | null;
}

async function getUserWithMeta(userId: string): Promise<UserWithMeta | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      telefono: true,
      tenantId: true,
      metadata: true,
    }
  });
  if (!user) return null;
  return {
    ...user,
    metadata: (user.metadata as Record<string, any>) || null,
  };
}

async function sendExpoPush(expoPushToken: string, payload: PushNotificationPayload) {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: expoPushToken,
        title: payload.title,
        body: payload.body,
        data: { url: payload.url, type: payload.tag, ...payload.data },
        ...(payload.priority === 'urgent' ? { priority: 'high' } : {}),
      }),
    });
    return { success: res.ok };
  } catch (e) {
    console.error('[ExpoPush] Error:', e);
    return { success: false };
  }
}

async function sendWebPush(subscription: Record<string, any>, payload: PushNotificationPayload) {
  try {
    await webPush.sendNotification(subscription as any, JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon.png',
      data: { url: payload.url, type: payload.tag, ...payload.data },
      tag: payload.tag || 'default',
    }));
    return { success: true };
  } catch (e: any) {
    if (e.statusCode === 410) {
      return { success: false, expired: true };
    }
    console.error('[WebPush] Error:', e);
    return { success: false };
  }
}

export async function sendPushNotification(userId: string, payload: PushNotificationPayload) {
  try {
    const user = await getUserWithMeta(userId);
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

    const results: any[] = [];

    // 1. Web Push (desktop browser via VAPID)
    const webPushSub = user.metadata?.webPushSubscription as Record<string, any> | undefined;
    if (webPushSub) {
      const wpResult = await sendWebPush(webPushSub, payload);
      results.push({ channel: 'webpush', ...wpResult });
    }

    // 2. Expo Push (mobile app via expo-notifications)
    const expoToken = user.metadata?.expoPushToken as string | undefined;
    if (expoToken) {
      const expoResult = await sendExpoPush(expoToken, payload);
      results.push({ channel: 'expo', ...expoResult });
    }

    // 3. OneSignal
    const oneSignalResult = await sendOneSignal(
      payload.title,
      payload.body,
      [userId],
      tenantId
    );
    results.push({ channel: 'onesignal', ...oneSignalResult });

    // 4. Apprise (Telegram/Slack)
    const channelConfig = await AppriseService.getChannelConfigs(tenantId);
    const enabledChannel = channelConfig.find(c => c.enabled);

    if (enabledChannel) {
      const recipients: NotificationPayload['recipients'] = [];
      if (user.email) recipients.push({ type: 'email', email: user.email });
      if (user.telefono) recipients.push({ type: 'phone', phone: user.telefono });

      if (recipients.length > 0) {
        const notificationPayload: NotificationPayload = {
          title: payload.title,
          body: payload.body,
          channel: enabledChannel.channel as any,
          priority: payload.priority || 'normal',
          metadata: { url: payload.url, tag: payload.tag, ...payload.data },
          recipients,
        };
        const appriseResults = await AppriseService.send(tenantId, notificationPayload);
        results.push(...appriseResults.map((r: any) => ({ channel: 'apprise', ...r })));
      }
    }

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