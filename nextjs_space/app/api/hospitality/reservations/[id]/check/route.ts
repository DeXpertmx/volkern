export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { performCheckOperation } from '@/lib/hospitality/operations';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

// POST /api/hospitality/reservations/[id]/check
// Body: { operacion: 'checkin' | 'checkout' }
export async function POST(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'operaciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const { operacion } = body || {};

    if (operacion !== 'checkin' && operacion !== 'checkout') {
      return NextResponse.json(
        { error: "operacion debe ser 'checkin' o 'checkout'" },
        { status: 400 }
      );
    }

    const result = await performCheckOperation(auth.tenant!.id, id, operacion);
    if (!result.ok) {
      const status = result.error?.includes('no encontrada') ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error en operación de check:', error);
    return NextResponse.json({ error: 'Error al realizar la operación' }, { status: 500 });
  }
}