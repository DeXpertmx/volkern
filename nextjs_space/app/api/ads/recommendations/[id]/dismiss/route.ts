export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// POST /api/ads/recommendations/[id]/dismiss - Descartar una recomendación
export const POST = withTenantAuth(async (req, auth, params) => {
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

    if (recommendation.isApplied) {
      return NextResponse.json({ error: 'La recomendación ya fue aplicada' }, { status: 400 });
    }

    if (recommendation.isDismissed) {
      return NextResponse.json({ error: 'La recomendación ya fue descartada' }, { status: 400 });
    }

    const updated = await prisma.adRecommendation.update({
      where: { id },
      data: { isDismissed: true },
    });

    return NextResponse.json({ success: true, recommendation: updated });
  } catch (error: any) {
    console.error('[ADS_RECOMMENDATION_DISMISS] Error:', error);
    return NextResponse.json({ error: 'Error al descartar recomendación' }, { status: 500 });
  }
}, ['ads:write']);
