export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/calendars
 * Lists all connected calendars for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
      select: { id: true, activo: true },
    });

    if (!integration) {
      return NextResponse.json({ calendars: [], connected: false });
    }

    const calendars = await prisma.connectedCalendar.findMany({
      where: {
        integrationId: integration.id,
        activo: true,
      },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        calendarId: true,
        nombre: true,
        color: true,
        visible: true,
        ultimaSync: true,
      },
    });

    return NextResponse.json({
      calendars,
      connected: integration.activo,
    });
  } catch (error: any) {
    console.error('❌ Error listing calendars:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
