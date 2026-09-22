/**
 * app/api/cron/hospitality-registro-viajeros/route.ts
 *
 * GET /api/cron/hospitality-registro-viajeros
 *
 * Comunicación al Ministerio del Interior del registro de viajeros
 * (RD 933/2021, art. 6: plazo máximo de 24 horas desde el inicio del servicio).
 * Envía los partes pendientes, consulta los lotes ya enviados (el alta es
 * asíncrona) y anula los de reservas canceladas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTADO EN EL PANEL
 *   La ejecución queda registrada en el store de crons (`/api/cron-status`) y
 *   se ve en `/admin/hospitality`. El job se auto-registra aquí además de estar
 *   en el scheduler (`lib/cron/scheduler.ts`), para que un disparo por HTTP
 *   también aparezca en el panel aunque el scheduler no haya corrido en este
 *   proceso.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *     Fuera de producción se permite sin auth para desarrollo local (mismo
 *     patrón que hospitality-holds-expirados / hospitality-reconcile).
 *   • Programación: cada hora en el minuto 30 (`30 * * * *`).
 *   • Solo se llama al servicio OFICIAL del Ministerio: los endpoints viven en
 *     `lib/hospitality/registro-viajeros.ts` y hay una guardia que lo fija.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import {
  JOB_ID_REGISTRO_VIAJEROS,
  JOB_LABEL_REGISTRO_VIAJEROS,
  JOB_SCHEDULE_REGISTRO_VIAJEROS,
  avisosDelBarrido,
  resumenDelBarrido,
  runRegistroViajerosScan,
} from '@/lib/cron/hospitality-registro-viajeros';
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
        { status: 401 }
      );
    }
  }

  // Idempotente (el store no duplica entradas): así un disparo por HTTP
  // aparece en el panel aunque el scheduler no haya registrado el job.
  registerCronJob(
    JOB_ID_REGISTRO_VIAJEROS,
    JOB_LABEL_REGISTRO_VIAJEROS,
    JOB_SCHEDULE_REGISTRO_VIAJEROS
  );

  const startedAt = Date.now();
  cronJobStarted(JOB_ID_REGISTRO_VIAJEROS);
  const result = await runRegistroViajerosScan();
  const durationMs = Date.now() - startedAt;

  if (result.error) {
    cronJobFailed(JOB_ID_REGISTRO_VIAJEROS, result.error, durationMs);
    return NextResponse.json({ ok: false, ...result, durationMs }, { status: 500 });
  }

  // Los partes que el barrido ya no reintenta van como aviso del panel: la pasada
  // ha ido bien (no es un error) pero alguien tiene que mirarlos.
  cronJobCompleted(
    JOB_ID_REGISTRO_VIAJEROS,
    resumenDelBarrido(result),
    durationMs,
    avisosDelBarrido(result)
  );
  return NextResponse.json({ ok: true, ...result, durationMs });
}
