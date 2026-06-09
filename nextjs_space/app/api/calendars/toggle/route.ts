export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * PATCH /api/calendars/toggle
 * Toggles visibility of a connected calendar
 * Body: { calendarId: string, visible: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();
    const { calendarId, visible } = body;

    if (!calendarId || typeof visible !== 'boolean') {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    // Verify the calendar belongs to this user
    const cal = await prisma.connectedCalendar.findUnique({
      where: { id: calendarId },
      include: { integration: true },
    });

    if (!cal || cal.integration.userId !== userId) {
      return NextResponse.json({ error: 'Calendario no encontrado' }, { status: 404 });
    }

    await prisma.connectedCalendar.update({
      where: { id: calendarId },
      data: { visible },
    });

    return NextResponse.json({ success: true, visible });
  } catch (error: any) {
    console.error('❌ Error toggling calendar:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
