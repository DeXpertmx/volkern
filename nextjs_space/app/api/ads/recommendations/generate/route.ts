export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { RecommendationEngine } from '@/lib/ads/recommendation-engine';

// POST /api/ads/recommendations/generate - Generar nuevas recomendaciones (alias)
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
    console.error('[ADS_RECOMMENDATIONS_GENERATE_POST] Error:', error);
    return NextResponse.json({ error: 'Error al generar recomendaciones' }, { status: 500 });
  }
}, ['ads:write']);
