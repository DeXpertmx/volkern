export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdCampaignCreateSchema } from '@/lib/validation/schemas/ads';
import { getConnector } from '@/lib/ads/connectors';
import type { AdPlatform } from '@/lib/ads/types';

// GET /api/ads/campaigns - Listar campañas con filtros
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);

    const platformId = searchParams.get('platformId');
    const status = searchParams.get('status');
    const objective = searchParams.get('objective');
    const search = searchParams.get('search');

    const where: any = { tenantId };

    if (platformId) where.platformId = platformId;
    if (status) where.status = status;
    if (objective) where.objective = objective;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const campaigns = await prisma.adCampaign.findMany({
      where,
      include: {
        platform: {
          select: {
            id: true,
            platform: true,
            accountName: true,
          },
        },
        _count: {
          select: { adSets: true, ads: true },
        } as { select: { adSets: boolean; ads: boolean } },
        adInsights: {
          orderBy: { dateStart: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error('[ADS_CAMPAIGNS_GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener campañas' }, { status: 500 });
  }
}, ['ads:read']);

// POST /api/ads/campaigns - Crear campaña
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json();
    const data = validateBody(AdCampaignCreateSchema, body);
    if (data instanceof NextResponse) return data;

    let externalId: string | null = null;
    let platformResult: any = null;

    // Si se proporciona platformId, crear en la plataforma externa
    if (data.isVolkernManaged && body.platformId) {
      const platformId = body.platformId as string;

      const connection = await prisma.adPlatformConnection.findUnique({
        where: { id: platformId },
        select: { platform: true },
      });

      if (!connection) {
        return NextResponse.json({ error: 'Conexión de plataforma no encontrada' }, { status: 404 });
      }

      const connector = getConnector(connection.platform as AdPlatform);
      platformResult = await connector.createCampaign(tenantId, platformId, {
        name: data.name,
        objective: data.objective,
        dailyBudget: data.dailyBudget,
        lifetimeBudget: data.lifetimeBudget,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        bidStrategy: data.bidStrategy,
        bidAmount: data.bidAmount,
        optimizationGoal: data.optimizationGoal,
        trackingTemplate: data.trackingTemplate,
        isVolkernManaged: data.isVolkernManaged,
      });

      externalId = platformResult.externalId;
    }

    // Guardar localmente
    const campaign = await prisma.adCampaign.create({
      data: {
        tenantId,
        platformId: body.platformId || null,
        externalId,
        name: data.name,
        objective: data.objective || null,
        dailyBudget: data.dailyBudget || null,
        lifetimeBudget: data.lifetimeBudget || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        bidStrategy: data.bidStrategy || null,
        bidAmount: data.bidAmount || null,
        optimizationGoal: data.optimizationGoal || null,
        trackingTemplate: data.trackingTemplate || null,
        isVolkernManaged: data.isVolkernManaged ?? true,
        status: data.isVolkernManaged && platformResult ? 'ACTIVE' : 'PAUSED',
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

    return NextResponse.json({ campaign, platformResult }, { status: 201 });
  } catch (error: any) {
    console.error('[ADS_CAMPAIGNS_POST] Error:', error);
    return NextResponse.json({ error: 'Error al crear campaña' }, { status: 500 });
  }
}, ['ads:write']);
