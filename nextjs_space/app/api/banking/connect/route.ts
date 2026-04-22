import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StripeBankingService } from '@/lib/banking/stripe-banking-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { tenantId } = await req.json();

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
    }

    // Crear sesión de Stripe Financial Connections
    const stripeSession = await StripeBankingService.createConnectSession(tenantId);

    return NextResponse.json({ 
      clientSecret: stripeSession.client_secret,
      sessionId: stripeSession.id 
    });
  } catch (error: any) {
    console.error('[BankConnect] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
