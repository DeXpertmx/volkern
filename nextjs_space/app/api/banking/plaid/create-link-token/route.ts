export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PlaidBankingService } from '@/lib/banking/plaid-banking-service';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;
    const linkToken = await PlaidBankingService.createLinkToken(session.user.id, tenantId);

    return NextResponse.json({ linkToken });
  } catch (error) {
    console.error('Error creating link token:', error);
    return NextResponse.json({ error: 'Error al crear sesión bancaria' }, { status: 500 });
  }
}
