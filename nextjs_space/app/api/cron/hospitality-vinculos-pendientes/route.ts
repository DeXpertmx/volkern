/**
 * app/api/cron/hospitality-vinculos-pendientes/route.ts
 *
 * GET /api/cron/hospitality-vinculos-pendientes
 *
 * Disparo a demanda del resumen de vínculos de conectividad creados
 * automáticamente y todavía sin revisar. La lógica vive en
 * `lib/cron/hospitality-vinculos-pendientes.ts`, que también ejecuta el
 * scheduler.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 * ────────────────────────────────────────────────────────────────────────────
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *           Fuera de producción se permite sin auth para desarrollo local
 *           (mismo patrón que el resto de jobs de cron).
 *   • Solo avisa a los administradores del propio tenant y nunca repite el
 *     mismo recordatorio antes del intervalo mínimo (salvo vínculos nuevos).
 *   • Idempotente: cada corrida deja su marca en HospitalitySyncLog.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { runHospitalityVinculosPendientesScan } from '@/lib/cron/hospitality-vinculos-pendientes';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET requerido en producción.' },
        { status: 401 }
      );
    }
  }

  try {
    const resumen = await runHospitalityVinculosPendientesScan();
    return NextResponse.json(resumen);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error en hospitality-vinculos-pendientes';
    console.error('[Cron/HospitalityVinculos] Error fatal:', error);
    return NextResponse.json({ success: false, error: mensaje }, { status: 500 });
  }
}

export const POST = GET;
