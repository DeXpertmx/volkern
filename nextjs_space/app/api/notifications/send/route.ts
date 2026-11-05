export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AppriseService } from '@/lib/notifications/apprise-service';
import { NotificationPayload } from '@/lib/notifications/types';

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const body = await req.json();
    const { title, body: messageBody, channel, priority, scheduledFor, metadata, recipients } = body;

    if (!title || !messageBody || !channel || !recipients || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: title, body, channel, recipients' },
        { status: 400 }
      );
    }

    const payload: NotificationPayload = {
      title,
      body: messageBody,
      channel,
      priority: priority || 'normal',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      metadata,
      recipients,
    };

    const results = await AppriseService.send(auth.tenant?.id!, payload);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: failureCount === 0,
      message: `Notifications sent: ${successCount} successful, ${failureCount} failed`,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
      },
    });
  } catch (error) {
    console.error('[Notifications/Send] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send notifications', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}, ['notifications:write']);
