export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdCampaignUpdateSchema } from '@/lib/validation/schemas/ads';
import { getConnector } from '@/lib/ads/connectors';
import type { AdPlatform } from '@/lib/ads/types';

// GET /api/ads/campaigns/[id] - Obtener detalle de campaña
export const GET = withTenantAuth(async (req, auth, context) => {
  try {
    const { id } = await context.params;
    const tenantId = auth.tenant!.id;

    const campaign = await prisma.adCampaign.findUnique({
      where: { id, tenantId },
      include: {
        platform: {
          select: {
            id: true,
            platform: true,
            accountName: true,
          },
        },
        adSets: {
          include: {
            ads: true,
            adInsights: {
              orderBy: { dateStart: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
        adInsights: {
          orderBy: { dateStart: 'desc' },
          take: 10,
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('[ADS_CAMPAIGN_GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener campaña' }, { status: 500 });
  }
}, ['ads:read']);

// PUT /api/ads/campaigns/[id] - Actualizar campaña
export const PUT = withTenantAuth(async (req, auth, context) => {
  try {
    const { id } = await context.params;
    const tenantId = auth.tenant!.id;

    const body = await req.json();
    const data = validateBody(AdCampaignUpdateSchema, body);
    if (data instanceof NextResponse) return data;

    // Verificar que la campaña existe
    const existing = await prisma.adCampaign.findUnique({
      where: { id, tenantId },
      include: {
        platform: {
          select: { platform: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    // Si es volkern-managed y tiene externalId, actualizar en plataforma externa
    if (existing.isVolkernManaged && existing.externalId) {
      const connector = getConnector(existing.platform.platform as AdPlatform);

      if (data.dailyBudget !== undefined) {
        await connector.updateBudget(id, existing.externalId, data.dailyBudget);
      }
    }

    // Actualizar localmente
    const campaign = await prisma.adCampaign.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.dailyBudget !== undefined && { dailyBudget: data.dailyBudget }),
        ...(data.lifetimeBudget !== undefined && { lifetimeBudget: data.lifetimeBudget }),
        ...(data.bidStrategy !== undefined && { bidStrategy: data.bidStrategy }),
        ...(data.bidAmount !== undefined && { bidAmount: data.bidAmount }),
        ...(data.optimizationGoal !== undefined && { optimizationGoal: data.optimizationGoal }),
        ...(data.trackingTemplate !== undefined && { trackingTemplate: data.trackingTemplate }),
        ...(data.isVolkernManaged !== undefined && { isVolkernManaged: data.isVolkernManaged }),
      },
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

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('[ADS_CAMPAIGN_PUT] Error:', error);
    return NextResponse.json({ error: 'Error al actualizar campaña' }, { status: 500 });
  }
}, ['ads:write']);
