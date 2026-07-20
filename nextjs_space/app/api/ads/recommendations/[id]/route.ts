export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/ads/recommendations/[id] - Obtener detalle de una recomendación
export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const { id } = params;

    const recommendation = await prisma.adRecommendation.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!recommendation) {
      return NextResponse.json({ error: 'Recomendación no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ recommendation });
  } catch (error: any) {
    console.error('[ADS_RECOMMENDATION_GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener recomendación' }, { status: 500 });
  }
}, ['ads:read']);
