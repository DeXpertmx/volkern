export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AdPredictor } from '@/lib/ads/predictor';

// GET /api/ads/predict/[campaignId] - Obtener predicción de rendimiento para una campaña
export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const { campaignId } = params;

    // Verificar que la campaña pertenece al tenant
    const campaign = await prisma.adCampaign.findFirst({
      where: {
        id: campaignId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        platform: {
          select: { platform: true },
        },
        objective: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    const prediction = await AdPredictor.predictCampaign(campaignId);

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        platform: campaign.platform?.platform || null,
        objective: campaign.objective,
      },
      prediction,
    });
  } catch (error: any) {
    console.error('[ADS_PREDICT_GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener predicción' }, { status: 500 });
  }
}, ['ads:read']);
