export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { oficinasDeFranquicia } from '@/lib/real-estate/franquicia';
import {
  metricasPortal,
  metricasVacias,
  plantillaPorCuenta,
  sumarMetricas,
} from '@/lib/real-estate/portal-analytics';

/**
 * GET /api/real-estate/portal/analytics?dias=30
 *
 * Métricas del portal público de esta cuenta y, si es una matriz, de sus
 * oficinas: visitas a portada y fichas, clics en «Solicitar información», leads
 * del portal y operaciones cerradas, con el desglose por plantilla.
 *
 * Las filas salen siempre completas (matriz primero) para que la tabla compare
 * cuentas sin huecos cuando una oficina no tiene eventos todavía.
 */
export const GET = withTenantAuth(async (req: NextRequest, auth) => {
  const tenantId = auth.tenant!.id;
  const { searchParams } = new URL(req.url);

  const diasPedidos = Number.parseInt(searchParams.get('dias') || '30', 10);
  const dias = Number.isFinite(diasPedidos) ? Math.min(180, Math.max(1, diasPedidos)) : 30;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  try {
    const oficinas = await oficinasDeFranquicia(tenantId);
    const ids = [tenantId, ...oficinas.map((oficina) => oficina.id)];
    const nombres = new Map<string, string>([
      [tenantId, auth.tenant!.nombre],
      ...oficinas.map((oficina) => [oficina.id, oficina.nombre] as [string, string]),
    ]);

    const [metricas, plantillas] = await Promise.all([
      metricasPortal(ids, desde),
      plantillaPorCuenta(ids),
    ]);

    const filas = ids.map((id) => ({
      tenantId: id,
      nombre: nombres.get(id) || '—',
      esMatriz: id === tenantId,
      plantilla: plantillas.get(id) || 'foto',
      metricas: metricas.get(id) ?? metricasVacias(),
    }));

    return NextResponse.json({
      ok: true,
      dias,
      desde: desde.toISOString(),
      filas,
      red: sumarMetricas(filas.map((fila) => fila.metricas)),
    });
  } catch (error) {
    console.error('[Portal Analytics] Error:', error);
    return NextResponse.json({ error: 'Error al obtener la analítica del portal' }, { status: 500 });
  }
}, ['real-estate:read']);
