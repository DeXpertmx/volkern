export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getZadarmaBalance } from '@/lib/integrations/zadarma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { apiKey, apiSecret } = await req.json();

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'API Key y API Secret son requeridos' }, { status: 400 });
    }

    const result = await getZadarmaBalance({ apiKey, apiSecret });

    if (result.status === 'success') {
      return NextResponse.json({ 
        success: true, 
        balance: result.balance,
        currency: result.currency,
        message: `Conexión exitosa. Saldo actual: ${result.balance} ${result.currency}`
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.message || 'Credenciales inválidas o error de conexión' 
      }, { status: 400 });
    }

  } catch (error) {
    console.error('[Zadarma Test] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
