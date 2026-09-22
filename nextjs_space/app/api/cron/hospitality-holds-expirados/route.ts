/**
 * app/api/cron/hospitality-holds-expirados/route.ts
 *
 * GET /api/cron/hospitality-holds-expirados
 *
 * Caduca los holds `pending` que superaron la ventana de su propiedad
 * (`holdHoras`, defecto 24 h; 0 = sin caducidad). Un hold olvidado bloqueaba
 * la unidad indefinidamente (observación del audit de estados); el barrido la
 * libera, deja traza en el AuditLog y avisa al operador.
 *
 * Idempotente y seguro ante carreras: la cancelación exige que la reserva
 * siga en `pending`, así que se puede llamar cuantas veces haga falta. Los
 * holds con pagos registrados **no** caducan (decisión humana).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTADO EN EL PANEL
 *   La ejecución queda registrada en el store de crons (`/api/cron-status`) y
 *   se ve en `/admin/hospitality`. El job se auto-registra aquí además de
 *   estar en el scheduler (`lib/cron/scheduler.ts`), para que un disparo por
 *   HTTP también aparezca en el panel aunque el scheduler no haya corrido en
 *   este proceso. El store es en memoria (por proceso): en serverless el panel
 *   refleja el proceso que atendió la consulta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *     Fuera de producción se permite sin auth para desarrollo local (mismo
 *     patrón que hospitality-reconcile / hospitality-checkin-due).
 *   • Programación: cada hora (`0 * * * *`).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import {
  JOB_ID_HOLDS_CADUCADOS,
  JOB_LABEL_HOLDS_CADUCADOS,
  JOB_SCHEDULE_HOLDS_CADUCADOS,
  runHospitalityHoldExpiryScan,
} from '@/lib/cron/hospitality-holds';
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
        { error: 'No autorizado. CRON_SECRET required in production.' },
        { status: 401 },
      );
    }
  }

  // Idempotente (el store no duplica entradas): así un disparo por HTTP
  // aparece en el panel aunque el scheduler no haya registrado el job.
  registerCronJob(
    JOB_ID_HOLDS_CADUCADOS,
    JOB_LABEL_HOLDS_CADUCADOS,
    JOB_SCHEDULE_HOLDS_CADUCADOS
  );

  const startedAt = Date.now();
  cronJobStarted(JOB_ID_HOLDS_CADUCADOS);
  const result = await runHospitalityHoldExpiryScan();
  const durationMs = Date.now() - startedAt;

  if (result.error) {
    cronJobFailed(JOB_ID_HOLDS_CADUCADOS, result.error, durationMs);
    return NextResponse.json({ ok: false, ...result, durationMs }, { status: 500 });
  }

  cronJobCompleted(
    JOB_ID_HOLDS_CADUCADOS,
    `${result.caducados} caducados · ${result.omitidos} omitidos · ${result.total} candidatos`,
    durationMs
  );
  return NextResponse.json({ ok: true, ...result, durationMs });
}
