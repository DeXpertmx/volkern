export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DealCoachService } from '@/lib/sales/deal-coach-service';
import { crmAllows, getCrmEntitlements, upgradeMessage } from '@/lib/crm-entitlements';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;

    // El Deal Coach es la función de IA que separa Avanzado de Profesional.
    const ent = await getCrmEntitlements(tenantId);
    if (!crmAllows(ent, 'ai')) {
      return NextResponse.json({ error: upgradeMessage('ai', ent) }, { status: 403 });
    }

    const dealId = params.id;

    const advice = await DealCoachService.getDealAdvice(dealId, tenantId);

    return NextResponse.json(advice);

  } catch (error: any) {
    console.error('Error in Deal Coach API:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
