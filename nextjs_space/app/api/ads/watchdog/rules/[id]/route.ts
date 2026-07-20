export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AdBudgetRuleUpdateSchema } from '@/lib/validation/schemas/ads';

// GET /api/ads/watchdog/rules/[id] — Obtener regla con últimas ejecuciones
export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const id = params?.params?.id;

    if (!id) {
      return NextResponse.json({ error: 'ID de regla requerido' }, { status: 400 });
    }

    const rule = await prisma.adBudgetRule.findFirst({
      where: { id, tenantId },
    });

    if (!rule) {
      return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
    }

    const executions = await prisma.adBudgetExecution.findMany({
      where: { ruleId: id },
      orderBy: { executedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ rule, executions });
  } catch (error: any) {
    console.error('[WATCHDOG_RULE_GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener regla' }, { status: 500 });
  }
}, ['ads:read']);

// PUT /api/ads/watchdog/rules/[id] — Actualizar regla
export const PUT = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const id = params?.params?.id;

    if (!id) {
      return NextResponse.json({ error: 'ID de regla requerido' }, { status: 400 });
    }

    // Verificar que la regla existe y pertenece al tenant
    const existing = await prisma.adBudgetRule.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
    }

    const body = await req.json();

    // Validar body con Zod
    const parsed = AdBudgetRuleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const rule = await prisma.adBudgetRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.condition !== undefined && { condition: data.condition as object }),
        ...(data.action !== undefined && { action: data.action }),
        ...(data.actionValue !== undefined && { actionValue: data.actionValue }),
        ...(data.cooldownHours !== undefined && { cooldownHours: data.cooldownHours }),
      },
    });

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error('[WATCHDOG_RULE_PUT] Error:', error);
    return NextResponse.json({ error: 'Error al actualizar regla' }, { status: 500 });
  }
}, ['ads:write']);

// DELETE /api/ads/watchdog/rules/[id] — Eliminar regla
export const DELETE = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const id = params?.params?.id;

    if (!id) {
      return NextResponse.json({ error: 'ID de regla requerido' }, { status: 400 });
    }

    const existing = await prisma.adBudgetRule.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
    }

    // Eliminar ejecuciones asociadas primero (por si no hay CASCADE)
    await prisma.adBudgetExecution.deleteMany({ where: { ruleId: id } });
    await prisma.adBudgetRule.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Regla eliminada' });
  } catch (error: any) {
    console.error('[WATCHDOG_RULE_DELETE] Error:', error);
    return NextResponse.json({ error: 'Error al eliminar regla' }, { status: 500 });
  }
}, ['ads:admin']);
