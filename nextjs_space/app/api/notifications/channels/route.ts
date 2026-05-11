export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AVAILABLE_CHANNELS } from '@/lib/notifications/types';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    return NextResponse.json({
      channels: AVAILABLE_CHANNELS.map((ch) => ({
        ...ch,
        config: undefined,
      })),
      total: AVAILABLE_CHANNELS.length,
    });
  } catch (error) {
    console.error('[Notifications/Channels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available channels' },
      { status: 500 }
    );
  }
});
