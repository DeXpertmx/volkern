/**
 * app/api/cron/hospitality-puesta-en-marcha-avisos/route.ts
 *
 * GET /api/cron/hospitality-puesta-en-marcha-avisos
 *
 * Disparo a demanda del aviso al operador por cuentas de Hospitality con la
 * puesta en marcha parada. La lógica vive en
 * `lib/cron/hospitality-puesta-en-marcha-avisos.ts`, que también ejecuta el
 * scheduler in-process (diaria, 09:20).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTADO EN EL PANEL
 *   La ejecución queda registrada en el store de crons (`/api/cron-status`) y se
 *   ve en `/admin/hospitality`. Los avisos de la corrida —qué cuentas y por
 *   qué— se publican ahí en ámbar, además del correo: si el email no sale (falta
 *   `ADMIN_EMAIL` o `RESEND_API_KEY`), el panel sigue diciéndolo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *     Fuera de producción se permite sin auth para desarrollo local (mismo
 *     patrón que el resto de jobs de cron).
 *   • Idempotente: cada cuenta avisada deja su marca en `HospitalitySyncLog`, y
 *     el intervalo mínimo impide repetir el mismo aviso en cada corrida.
 *   • No envía nada si no hay cuentas que avisar.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import {
  JOB_ID_PUESTA_EN_MARCHA_AVISOS,
  JOB_LABEL_PUESTA_EN_MARCHA_AVISOS,
  JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS,
  runHospitalityPuestaEnMarchaAvisosScan,
} from '@/lib/cron/hospitality-puesta-en-marcha-avisos';
import {
  registerCronJob,
  cronJobStarted,
  cronJobCompleted,
  cronJobFailed,
} from '@/lib/cron/cron-status';

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

  // Idempotente (el store no duplica entradas): así un disparo por HTTP aparece
  // en el panel aunque el scheduler no haya registrado el job en este proceso.
  registerCronJob(
    JOB_ID_PUESTA_EN_MARCHA_AVISOS,
    JOB_LABEL_PUESTA_EN_MARCHA_AVISOS,
    JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS
  );

  const startedAt = Date.now();
  cronJobStarted(JOB_ID_PUESTA_EN_MARCHA_AVISOS);
  const resultado = await runHospitalityPuestaEnMarchaAvisosScan();
  const durationMs = Date.now() - startedAt;

  if (resultado.error) {
    cronJobFailed(JOB_ID_PUESTA_EN_MARCHA_AVISOS, resultado.error, durationMs);
    return NextResponse.json({ ok: false, ...resultado, durationMs }, { status: 500 });
  }

  cronJobCompleted(
    JOB_ID_PUESTA_EN_MARCHA_AVISOS,
    resultado.message,
    durationMs,
    resultado.avisos
  );
  return NextResponse.json({ ok: true, ...resultado, durationMs });
}

export const POST = GET;
