export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

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
});

export const PATCH = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const existing = await prisma.adABTest.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    const body = await req.json();

    if (body.status === 'RUNNING' && existing.status === 'DRAFT') {
      body.startDate = new Date();
    }

    const test = await prisma.adABTest.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        status: body.status,
        metric: body.metric,
        significanceThreshold: body.significanceThreshold,
        trafficSplit: body.trafficSplit,
        autoDeclare: body.autoDeclare,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      },
      include: { variants: true },
    });

    return NextResponse.json(test);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

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
});
