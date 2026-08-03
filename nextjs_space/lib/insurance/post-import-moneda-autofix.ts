/**
 * Auto-fix de `Tenant.moneda` tras el primer batch de pólizas importadas.
 *
 * Cierra el loop del path `--allow-auto` del seed script y del wizard de import:
 * si el broker aceptó el default MXN al crear el tenant y luego importa un
 * primer batch 100% en otra moneda (EUR, USD…), esta función ajusta la
 * moneda de reporte automáticamente — saltando el cooldown de 24h del
 * endpoint normal `/api/tenant/moneda` y dejando un audit log con fuente
 * distinguible (`auto-set from first import`).
 *
 * Por qué existe (escenario real):
 *   1. Broker nuevo, prompt saltado con `--allow-auto` o via admin rápido
 *      → tenant.moneda = 'MXN' (default schema).
 *   2. Broker sube primer CSV polizas via wizard → polizas importadas con
 *      moneda='EUR' (default de Poliza o detectada por columna explícita).
 *   3. Sin este fix: portfolio ejecutivo muestra KPI global en MXN
 *      (confuso: el broker dice "yo manejo Euros pero veo MXN").
 *   4. Con este fix: tenant.moneda pasa a EUR automáticamente, broker ve
 *      € desde el primer reload del dashboard.
 *
 * Reglas de decisión (del resolver):
 *   • tenant.moneda !== 'MXN' → noop (ya está correcto o es intencionado).
 *   • batchSize < minBatchSize → noop.
 *   • Solo 1 moneda no-MXN observada → auto-fix a esa moneda.
 *   • 0 monedas o varias monedas → noop (cae al default conservador).
 *
 * Por qué NO intenta hacerlo también para el caso `tenant.moneda='USD'`
 * que tendría que pasar a 'EUR': las reglas de auto-fix son conservadoras
 * unidireccionales desde el default MXN. Cualquier otro caso queda fuera
 * del scope y debe resolverse vía `update-tenant-currency.ts` (manual).
 */
import { globalPrisma } from '@/lib/db';
import {
  resolveTenantCurrency,
  groupByMoneda,
  type CurrencyResolution,
} from './tenant-currency-resolver';
import type { Currency } from './currency';

/** Motivo por el que decidimos actuar o no actuar. Útil para diagnóstico. */
export type AutoFixReason =
  | 'already-correct' // tenant.moneda !== 'MXN' (ya está en la moneda esperada)
  | 'batch-empty' // no se importaron pólizas
  | 'empty-distribution' // 0 monedas observadas (raro)
  | 'mixed-currency' // >1 moneda → no auto-fix (conservador)
  | 'batch-too-small' // size < minBatchSize
  | 'dry-run-suggested' // dryRun: decidimos auto-fix pero no escribimos
  | 'auto-fix-applied'; // escribimos tenant.moneda + audit log

export interface AutoFixOptions {
  /**
   * Si true, la función solo resuelve sin escribir. Útil para diagnósticos
   * desde scripts como `diagnose-tenant-currency.ts`.
   */
  dryRun?: boolean;
  /**
   * Mínimo de pólizas en el batch para considerar auto-fix.
   * Default: 1 (cualquier batch no vacío es suficiente).
   */
  minBatchSize?: number;
  /**
   * IP que se registra en el audit log cuando se aplica el auto-fix
   * (para distinguir auto-set de cambios manuales del usuario).
   * Default: 'system:auto-import'.
   */
  source?: string;
}

export interface AutoFixResult {
  /** ¿Se escribió un cambio? (true sólo si dryRun=false y reason=auto-fix-applied) */
  changed: boolean;
  reason: AutoFixReason;
  /** Moneda anterior (lo que tenía tenant.moneda). */
  previousMoneda: Currency;
  /** Moneda sugerida por el resolver. */
  suggestedMoneda: Currency;
  /** Moneda efectivamente aplicada (undefined si no se escribió). */
  appliedMoneda?: Currency;
  /** Source del resolver (auto-from-polizas o fallback-default). */
  resolverSource: CurrencyResolution['source'];
  /** Distribución de monedas del batch. */
  distribution: Record<string, number>;
  /** Mensaje humano explicando la decisión. */
  mensaje: string;
  /** ISO timestamp de cuándo se aplicó el cambio (si aplica). */
  aplicadoAt?: string;
  /** Resolution completa del resolver (trazabilidad). */
  resolution: CurrencyResolution;
}

/**
 * Decide y aplica (opcionalmente) el auto-fix de `Tenant.moneda` tras un import.
 *
 * @param tenantId            ID del tenant en el Control Plane.
 * @param batchRows           Filas del batch recién importado (cada una con `moneda` opcional).
 * @param options             dryRun, minBatchSize, source.
 *
 * Uso típico (desde el endpoint de import):
 * ```ts
 * const batchStartTime = new Date();
 * // ... loop de import ...
 * const result = await maybeAutoFixTenantCurrencyAfterImport(
 *   tenantId,
 *   importedRows.map(r => ({ moneda: r.moneda })), // o []
 *   { dryRun: false, minBatchSize: 1 },
 * );
 * if (result.changed) {
 *   console.warn(`Auto-fix applied: ${result.previousMoneda} → ${result.appliedMoneda}`);
 * }
 * ```
 */
