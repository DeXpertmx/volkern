/**
 * app/api/cron/hospitality-promos-alertas/route.ts
 *
 * GET /api/cron/hospitality-promos-alertas
 *
 * Disparo a demanda del aviso por códigos promocionales que acumulan consultas
 * sin conversión. La lógica vive en `lib/cron/hospitality-promos-alertas.ts`,
 * que también ejecuta el scheduler in-process (diaria, 09:30).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTADO EN EL PANEL
 *   La ejecución queda registrada en el store de crons (`/api/cron-status`) con
 *   los avisos de la corrida (qué códigos y con qué números) para que el panel
 *   los pinte en ámbar aunque la notificación no llegue.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *     Fuera de producción se permite sin auth para desarrollo local (mismo
 *     patrón que el resto de jobs de cron).
 *   • Idempotente: cada aviso deja una marca en `HospitalitySyncLog`, y el
 *     intervalo mínimo impide repetir el mismo aviso en cada corrida.
 *   • No envía nada si no hay códigos por debajo del umbral.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import {
  JOB_ID_PROMOS_ALERTAS,
  JOB_LABEL_PROMOS_ALERTAS,
  JOB_SCHEDULE_PROMOS_ALERTAS,
  runHospitalityPromosAlertasScan,
} from '@/lib/cron/hospitality-promos-alertas';
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
    JOB_ID_PROMOS_ALERTAS,
    JOB_LABEL_PROMOS_ALERTAS,
    JOB_SCHEDULE_PROMOS_ALERTAS
  );

  const startedAt = Date.now();
  cronJobStarted(JOB_ID_PROMOS_ALERTAS);
  const resultado = await runHospitalityPromosAlertasScan();
  const durationMs = Date.now() - startedAt;

  if (resultado.error) {
    cronJobFailed(JOB_ID_PROMOS_ALERTAS, resultado.error, durationMs);
    return NextResponse.json({ ok: false, ...resultado, durationMs }, { status: 500 });
  }

  cronJobCompleted(
    JOB_ID_PROMOS_ALERTAS,
    resultado.message,
    durationMs,
    resultado.avisos
  );
  return NextResponse.json({ ok: true, ...resultado, durationMs });
}

export const POST = GET;
