/**
 * app/api/cron/hospitality-connectivity-health/route.ts
 *
 * GET /api/cron/hospitality-connectivity-health
 *
 * Disparo a demanda del health-check diario de la capa de conectividad. La
 * lógica vive en `lib/cron/hospitality-connectivity-health.ts`, que también
 * ejecuta el scheduler (diaria 05:00). La sonda es `property_details` con el
 * hotel sandbox — la misma del botón «Probar» — y deja la marca de última
 * verificación que muestra el panel.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 * ────────────────────────────────────────────────────────────────────────────
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción),
 *     mismo patrón que hospitality-reconcile / hospitality-registro-viajeros.
 *   • Siempre HTTP 200 con `ok` en el body: un fallo de la capa no es un fallo
 *     del endpoint — el health-check hizo su trabajo al reportarlo.
 *   • Sin configuración es un no-op razonado (`ejecutado: false`), no un error.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { runConnectivityHealthCheck } from '@/lib/cron/hospitality-connectivity-health';

export async function GET(request: NextRequest) {
  // ── Auth (Bearer CRON_SECRET, solo en producción) ────────────────────────
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET requerido en producción.' },
        { status: 401 },
      );
    }
  }

  try {
    const resumen = await runConnectivityHealthCheck();
    // 200 siempre: el endpoint existe para INFORMAR del estado de la capa. Un
    // `ok: false` es un resultado válido (la capa falló la sonda), no un error
    // del disparo — convertirlo en 5xx haría que el monitor reintentara y que
    // los logs confundieran «capa caída» con «job roto».
    return NextResponse.json(resumen, { status: 200 });
  } catch (error: any) {
    console.error('[Cron/ConnectivityHealth] Error fatal:', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Error en hospitality-connectivity-health' },
      { status: 500 },
    );
  }
}

export const POST = GET;
