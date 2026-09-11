/**
 * app/api/cron/hospitality-checkin-due/route.ts
 *
 * GET /api/cron/hospitality-checkin-due
 *
 * Dispara el scan horario de reservas con check-in en las próximas 24h
 * (plan maestro §22): envía la plantilla `pre_llegada` activa del tenant
 * (§21) y emite `hospitality_checkin_due` para las reglas de automatización.
 * Idempotente por reserva (guard AuditLog de 24h) — se puede llamar cuantas
 * veces haga falta sin duplicar mensajes ni eventos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *     Fuera de producción se permite sin auth para desarrollo local (mismo
 *     patrón que hospitality-reconcile / cleanup-attendance).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { runHospitalityCheckinDueScan } from '@/lib/cron/hospitality-checkin-due';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET required in production.' },
        { status: 401 },
      );
    }
  }

  const startedAt = Date.now();
  const result = await runHospitalityCheckinDueScan(24);
  const durationMs = Date.now() - startedAt;

  if (result.error) {
    return NextResponse.json({ ok: false, ...result, durationMs }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result, durationMs });
}