export async function maybeAutoFixTenantCurrencyAfterImport(
  tenantId: string,
  batchRows: Array<{ moneda?: string | null }>,
  options: AutoFixOptions = {}
): Promise<AutoFixResult> {
  const { dryRun = false, minBatchSize = 1, source = 'system:auto-import' } = options;

  // 1. Leer estado actual del tenant
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, moneda: true },
  });

  if (!tenant) {
    throw new Error(`[auto-fix-moneda] tenant no encontrado: ${tenantId}`);
  }

  const previousMoneda = (tenant.moneda ?? 'MXN') as Currency;

  // 2. Regla: si el tenant no está en MXN default, no auto-fixeamos nada.
  //    El broker ya eligió su moneda intencionadamente.
  if (previousMoneda !== 'MXN') {
    return makeResult({
      reason: 'already-correct',
      previousMoneda,
      suggestedMoneda: previousMoneda,
      appliedMoneda: undefined,
      resolverSource: 'explicit',
      distribution: await groupByMoneda(batchRows),
      mensaje: `Tenant ya tiene moneda ${previousMoneda} (no es el default MXN). No auto-fixeamos.`,
      changed: false,
    });
  }

  // 3. Regla: batch vacío → noop.
  if (batchRows.length < minBatchSize) {
    return makeResult({
      reason: 'batch-empty',
      previousMoneda,
      suggestedMoneda: previousMoneda,
      appliedMoneda: undefined,
      resolverSource: 'fallback-default',
      distribution: {},
      mensaje:
        `Batch vacío (${batchRows.length} < minBatchSize=${minBatchSize}). No auto-fixeamos.`,
      changed: false,
    });
  }

  // 4. Resolver: distribución del batch + decisión
  const distribution = await groupByMoneda(batchRows);
  const resolution = resolveTenantCurrency(null, distribution, { fallbackDefault: 'MXN' });

  // 5. Regla: auto-fix sólo cuando source='auto-from-polizas' Y la moneda
  //    sugerida NO es el fallback default 'MXN'.
  if (resolution.source !== 'auto-from-polizas' || resolution.moneda === 'MXN') {
    const reason: AutoFixReason =
      Object.keys(distribution).length === 0
        ? 'empty-distribution'
        : 'mixed-currency';
    return makeResult({
      reason,
      previousMoneda,
      suggestedMoneda: resolution.moneda,
      appliedMoneda: undefined,
      resolverSource: resolution.source,
      distribution,
      mensaje: `${resolution.mensaje} (auto-fix no aplica: conservador).`,
      changed: false,
      resolution,
    });
  }

  // 6. Decisión: auto-fix warranted. ¿Aplicar o sólo reportar?
  if (dryRun) {
    return makeResult({
      reason: 'dry-run-suggested',
      previousMoneda,
      suggestedMoneda: resolution.moneda,
      appliedMoneda: undefined,
      resolverSource: resolution.source,
      distribution,
      mensaje:
        `[DRY-RUN] Auto-fix sugerido: ${previousMoneda} → ${resolution.moneda}. ` +
        `Re-ejecuta con dryRun=false para aplicar.`,
      changed: false,
      resolution,
    });
  }

  // 7. Aplicar: update + audit log
  const now = new Date();
  await globalPrisma.tenant.update({
    where: { id: tenantId },
    data: {
      moneda: resolution.moneda,
      // Trazabilidad: cambios automáticos por import = IMPORT_AUTO.
      // Distinguible del cambio manual (EXPLICIT) o fallback heredado (FALLBACK).
      // Permite queries tipo "tenants auto-corregidos esta semana".
      monedaInferida: resolution.moneda,
      monedaInferenciaSource: 'IMPORT_AUTO',
    },
  });

  try {
    await globalPrisma.auditLog.create({
      data: {
        accion: 'actualizar',
        entidad: 'tenant',
        entidadId: tenantId,
        descripcion:
          `Auto-set desde primer import: ${previousMoneda} → ${resolution.moneda} ` +
          `(fuente=IMPORT_AUTO, ${distribution[resolution.moneda]} pólizas importadas, source=${source}). ` +
          `Cooldown de 24h saltado (es auto-fix, no cambio manual).`,
        cambiosAntes: { moneda: previousMoneda } as any,
        cambiosDespues: { moneda: resolution.moneda } as any,
      },
    });
  } catch (auditErr: any) {
    // No rollbackamos si el audit falla; el cambio ya está en BD.
    console.warn(
      `[auto-fix-moneda] tenant.moneda actualizado pero audit log falló: ${auditErr?.message}`,
    );
  }

  return makeResult({
    reason: 'auto-fix-applied',
    previousMoneda,
    suggestedMoneda: resolution.moneda,
    appliedMoneda: resolution.moneda,
    resolverSource: resolution.source,
    distribution,
    mensaje:
      `Auto-fix aplicado: ${previousMoneda} → ${resolution.moneda} ` +
      `(${distribution[resolution.moneda]} pólizas importadas).`,
    changed: true,
    aplicadoAt: now.toISOString(),
    resolution,
  });
}

function makeResult(args: {
  reason: AutoFixReason;
  previousMoneda: Currency;
  suggestedMoneda: Currency;
  appliedMoneda: Currency | undefined;
  resolverSource: CurrencyResolution['source'];
  distribution: Record<string, number>;
  mensaje: string;
  changed: boolean;
  aplicadoAt?: string;
  resolution?: CurrencyResolution;
}): AutoFixResult {
  return {
    reason: args.reason,
    previousMoneda: args.previousMoneda,
    suggestedMoneda: args.suggestedMoneda,
    appliedMoneda: args.appliedMoneda,
    resolverSource: args.resolverSource,
    distribution: args.distribution,
    mensaje: args.mensaje,
    changed: args.changed,
    aplicadoAt: args.aplicadoAt,
    resolution: args.resolution ?? {
      moneda: args.suggestedMoneda,
      source: args.resolverSource,
      monedasObservadas: Object.keys(args.distribution).filter(
        k => args.distribution[k] > 0,
      ) as Currency[],
      distribucion: args.distribution,
      mensaje: args.mensaje,
    },
  };
}
