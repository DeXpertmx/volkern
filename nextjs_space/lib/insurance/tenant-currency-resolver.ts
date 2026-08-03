/**
 * Resolver de moneda preferida del tenant.
 *
 * Problema: `Tenant.moneda` (la "moneda de reporte" del portfolio ejecutivo) defaults
 * a `'MXN'` en el schema. Si al crear el tenant nadie la cambia y luego se importan
 * pólizas en otra moneda (EUR, USD, etc.), el portfolio ejecutivo muestra el KPI
 * global convertido a MXN — confundiendo al broker ("yo manejo Euros pero veo MXN").
 *
 * Esta librería ofrece la lógica de auto-detección recomendada:
 *   • 1 moneda en uso (cualquiera) → esa moneda.
 *   • 0 pólizas → fallback conservador (configurable; default MXN).
 *   • >1 moneda (mixto) → fallback conservador (configurable; default MXN).
 *
 * Se usa desde:
 *   • `scripts/seed-partner-tenants.ts` — para forzar el prompt antes de crear.
 *   • `scripts/update-tenant-currency.ts` — para sugerir el fix tras importación.
 *   • Posibles endpoints futuros de import masivo (auto-set on first import).
 *
 * NO importa Prisma. La capa de I/O se hace fuera; aquí la lógica pura para poder
 * testearla de forma aislada y reusarla en distintos frontends (CLI, API, UI).
 */
import { SUPPORTED_CURRENCIES, type Currency } from './currency';

export type ResolverSource = 'auto-from-polizas' | 'explicit' | 'fallback-default';

export interface CurrencyResolution {
  /** Moneda sugerida para el tenant. */
  moneda: Currency;
  /** Cómo se obtuvo la moneda: explícita, auto-detectada, o fallback. */
  source: ResolverSource;
  /** Monedas distintas observadas en las pólizas (útil para diagnóstico). */
  monedasObservadas: Currency[];
  /** Cantidad de pólizas en cada moneda. */
  distribucion: Record<string, number>;
  /** Mensaje humano explicando la decisión (para mostrar al usuario). */
  mensaje: string;
}

export interface ResolveOptions {
  /**
   * Moneda a usar cuando:
   *   • El usuario pasa una explícita (sobrescribe todo).
   *   • No hay pólizas (fallback).
   *   • Las pólizas están en monedas mixtas (fallback conservador).
   */
  fallbackDefault?: Currency;
}

/**
 * Decisión pura: dada la moneda explícita (o null si no la hay) y la composición
 * de pólizas, devuelve la moneda sugerida con su proveniencia.
 *
 * Reglas (en orden):
 *   1. Si `explicitCurrency` es válida → gana (source='explicit').
 *   2. Si no hay pólizas → fallback default (source='fallback-default').
 *   3. Si las pólizas tienen exactamente una moneda → esa moneda (source='auto-from-polizas').
 *   4. Si hay varias monedas → fallback default (source='fallback-default').
 *
 * @param explicitCurrency   Moneda que el usuario eligió explícitamente (o null).
 * @param polizasPorMoneda   Distribución de pólizas por moneda. Ej: { EUR: 12, USD: 0, MXN: 0 }.
 * @param opts               Opciones (fallbackDefault).
 */
export function resolveTenantCurrency(
  explicitCurrency: string | null | undefined,
  polizasPorMoneda: Record<string, number>,
  opts: ResolveOptions = {}
): CurrencyResolution {
  const fallback = opts.fallbackDefault ?? 'MXN';

  // 1) Explícita del usuario: prioriza toda la evidencia.
  if (explicitCurrency) {
    const c = explicitCurrency.toUpperCase() as Currency;
    if (SUPPORTED_CURRENCIES.includes(c)) {
      return {
        moneda: c,
        source: 'explicit',
        monedasObservadas: extractMonedas(polizasPorMoneda),
        distribucion: polizasPorMoneda,
        mensaje: `Moneda configurada explícitamente: ${c}.`,
      };
    }
    // Si el usuario pasó una moneda inválida, sigue con auto-detección y reporta.
  }

  // 2) Sin pólizas → fallback conservador.
  const monedasObservadas = extractMonedas(polizasPorMoneda);
  if (monedasObservadas.length === 0) {
    return {
      moneda: fallback,
      source: 'fallback-default',
      monedasObservadas: [],
      distribucion: polizasPorMoneda,
      mensaje: `Sin pólizas aún. Default conservador: ${fallback}. ` +
        `Cambiable vía /dashboard/configuracion o scripts/update-tenant-currency.ts.`,
    };
  }

  // 3) Una sola moneda → esa.
  if (monedasObservadas.length === 1) {
    return {
      moneda: monedasObservadas[0],
      source: 'auto-from-polizas',
      monedasObservadas,
      distribucion: polizasPorMoneda,
      mensaje:
        `Auto-detección: 100% de las pólizas están en ${monedasObservadas[0]}. ` +
        `Se seteó ${monedasObservadas[0]} como moneda de reporte.`,
    };
  // 4) Mixto → fallback conservador.
  } else {
    const lista = monedasObservadas.join(', ');
    return {
      moneda: fallback,
      source: 'fallback-default',
      monedasObservadas,
      distribucion: polizasPorMoneda,
      mensaje:
        `Portfolio multi-divisa (${monedasObservadas.length} monedas: ${lista}). ` +
        `Default conservador: ${fallback}. El broker puede cambiar la moneda de reporte ` +
        `cuando termine de importar.`,
    };
  }
}

/**
 * Devuelve solo las claves con count > 0, normalizadas a mayúsculas y filtradas
 * a `SUPPORTED_CURRENCIES` (defensivo: descarta monedas descontinuadas o typos).
 */
function extractMonedas(polizasPorMoneda: Record<string, number>): Currency[] {
  return Object.entries(polizasPorMoneda)
    .filter(([_, count]) => count > 0)
    .map(([m]) => m.toUpperCase() as Currency)
    .filter((m): m is Currency => SUPPORTED_CURRENCIES.includes(m));
}

/**
 * Helper para producir el `Record<string, number>` desde un array de pólizas,
 * consumido por los scripts de import y por el auto-detector de mixed-currency.
 *
 * Se exporta para que el código de import (e.g. CSV wizard) pueda llamar:
 *   const dist = await groupByMoneda(rows);
 *   const r = resolveTenantCurrency(null, dist);
 */
export async function groupByMoneda(
  rows: Array<{ moneda?: string | null }>
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const m = (r.moneda ?? 'UNKNOWN').toString().toUpperCase();
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}
