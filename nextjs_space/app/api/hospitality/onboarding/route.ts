export const dynamic = 'force-dynamic';

/**
 * GET /api/hospitality/onboarding?propertyId=...
 *
 * Estado del onboarding guiado de propiedad (plan maestro §31).
 * Sin `propertyId` devuelve solo la lista de propiedades para elegir.
 * Con `propertyId` devuelve el snapshot completo: pasos, unidades, mapping,
 * conectividad y resultado de las pruebas. Todo derivado de datos reales.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { loadOnboardingSnapshot } from '@/lib/hospitality/onboarding-status';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');

    const propiedades = await prisma.hospitalityProperty.findMany({
      where: { tenantId },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        ciudad: true,
        pais: true,
        estado: true,
        _count: { select: { units: true } },
      },
    });

    if (!propertyId) {
      return NextResponse.json({ propiedades, onboarding: null });
    }

    const resultado = await loadOnboardingSnapshot(tenantId, propertyId);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    return NextResponse.json({ propiedades, onboarding: resultado.snapshot });
  } catch (error) {
    console.error('Error obteniendo estado del onboarding:', error);
    return NextResponse.json({ error: 'Error al obtener el onboarding' }, { status: 500 });
  }
}
