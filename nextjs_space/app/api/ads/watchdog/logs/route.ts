export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/ads/watchdog/logs — Historial de ejecuciones del watchdog
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);

    const ruleId = searchParams.get('ruleId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // Si hay ruleId, verificar que la regla pertenezca al tenant
    if (ruleId) {
      const rule = await prisma.adBudgetRule.findFirst({
        where: { id: ruleId, tenantId },
        select: { id: true },
      });
      if (!rule) {
        return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
      }
    }

    const where: any = {};
    if (ruleId) where.ruleId = ruleId;

    const [executions, total] = await Promise.all([
      prisma.adBudgetExecution.findMany({
        where,
        include: {
          rule: {
            select: { id: true, name: true, tenantId: true },
          },
        },
        orderBy: { executedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adBudgetExecution.count({ where }),
    ]);

    // Filtrar solo las ejecuciones que pertenezcan al tenant
    const filteredExecutions = executions.filter((e) => e.rule?.tenantId === tenantId);
    const filteredTotal = total; // El count con ruleId ya filtra correctamente

    return NextResponse.json({
      executions: filteredExecutions,
      pagination: {
        page,
        limit,
        total: ruleId ? filteredTotal : filteredExecutions.length, // Si no hay filter, usamos count
        totalPages: Math.ceil((ruleId ? filteredTotal : total) / limit),
      },
    });
  } catch (error: any) {
    console.error('[WATCHDOG_LOGS] Error:', error);
    return NextResponse.json({ error: 'Error al obtener historial de ejecuciones' }, { status: 500 });
  }
}, ['ads:read']);
