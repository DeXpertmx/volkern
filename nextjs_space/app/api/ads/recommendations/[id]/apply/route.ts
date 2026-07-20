export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { RecommendationEngine } from '@/lib/ads/recommendation-engine';
import { getConnector } from '@/lib/ads/connectors';
import type { AdPlatform } from '@/lib/ads/types';

// POST /api/ads/recommendations/[id]/apply - Aplicar una recomendación
export const POST = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const { id } = params;

    // Verificar que la recomendación pertenece al tenant
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
      return NextResponse.json({ error: 'La recomendación fue descartada' }, { status: 400 });
    }

    // Si la recomendación afecta a una campaña, actualizar vía connector
    if (recommendation.campaignId && recommendation.implementation) {
      const impl = recommendation.implementation as Record<string, unknown>;
      const budgetChange = impl.budgetChange as number | undefined;
      const bidStrategy = impl.bidStrategy as string | undefined;
      const bidAmount = impl.bidAmount as number | undefined;

      if (budgetChange || bidStrategy || bidAmount) {
        const campaign = await prisma.adCampaign.findUnique({
          where: { id: recommendation.campaignId },
          include: { platform: { select: { platform: true } } },
        });

        if (campaign && campaign.externalId && campaign.platform) {
          const connector = getConnector(campaign.platform.platform as AdPlatform);

          if (budgetChange) {
            const newBudget = Math.max(1, (campaign.dailyBudget || 0) + budgetChange);
            await connector.updateBudget(campaign.id, campaign.externalId, newBudget);
            await prisma.adCampaign.update({
              where: { id: campaign.id },
              data: { dailyBudget: newBudget },
            });
          }

          if (bidStrategy || bidAmount) {
            await prisma.adCampaign.update({
              where: { id: campaign.id },
              data: {
                ...(bidStrategy && { bidStrategy }),
                ...(bidAmount !== undefined && { bidAmount }),
              },
            });
          }
        }
      }
    }

    // Usar el engine para aplicar la recomendación (marca isApplied y ejecuta lógica interna)
    const success = await RecommendationEngine.applyRecommendation(id);

    if (!success) {
      return NextResponse.json({ error: 'No se pudo aplicar la recomendación' }, { status: 500 });
    }

    const updated = await prisma.adRecommendation.findUnique({
      where: { id },
    });

    return NextResponse.json({ success: true, recommendation: updated });
  } catch (error: any) {
    console.error('[ADS_RECOMMENDATION_APPLY] Error:', error);
    return NextResponse.json({ error: 'Error al aplicar recomendación' }, { status: 500 });
  }
}, ['ads:admin']);
