/**
 * Persistencia del forecast de portfolio — helpers idempotentes extraídos de
 * los GET de /api/insurance/portfolio/forecast y /forecast/smart.
 *
 * Antes, la escritura vivía inline dentro de los handlers de GET. Se extrae
 * aquí para:
 *   1. Dejar los handlers legibles (solo orquestan cálculo + persistencia).
 *   2. Garantizar idempotencia en un único punto (constraint única
 *      tenantId_mesProyectado_sourceVersion + filtros `real: null`).
 *   3. Poder invocar los mismos helpers desde un job/cron en el futuro sin
 *      duplicar lógica.
 */

import { prisma } from '@/lib/db';
import { fxConvert, type Currency } from '@/lib/insurance/currency';

export const FORECAST_SOURCE_VERSION = 'v1-linear-6m';
export const SMART_FORECAST_SOURCE_VERSION = 'v2-smart-seasonal';

export interface ForecastLogData {
  /** Primer día (YYYY-MM-01) del mes al que apunta la proyección. */
  mesProyectado: Date;
  proyectado: number;
  slope: number;
  intercepto: number;
  r2: number;
  ventanaMeses: number;
  sourceVersion: string;
}

/**
 * Acumula la prima real emitida en un mes (YYYY-MM-01) sumando las pólizas
 * emitidas entre el primer y el último instante de ese mes, convirtiendo
 * cada póliza a `targetCurrency`.
 */
export async function sumaRealDelMes(
  tenantId: string,
  mes: Date,
  targetCurrency: Currency
): Promise<number> {
  const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
  const rows = await prisma.poliza.findMany({
    where: {
      tenantId,
      fechaEmision: { gte: mes, lt: fin },
    },
    select: { primaAnual: true, moneda: true },
  });
  return rows.reduce(
    (acc, r) =>
      acc + fxConvert(Number(r.primaAnual ?? 0), (r.moneda as string) ?? 'USD', targetCurrency),
    0
  );
}

/**
 * Upsert idempotente del log del forecast base. Si el log ya existía para
 * (tenant, mes, sourceVersion), actualiza el proyectado (los hiperparámetros
 * pueden cambiar) pero NO pisa `real`/`errorPct` ya backfilleados.
 * Devuelve `null` si falla (el log es auditoría: no debe romper la respuesta).
 */
export async function persistForecastLog(
  tenantId: string,
  data: ForecastLogData
): Promise<{ id: string } | null> {
  try {
    const persisted = await prisma.portfolioForecastLog.upsert({
      where: {
        tenantId_mesProyectado_sourceVersion: {
          tenantId,
          mesProyectado: data.mesProyectado,
          sourceVersion: data.sourceVersion,
        },
      },
      create: {
        tenantId,
        mesProyectado: data.mesProyectado,
        proyectado: data.proyectado,
        slope: data.slope,
        intercepto: data.intercepto,
        r2: data.r2,
        ventanaMeses: data.ventanaMeses,
        sourceVersion: data.sourceVersion,
      },
      update: {
        proyectado: data.proyectado,
        slope: data.slope,
        intercepto: data.intercepto,
        r2: data.r2,
        ventanaMeses: data.ventanaMeses,
      },
    });
    return { id: persisted.id };
  } catch (logError) {
    console.error('[forecast] No se pudo persistir el log:', logError);
    return null;
  }
}

/**
 * Backfill idempotente de logs cuyo mes apuntado ya cerró: para cada log con
 * `mesProyectado < ahora` y `real IS NULL`, calcula la prima real del mes y
 * persiste `real` + `errorPct` + `backfilledEn`. Devuelve cuántos backfilleó.
 * Idempotente: los logs ya backfilleados (real NOT NULL) se ignoran.
 */
export async function backfillForecastLogs(
  tenantId: string,
  tenantMoneda: Currency
): Promise<number> {
  try {
    const ahora = new Date();
    const pendientes = await prisma.portfolioForecastLog.findMany({
      where: {
        tenantId,
        mesProyectado: { lt: ahora },
        real: null,
      },
      select: { id: true, mesProyectado: true },
    });

    let count = 0;
    for (const p of pendientes) {
      const real = await sumaRealDelMes(tenantId, p.mesProyectado, tenantMoneda);
      const fullLog = await prisma.portfolioForecastLog.findUnique({
        where: { id: p.id },
        select: { proyectado: true },
      });
      const proyectadoOriginal = Number(fullLog?.proyectado ?? 0);
      const errorPct = proyectadoOriginal > 0
        ? (Math.abs(proyectadoOriginal - real) / proyectadoOriginal) * 100
        : real > 0
          ? 100
          : 0;

      await prisma.portfolioForecastLog.update({
        where: { id: p.id },
        data: {
          real,
          errorPct,
          backfilledEn: new Date(),
        },
      });
      count++;
    }
    return count;
  } catch (backfillError) {
    console.error('[forecast] Error en backfill batch:', backfillError);
    return 0;
  }
}

/**
 * Persiste el log de auditoría del forecast smart (sourceVersion
 * `v2-smart-seasonal`). Fire-and-forget: si falla, no rompe la respuesta.
 */
export async function persistSmartForecastLog(
  tenantId: string,
  data: { mesProyectado: Date; proyectado: number; slope: number; intercepto: number; r2: number }
): Promise<void> {
  try {
    await prisma.portfolioForecastLog
      .create({
        data: {
          tenantId,
          mesProyectado: data.mesProyectado,
          proyectado: data.proyectado,
          slope: data.slope,
          intercepto: data.intercepto,
          r2: data.r2,
          ventanaMeses: 6,
          sourceVersion: SMART_FORECAST_SOURCE_VERSION,
          backfilledEn: null,
          alertaEnviadaAt: null,
          alertaConversacionId: null,
        },
      })
      .catch(() => {});
  } catch (err) {
    console.warn('[forecast/smart] No se pudo persistir log de auditoría:', err);
  }
}