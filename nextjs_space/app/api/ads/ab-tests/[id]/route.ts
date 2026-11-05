export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdABTestUpdateSchema } from '@/lib/validation/schemas/ads';

export const GET = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const test = await prisma.adABTest.findUnique({
      where: { id },
      include: {
        campaign: { select: { id: true, name: true } },
        variants: true,
      },
    });
    if (!test || test.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
    return NextResponse.json(test);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:read']);

export const PATCH = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const existing = await prisma.adABTest.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    const raw = await req.json();
    const body = validateBody(AdABTestUpdateSchema, raw);
    if (body instanceof Response) return body;
    const updateData: any = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === 'RUNNING' && existing.status === 'DRAFT') {
        updateData.startDate = new Date();
      }
    }
    if (body.metric !== undefined) updateData.metric = body.metric;
    if (body.significanceThreshold !== undefined) updateData.significanceThreshold = body.significanceThreshold;
    if (body.trafficSplit !== undefined) updateData.trafficSplit = body.trafficSplit;
    if (body.autoDeclare !== undefined) updateData.autoDeclare = body.autoDeclare;
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;

    const test = await prisma.adABTest.update({
      where: { id },
      data: updateData,
      include: { variants: true },
    });

    return NextResponse.json(test);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:write']);

export const DELETE = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const existing = await prisma.adABTest.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    await prisma.adABTest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:write']);
