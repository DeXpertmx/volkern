import { NextRequest, NextResponse } from 'next/server';
import { PortalService } from '@/lib/sovereignty/portal-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/order/[token]
 * Public access point for customers to view their order status and traceability.
 */
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ token: string }> }
) {
  const params = await paramsPromise;
  try {
    const token = params.token;
    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    const orderData = await PortalService.getOrderDataByToken(token);

    if (!orderData) {
      return NextResponse.json({ error: 'Pedido no encontrado o acceso revocado' }, { status: 404 });
    }

    return NextResponse.json({ order: orderData });
  } catch (error) {
    console.error('Error in portal order API:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
