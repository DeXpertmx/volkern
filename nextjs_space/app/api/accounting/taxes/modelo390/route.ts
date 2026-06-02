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
    const tenantId = (session.user as any).tenantId;

    const report = await TaxService.getAnnualModelo390Report(tenantId, year);

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching Modelo 390 report:', error);
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
    const { year } = body;
    const tenantId = (session.user as any).tenantId;
    const userId = session.user.id;

    await TaxService.fileModelo390Return(tenantId, year, userId);

    return NextResponse.json({ success: true, message: 'Declaración marcada como presentada' });
  } catch (error) {
    console.error('Error filing Modelo 390 return:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
