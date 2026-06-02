export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TaxService } from '@/lib/accounting/tax-service';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const quarter = parseInt(searchParams.get('quarter') || Math.ceil((new Date().getMonth() + 1) / 3).toString());
    const tenantId = (session.user as any).tenantId;

    const report = await TaxService.getQuarterlyIrpfReport(tenantId, year, quarter);

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching IRPF report:', error);
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
    const { year, quarter } = body;
    const tenantId = (session.user as any).tenantId;

    await TaxService.fileIrpfReturn(tenantId, year, quarter);

    return NextResponse.json({ success: true, message: 'Declaración marcada como presentada' });
  } catch (error) {
    console.error('Error filing IRPF return:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
