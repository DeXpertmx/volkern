/**
 * app/api/cron/hospitality-review-request/route.ts
 *
 * GET /api/cron/hospitality-review-request
 *
 * Dispara el scan de solicitud de reseña (plan maestro §21): envía la
 * plantilla `resena` activa de cada tenant a las reservas que hicieron
 * check-out hace al menos 24h (ventana de recuperación de 72h).
 * Idempotente por reserva (guard AuditLog) — se puede llamar cuantas veces
 * haga falta sin pedir la reseña dos veces.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *     Fuera de producción se permite sin auth para desarrollo local (mismo
 *     patrón que hospitality-checkin-due / hospitality-reconcile).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { runHospitalityReviewRequestScan } from '@/lib/cron/hospitality-review-request';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET requerido en producción.' },
        { status: 401 },
      );
    }
  }

  const startedAt = Date.now();
  const result = await runHospitalityReviewRequestScan(24, 72);
  const durationMs = Date.now() - startedAt;

  if ((result as any).error) {
    return NextResponse.json({ ok: false, ...result, durationMs }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result, durationMs });
}
