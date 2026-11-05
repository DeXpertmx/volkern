import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const { userId, permission, pushToken, platform, subscription } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { metadata: true }
    });

    const currentMetadata = (user?.metadata as Record<string, any>) || {};

    const update: Record<string, any> = {
      ...currentMetadata,
      pushNotificationPermission: permission,
      pushNotificationsEnabled: permission === 'granted',
    };

    if (pushToken) {
      update.expoPushToken = pushToken;
      update.pushPlatform = platform;
    }

    if (subscription) {
      try {
        update.webPushSubscription = typeof subscription === 'string'
          ? JSON.parse(subscription)
          : subscription;
      } catch {
        update.webPushSubscription = subscription;
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { metadata: update }
    });

    return NextResponse.json({ success: true, permission });
  } catch (error) {
    console.error('[PushSubscription] Error:', error);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}, ['users:write']);