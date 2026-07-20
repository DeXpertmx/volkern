export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getConnector } from '@/lib/ads/connectors';
import type { AdPlatform } from '@/lib/ads/types';

// POST /api/ads/campaigns/[id]/resume - Reanudar campaña
export const POST = withTenantAuth(async (req, auth, context) => {
  try {
    const { id } = await context.params;
    const tenantId = auth.tenant!.id;

    const campaign = await prisma.adCampaign.findUnique({
      where: { id, tenantId },
      include: {
        platform: {
          select: { platform: true },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    if (campaign.status === 'ACTIVE') {
      return NextResponse.json({ error: 'La campaña ya está activa' }, { status: 409 });
    }

    // Si tiene externalId, reanudar en la plataforma externa
    if (campaign.externalId) {
      const connector = getConnector(campaign.platform.platform as AdPlatform);
      await connector.resumeCampaign(id, campaign.externalId);
    }

    // Actualizar estado local
    const updated = await prisma.adCampaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: {
        platform: {
          select: {
            id: true,
            platform: true,
            accountName: true,
          },
        },
      },
    });

    return NextResponse.json({ campaign: updated });
  } catch (error: any) {
    console.error('[ADS_CAMPAIGN_RESUME] Error:', error);
    return NextResponse.json({ error: 'Error al reanudar campaña' }, { status: 500 });
  }
}, ['ads:manage']);
