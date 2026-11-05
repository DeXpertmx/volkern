export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdScheduleUpdateSchema } from '@/lib/validation/schemas/ads';

export const GET = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const schedule = await prisma.adSchedule.findUnique({
      where: { id },
      include: { campaign: { select: { id: true, name: true } } },
    });
    if (!schedule || schedule.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
    return NextResponse.json(schedule);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:read']);

export const PATCH = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const existing = await prisma.adSchedule.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    const raw = await req.json();
    const body = validateBody(AdScheduleUpdateSchema, raw);
    if (body instanceof Response) return body;
    const schedule = await prisma.adSchedule.update({
      where: { id },
      data: {
        name: body.name,
        daysOfWeek: body.daysOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        timezone: body.timezone,
        action: body.action,
        enabled: body.enabled,
      },
    });

    return NextResponse.json(schedule);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:write']);

export const DELETE = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const existing = await prisma.adSchedule.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    await prisma.adSchedule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:write']);
