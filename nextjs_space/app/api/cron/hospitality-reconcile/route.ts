/**
 * app/api/cron/hospitality-reconcile/route.ts
 *
 * GET /api/cron/hospitality-reconcile
 *
 * Disparo a demanda de la reconciliación diaria de reservas de Hospitality
 * contra la capa de conectividad (plan maestro §14). La lógica vive en
 * `lib/cron/hospitality-reconcile.ts`, que también ejecuta el scheduler.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 * ────────────────────────────────────────────────────────────────────────────
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *           Fuera de producción se permite sin auth para desarrollo local
 *           (mismo patrón que cleanup-attendance / uptime-developers).
 *   • `cancelarAusentes` SIEMPRE en false: las reservas internas activas que
 *     el proveedor ya no reporta solo se registran como divergencia, nunca
 *     se cancelan automáticamente (conservador, §14).
 *   • Idempotente: sin diferencias no hay escrituras; cada corrida queda
 *     auditada en HospitalitySyncLog (tipo `reconciliacion`).
 *   • Si la conectividad no está configurada, no hay nada que reconciliar.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { runHospitalityReconcileScan } from '@/lib/cron/hospitality-reconcile';

export async function GET(request: NextRequest) {
  // ── Auth (Bearer CRON_SECRET, solo en producción) ──────────────────────
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
    const resumen = await runHospitalityReconcileScan();
    return NextResponse.json(resumen);
  } catch (error: any) {
    console.error('[Cron/HospitalityReconcile] Error fatal:', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Error en hospitality-reconcile' },
      { status: 500 },
    );
  }
}

export const POST = GET;
