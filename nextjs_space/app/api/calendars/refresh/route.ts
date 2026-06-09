export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { refreshConnectedCalendarsList } from '@/lib/google-calendar';

/**
 * POST /api/calendars/refresh
 * Refreshes the list of connected calendars from Google Calendar API
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    const result = await refreshConnectedCalendarsList(userId);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('❌ Error refreshing calendar list:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
