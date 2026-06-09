export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAuthenticatedClient } from '@/lib/google-calendar';
import { google } from 'googleapis';

/**
 * POST /api/calendars/events
 * Fetches events from visible connected calendars within a date range
 * Body: { calendarIds: string[], timeMin: string, timeMax: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();
    const { calendarIds, timeMin, timeMax } = body;

    if (!calendarIds || !Array.isArray(calendarIds) || calendarIds.length === 0) {
      return NextResponse.json({ events: [] });
    }

    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: 'Fechas requeridas' }, { status: 400 });
    }

    // Get the integration (user must have Google Calendar connected)
    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
      include: {
        connectedCalendars: {
          where: {
            id: { in: calendarIds },
            visible: true,
            activo: true,
          },
        },
      },
    });

    if (!integration) {
      return NextResponse.json({ events: [] });
    }

    // Get authenticated client
    const oauth2Client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Fetch events from each calendar in parallel
    const eventsPromises = integration.connectedCalendars.map(async (cal) => {
      try {
        const response = await calendar.events.list({
          calendarId: cal.calendarId,
          timeMin: timeMin,
          timeMax: timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
        });

        return (response.data.items || [])
          .filter(event => event.start?.dateTime && event.end?.dateTime && event.status !== 'cancelled')
          .map(event => ({
            id: `gcal-${event.id!}`,
            title: event.summary || '(Sin título)',
            start: new Date(event.start!.dateTime!).toISOString(),
            end: new Date(event.end!.dateTime!).toISOString(),
            calendarName: cal.nombre,
            calendarColor: cal.color,
          }));
      } catch (error: any) {
        console.error(`❌ Error fetching from calendar ${cal.nombre}:`, error.message);
        return [];
      }
    });

    const allEvents = (await Promise.all(eventsPromises)).flat();

    return NextResponse.json({ events: allEvents });
  } catch (error: any) {
    console.error('❌ Error fetching calendar events:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
