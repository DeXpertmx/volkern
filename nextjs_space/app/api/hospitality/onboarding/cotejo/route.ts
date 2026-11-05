export const dynamic = 'force-dynamic';

/**
 * GET /api/hospitality/onboarding/cotejo — cotejo de precios del peaje.
 *
 * Para la revisión del paso 6 (vínculos automáticos sin confirmar): compara lo
 * que el canal vendió en la reserva que trajo el vínculo contra la tarifa que
 * tenemos configurada para esa unidad (reglas en lib/hospitality/cotejo-vinculo.ts).
 * Solo lectura: confirmar o deshacer sigue siendo un POST del paso 6.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { cotejarVinculosPropiedad } from '@/lib/hospitality/cotejo-vinculo';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
    // Misma capacidad que el resto del wizard (§27): quien configura canales
    // es quien decide si el precio con el que el canal vendió es aceptable.
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const propertyId = req.nextUrl.searchParams.get('propertyId')?.trim() ?? '';
    if (!propertyId) {
      return NextResponse.json({ ok: false, error: 'propertyId es requerido' }, { status: 400 });
    }

    const cotejo = await cotejarVinculosPropiedad({ tenantId, propertyId });
    if (!cotejo.ok) {
      return NextResponse.json({ ok: false, error: 'Propiedad no encontrada en este tenant' }, { status: 404 });
    }

    return NextResponse.json(cotejo);
  } catch (error) {
    console.error('Error en el cotejo de precios:', error);
    return NextResponse.json({ ok: false, error: 'Error al cotejar los precios' }, { status: 500 });
  }
}
