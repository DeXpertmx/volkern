/**
 * app/api/cron/hospitality-briefing/route.ts
 *
 * GET /api/cron/hospitality-briefing
 *
 * Dispara el briefing matutino de hospitality: envía la plantilla
 * `briefing_diario` activa de cada tenant a los usuarios con permiso de
 * operar el PMS (email/WhatsApp) con la foto del día de `resumen_diario`.
 * Idempotente por día (guard AuditLog por tenant + fecha) — se puede llamar
 * varias veces sin duplicar el briefing.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *     Fuera de producción se permite sin auth para desarrollo local (mismo
 *     patrón que hospitality-review-request / hospitality-checkin-due).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { runHospitalityBriefingScan } from '@/lib/cron/hospitality-briefing';

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
  const result = await runHospitalityBriefingScan();
  const durationMs = Date.now() - startedAt;

  if ((result as any).error) {
    return NextResponse.json({ ok: false, ...result, durationMs }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result, durationMs });
}
