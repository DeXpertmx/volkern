import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { isSuperadminRequest } from '@/lib/auth-helpers';
import { calcularKpisPlataforma } from '@/lib/saas-kpis';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/saas-metrics/kpis
 * KPIs de negocio de la plataforma: MRR, ARR, ARPA, churn, LTV, CAC y
 * conversión de oportunidad a cliente.
 */
export async function GET(request: NextRequest) {
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  const crudo = parseInt(request.nextUrl.searchParams.get('periodDays') || '30', 10);
  const periodoDias = Number.isFinite(crudo) ? Math.min(365, Math.max(7, crudo)) : 30;

  try {
    return NextResponse.json(await calcularKpisPlataforma(periodoDias));
  } catch (error) {
    console.error('[SaaS KPIs] Error calculando métricas:', error);
    return NextResponse.json(
      { error: 'No se pudieron calcular las métricas', details: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/saas-metrics/kpis
 * Declara la inversión de marketing del periodo, que es lo que permite
 * calcular el CAC. Se guarda en `PlatformSettings.configuracion` junto al
 * resto de la configuración de plataforma.
 */
export async function PUT(request: NextRequest) {
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const gasto = Number(body?.gastoMarketingMensual);

    if (!Number.isFinite(gasto) || gasto < 0) {
      return NextResponse.json(
        { error: 'La inversión de marketing debe ser un número mayor o igual a cero.' },
        { status: 400 },
      );
    }

    const periodoDias = Number(body?.periodDays) >= 7 ? Number(body.periodDays) : 30;

    const existente = await globalPrisma.platformSettings.findFirst({
      select: { id: true, configuracion: true },
    });

    const configuracionPrevia =
      existente?.configuracion && typeof existente.configuracion === 'object'
        ? (existente.configuracion as Record<string, unknown>)
        : {};

    const configuracion = { ...configuracionPrevia, gastoMarketingMensual: gasto };

    if (existente) {
      await globalPrisma.platformSettings.update({
        where: { id: existente.id },
        data: { configuracion },
      });
    } else {
      await globalPrisma.platformSettings.create({ data: { configuracion } });
    }

    return NextResponse.json(await calcularKpisPlataforma(periodoDias));
  } catch (error) {
    console.error('[SaaS KPIs] Error guardando la inversión de marketing:', error);
    return NextResponse.json(
      { error: 'No se pudo guardar la inversión de marketing', details: (error as Error).message },
      { status: 500 },
    );
  }
}
