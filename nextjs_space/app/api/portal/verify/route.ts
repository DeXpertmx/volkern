import { NextRequest, NextResponse } from 'next/server';
import { PortalService } from '@/lib/sovereignty/portal-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/verify
 * Public verification engine for hashes.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, hash } = body;

    if (!type || !id || !hash) {
      return NextResponse.json({ error: 'Faltan parámetros de verificación' }, { status: 400 });
    }

    const result = await PortalService.verifyIntegrity(type, id, hash);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in portal verify API:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
