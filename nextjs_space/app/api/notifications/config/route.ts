export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AppriseService } from '@/lib/notifications/apprise-service';
import { NotificationChannelType } from '@/lib/notifications/types';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const channelConfigs = await AppriseService.getChannelConfigs(auth.tenant?.id!);

    return NextResponse.json({
      channels: channelConfigs,
    });
  } catch (error) {
    console.error('[Notifications/Config] Error fetching config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch channel configuration' },
      { status: 500 }
    );
  }
});

export const PUT = withTenantAuth(async (req, auth) => {
  try {
    const body = await req.json();
    const { channel, config } = body;

    if (!channel || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: channel, config' },
        { status: 400 }
      );
    }

    await AppriseService.updateChannelConfig(
      auth.tenant?.id!,
      channel as NotificationChannelType,
      config
    );

    const updatedConfigs = await AppriseService.getChannelConfigs(auth.tenant?.id!);
    const updatedChannel = updatedConfigs.find((c) => c.channel === channel);

    return NextResponse.json({
      success: true,
      channel: updatedChannel,
    });
  } catch (error) {
    console.error('[Notifications/Config] Error updating config:', error);
    return NextResponse.json(
      { error: 'Failed to update channel configuration' },
      { status: 500 }
    );
  }
});
