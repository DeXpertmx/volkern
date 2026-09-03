/**
 * GET /api/admin/tenants/currency-inheritance-report
 *
 * Reporte administrativo que lista tenants cuya moneda actual es `MXN`
 * y cuya fuente de inferencia es `FALLBACK` (es decir, heredaron el default
 * del schema sin pasar por el onboarding prompt, sin auto-fix de import,
 * ni cambio manual).
 *
 * Estos tenants son los que el broker probablemente NO eligió explícitamente
 * MXN como su moneda preferida: el campo `moneda` quedó en el default porque
 * ningún flujo activo lo modificó. Los candidatos perfectos para revisar
 * durante la limpieza operativa de fin de mes.
 *
 * Uso:
 *   GET /api/admin/tenants/currency-inheritance-report
 *   GET /api/admin/tenants/currency-inheritance-report?source=FALLBACK
 *   GET /api/admin/tenants/currency-inheritance-report?limit=200&offset=0
 *
 * Respuesta:
 *   { total, bySource: { FALLBACK: N, EXPLICIT: N, USER_PROMPT: N, IMPORT_AUTO: N },
 *     items: [{ id, slug, subdomain, nombre, plan, moneda, monedaInferida,
 *               monedaInferenciaSource, fechaCreacion }] }
 *
 * Auth: requiere superadmin (ruta bajo /api/admin/...).
 */
import { NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import type { Currency } from '@/lib/insurance/currency';

export const dynamic = 'force-dynamic';

const ALLOWED_SOURCES = ['EXPLICIT', 'USER_PROMPT', 'IMPORT_AUTO', 'FALLBACK'] as const;
type MonedaInferenciaSource = typeof ALLOWED_SOURCES[number];

export const GET = withTenantAuth(async (request: Request, auth): Promise<Response> => {
  // Solo operadores Superadmin de la plataforma (los roles 'Admin'/'Administrador' de tenant NO acceden)
  if (auth.user?.role?.nombre !== 'Superadmin') {
    return NextResponse.json(
      { error: 'Acceso denegado: requiere rol de Superadmin de la plataforma' },
      { status: 403 },
    );
  }

  try {
    const url = new URL(request.url);
    const source = (url.searchParams.get('source') ?? 'FALLBACK').toUpperCase();
    if (!(ALLOWED_SOURCES as readonly string[]).includes(source)) {
      return NextResponse.json(
        { error: `source inválida. Permitidas: ${ALLOWED_SOURCES.join(', ')}` },
        { status: 400 },
      );
    }

    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '100'), 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0'), 0);
    const sourceEnum = source as MonedaInferenciaSource;

    // Conteos agrupados por fuente (una sola query agrega los 4 totales
    // para alimentar la tile /admin/saas-metrics del follow-up).
    const bySource = await globalPrisma.tenant.groupBy({
      by: ['monedaInferenciaSource'],
      _count: { _all: true },
      where: {
        monedaInferenciaSource: { not: null },
      },
    });
    const bySourceCounts: Record<MonedaInferenciaSource, number> = {
      FALLBACK: 0, EXPLICIT: 0, USER_PROMPT: 0, IMPORT_AUTO: 0,
    };
    for (const row of bySource) {
      const k = row.monedaInferenciaSource as MonedaInferenciaSource;
      bySourceCounts[k] = row._count._all ?? 0;
    }

    // Filtro principal: source elegido (default FALLBACK).
    const where = { monedaInferenciaSource: sourceEnum };

    const [items, total] = await Promise.all([
      globalPrisma.tenant.findMany({
        where,
        select: {
          id: true, slug: true, subdomain: true, nombre: true, plan: true,
          moneda: true, monedaInferida: true, monedaInferenciaSource: true,
          fechaCreacion: true,
        },
        orderBy: { fechaCreacion: 'asc' },
        take: limit, skip: offset,
      }),
      globalPrisma.tenant.count({ where }),
    ]);

    return NextResponse.json({
      total,
      count: items.length,
      limit, offset,
      bySource: bySourceCounts,
      source,
      items,
    });
  } catch (e: any) {
    console.error('[GET /api/admin/tenants/currency-inheritance-report]', e?.message || e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['config:read', 'settings:read']);
