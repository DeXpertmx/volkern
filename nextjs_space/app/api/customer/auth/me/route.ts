import { NextRequest, NextResponse } from 'next/server';
import { CustomerAuthService } from '@/lib/auth/customer-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/auth/me
 * Returns the current authenticated customer session info.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('customer_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const session = await CustomerAuthService.validateToken(token);

    if (!session) {
      return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: 'Error al validar sesión' }, { status: 500 });
  }
}
