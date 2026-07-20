export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { RecommendationEngine } from '@/lib/ads/recommendation-engine';

// GET /api/ads/recommendations - Listar recomendaciones activas del tenant
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);

    const type = searchParams.get('type');
    const impact = searchParams.get('impact');

    const where: any = {
      tenantId,
      isApplied: false,
      isDismissed: false,
    };

    if (type) where.type = type;
    if (impact) where.impact = impact;

    const recommendations = await prisma.adRecommendation.findMany({
      where,
      orderBy: [
        { confidence: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({ recommendations });
  } catch (error: any) {
    console.error('[ADS_RECOMMENDATIONS_GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener recomendaciones' }, { status: 500 });
  }
}, ['ads:read']);

// POST /api/ads/recommendations - Generar nuevas recomendaciones
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const { campaignId } = body;

    let results: any[];

    if (campaignId) {
      results = await RecommendationEngine.generateCampaignRecommendations(campaignId);
    } else {
      results = await RecommendationEngine.generateAll(tenantId);
    }

    // Guardar cada recomendación en la base de datos
    const saved: any[] = [];
    for (const result of results) {
      await RecommendationEngine.saveRecommendation(result, tenantId, campaignId);
      saved.push(result);
    }

    return NextResponse.json({ recommendations: saved }, { status: 201 });
  } catch (error: any) {
    console.error('[ADS_RECOMMENDATIONS_POST] Error:', error);
    return NextResponse.json({ error: 'Error al generar recomendaciones' }, { status: 500 });
  }
}, ['ads:write']);
