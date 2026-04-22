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

    const { publicToken, metadata } = await req.json();
    const tenantId = (session.user as any).tenantId;

    if (!publicToken) {
      return NextResponse.json({ error: 'Falta public_token' }, { status: 400 });
    }

    const connection = await PlaidBankingService.exchangePublicToken(publicToken, tenantId, metadata);

    return NextResponse.json({ success: true, connectionId: connection.id });
  } catch (error) {
    console.error('Error exchanging token:', error);
    return NextResponse.json({ error: 'Error al vincular el banco' }, { status: 500 });
  }
}
