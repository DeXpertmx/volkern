import { prisma } from '../db';

/**
 * Purga de ejecuciones de automatización colgadas.
 *
 * El motor crea el AutomationLog en estado `queued` y el worker lo cierra
 * con el resultado real (`success` / `partial` / `failed`). Si el worker
 * está caído, el job se perdió o Redis dejó de aceptar jobs, ese log se
 * quedaría en `queued`/`running` para siempre: en la UI parecería una
 * ejecución en curso en lugar de una automatización que nunca se ejecutó.
 *
 * Este cron cierra esas ejecuciones como `failed` con la causa, para que el
 * estado mostrado sea siempre el real.
 */

/** Minutos tras los cuales una ejecución sin cerrar se considera colgada. */
export const STUCK_EXECUTION_MINUTES = 15;

export type AutomationSweepResult = {
  revisadas: number;
  cerradas: number;
  reclamacionesLiberadas: number;
};

/**
 * Libera reclamaciones de idempotencia que quedaron a medias.
 *
 * Cuando el worker reclama una acción (`claimed`) y muere antes de cerrarla,
 * la clave quedaría ocupada para siempre y esa tarea/limpieza no se crearía
 * nunca más: otra forma de fallo silencioso. Pasado el margen se libera para
 * que un evento posterior pueda ejecutarla de verdad.
 *
 * Sólo es posible un duplicado en el caso extremo de que el proceso muriera
 * entre crear el artefacto y marcar la reclamación como completada.
 */
async function releaseStaleClaims(cutoff: Date): Promise<number> {
  try {
    const res = await (prisma as any).automationActionExecution.deleteMany({
      where: { estado: 'claimed', createdAt: { lt: cutoff } },
    });
    return res?.count ?? 0;
  } catch (error) {
    console.error('[Cron] ❌ automation_sweep: no se pudieron liberar reclamaciones colgadas:', error);
    return 0;
  }
}

export async function runAutomationSweep(
  minutes: number = STUCK_EXECUTION_MINUTES
): Promise<AutomationSweepResult> {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const reclamacionesLiberadas = await releaseStaleClaims(cutoff);
  if (reclamacionesLiberadas > 0) {
    console.log(
      `[Cron] ⚠️ automation_sweep: ${reclamacionesLiberadas} reclamación(es) de idempotencia liberadas (el worker murió a mitad)`
    );
  }

  try {
    const colgadas = await (prisma as any).automationLog.findMany({
      where: {
        status: { in: ['queued', 'running'] },
        executedAt: { lt: cutoff },
      },
      select: { id: true, status: true, result: true },
      take: 500,
    });

    if (colgadas.length === 0) {
      console.log('[Cron] ✅ automation_sweep: sin ejecuciones colgadas');
      return { revisadas: 0, cerradas: 0, reclamacionesLiberadas };
    }

    let cerradas = 0;
    for (const log of colgadas) {
      try {
        const resultPrevios =
          log.result && typeof log.result === 'object' && !Array.isArray(log.result)
            ? log.result
            : {};

        await (prisma as any).automationLog.update({
          where: { id: log.id },
          data: {
            status: 'failed',
            error: `Ejecución sin cerrar: el worker no la procesó en ${minutes} min (cola o worker caídos)`,
            result: {
              ...resultPrevios,
              message:
                log.status === 'running'
                  ? 'El worker empezó la ejecución pero no la cerró'
                  : 'Las acciones quedaron encoladas y nunca se ejecutaron',
              staleClosedAt: new Date().toISOString(),
            },
          },
        });
        cerradas++;
      } catch (error) {
        console.error(`[Cron] ❌ automation_sweep: no se pudo cerrar el log ${log.id}:`, error);
      }
    }

    console.log(
      `[Cron] ✅ automation_sweep: ${cerradas}/${colgadas.length} ejecuciones colgadas cerradas como failed`
    );
    return { revisadas: colgadas.length, cerradas, reclamacionesLiberadas };
  } catch (error) {
    console.error('[Cron] ❌ Error fatal en automation_sweep:', error);
    throw error;
  }
}
