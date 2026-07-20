export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AdBudgetRuleCreateSchema } from '@/lib/validation/schemas/ads';

// GET /api/ads/watchdog/rules — Listar reglas watchdog del tenant
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const rules = await prisma.adBudgetRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { executions: true },
        },
      },
    });

    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error('[WATCHDOG_RULES_GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener reglas watchdog' }, { status: 500 });
  }
}, ['ads:read']);

// POST /api/ads/watchdog/rules — Crear una nueva regla watchdog
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json();

    // Validar body con Zod
    const parsed = AdBudgetRuleCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const rule = await prisma.adBudgetRule.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
        scope: data.scope,
        scopeId: data.scopeId ?? null,
        condition: data.condition as object,
        action: data.action,
        actionValue: data.actionValue ?? null,
        cooldownHours: data.cooldownHours ?? 24,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error: any) {
    console.error('[WATCHDOG_RULES_POST] Error:', error);
    return NextResponse.json({ error: 'Error al crear regla watchdog' }, { status: 500 });
  }
}, ['ads:write']);
