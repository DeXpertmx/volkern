export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { FiscalCalendarService } from '@/lib/accounting/fiscal-calendar-service';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const tenantId = (session.user as any).tenantId;

    const summary = await FiscalCalendarService.getCalendarSummary(tenantId, year);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error fetching fiscal calendar:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { action, model, periodLabel } = body;
    const tenantId = (session.user as any).tenantId;

    if (action === 'notify') {
      const result = await FiscalCalendarService.scanAndNotify(tenantId);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'mark_notified') {
      await FiscalCalendarService.markNotified(tenantId, model, periodLabel);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    console.error('Error in fiscal calendar action:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
