export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdABTestCreateSchema } from '@/lib/validation/schemas/ads';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');
    const status = searchParams.get('status');

    const where: any = { tenantId };
    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;

    const tests = await prisma.adABTest.findMany({
      where,
      include: {
        campaign: { select: { id: true, name: true } },
        variants: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(tests);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:read']);

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const raw = await req.json();
    const body = validateBody(AdABTestCreateSchema, raw);
    if (body instanceof Response) return body;

    const test = await prisma.adABTest.create({
      data: {
        tenantId,
        campaignId: body.campaignId,
        name: body.name,
        description: body.description || null,
        status: 'DRAFT',
        metric: body.metric || 'CTR',
        significanceThreshold: body.significanceThreshold || 0.95,
        trafficSplit: body.trafficSplit || 'FIFTY_FIFTY',
        autoDeclare: body.autoDeclare || false,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      include: { variants: true },
    });

    if (body.variants && body.variants.length > 0) {
      for (const v of body.variants) {
        await prisma.adABTestVariant.create({
          data: {
            abTestId: test.id,
            adSetId: v.adSetId || null,
            adId: v.adId || null,
            label: v.label,
            trafficAllocation: v.trafficAllocation || null,
          },
        });
      }
    }

    const fullTest = await prisma.adABTest.findUnique({
      where: { id: test.id },
      include: { variants: true },
    });

    return NextResponse.json(fullTest, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:write']);
