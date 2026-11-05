export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdScheduleCreateSchema } from '@/lib/validation/schemas/ads';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    const where: any = { tenantId };
    if (campaignId) where.campaignId = campaignId;

    const schedules = await prisma.adSchedule.findMany({
      where,
      include: {
        campaign: { select: { id: true, name: true, platform: { select: { platform: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(schedules);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:read']);

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const raw = await req.json();
    const body = validateBody(AdScheduleCreateSchema, raw);
    if (body instanceof Response) return body;

    const schedule = await prisma.adSchedule.create({
      data: {
        tenantId,
        campaignId: body.campaignId,
        adSetId: body.adSetId || null,
        name: body.name,
        daysOfWeek: body.daysOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        timezone: body.timezone || 'America/Mexico_City',
        action: body.action,
        enabled: body.enabled !== undefined ? body.enabled : true,
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:write']);
