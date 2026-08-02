/**
 * Normalización de monedas del vertical Seguros.
 *
 * Por qué existe: una póliza se almacena en su `moneda` nativa (EUR, USD, MXN,
 * etc.). El tenant tiene su propia `moneda` "de reporte" (default MXN). El
 * portfolio ejecutivo debe mostrar KPIs/prima total en la moneda del tenant;
 * si mezclamos números en bruto, una póliza de €1000 sumada con una de
 * MX$20,000 produce una cifra sin sentido.
 *
 * Estrategia:
 *   · Tabla FX estática actualizada manualmente (mejor esfuerzo, no live).
 *     En producción, una capa superior podría llamarse a openexchangerates
 *     o banxico y cachear 24h, pero para el portfolio basta con un taux fijo.
 *   · Todas las monedas se convierten vía USD como pivote (más simple, baja
 *     matematización, suficiente hasta 6 monedas simultáneas).
 *   · Monedas desconocidas: fallback identity con warning a `console.warn`
 *     una sola vez por sesión (vía Set cacheado).
 *
 * Tests:
 *   tests/currency.test.ts (puros)
 */

export type Currency = 'USD' | 'EUR' | 'MXN' | 'GBP' | 'JPY' | 'CNY' | 'CAD' | 'BRL' | 'CLP' | 'ARS' | 'COP' | 'PEN';

/**
 * Rates expresados como: 1 unidad de MONEDA = X USD.
 * Datos aproximados a Q4 2025, revisables. La fuente real en producción
 * sería un fetch diario a un FX provider + cache 24h.
 *
 * Para monedas que no estén aquí, el helper cae a identidad defensiva con
 * warning; el portfolio muestra un banner para que el broker sepa.
 */
export const FX_TO_USD: Record<Currency, number> = {
  USD: 1.0,
  EUR: 1.08,
  MXN: 0.058,    // ≈17.30 MXN por USD
  GBP: 1.27,
  JPY: 0.0066,   // ≈152 JPY por USD
  CNY: 0.14,
  CAD: 0.73,
  BRL: 0.18,
  CLP: 0.0011,   // ≈920 CLP por USD
  ARS: 0.0011,   // muy volátil; placeholder
  COP: 0.00024,
  PEN: 0.27,
};

/** Cache en memoria para warning de monedas desconocidas (evita spam). */
const warnedCurrencies = new Set<string>();

/** Pivote central: convierte cualquier moneda → USD. */
export function toUSD(amount: number, from: string): number {
  const rate = FX_TO_USD[from as Currency];
  if (typeof rate !== 'number') {
    if (!warnedCurrencies.has(from)) {
      warnedCurrencies.add(from);
      console.warn(`[currency] Moneda "${from}" sin FX rate — identidad defensiva. Revisa lib/insurance/currency.ts.`);
    }
    return amount;
  }
  return amount * rate;
}

/** USD → cualquier moneda destino. */
export function fromUSD(amountUsd: number, to: string): number {
  const rate = FX_TO_USD[to as Currency];
  if (typeof rate !== 'number') {
    if (!warnedCurrencies.has(to)) {
      warnedCurrencies.add(to);
      console.warn(`[currency] Moneda "${to}" sin FX rate — identidad defensiva.`);
    }
    return amountUsd;
  }
  return amountUsd / rate;
}

/**
 * Convierte de `from` a `to` a través del pivote USD.
 *   fxConvert(100, 'EUR', 'MXN') = (100 × 1.08) / 0.058 ≈ 1862 MXN
 *
 * Útil cuando el tenant reporta en una moneda y la póliza está en otra.
 */
export function fxConvert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  // Idempotente vía USD. Si alguna de las dos está missing, defensiva.
  const fromRate = FX_TO_USD[from as Currency];
  const toRate = FX_TO_USD[to as Currency];
  if (typeof fromRate !== 'number' || typeof toRate !== 'number') return amount;
  return (amount * fromRate) / toRate;
}

/**
 * Suma un array de montos heterogéneos y devuelve el total en `targetCurrency`.
 *
 *   sumaEnMonedaTarget([
 *     { monto: 1000, moneda: 'EUR' },
 *     { monto: 20000, moneda: 'MXN' },
 *   ], 'MXN')
 *   = 1000 × 1.08 / 0.058 + 20000 ≈ 1862 + 20000 = 21862 MXN
 */
export function sumaEnMonedaTarget(
  rows: Array<{ monto: number; moneda: string | null | undefined }>,
  targetCurrency: string
): number {
  return rows.reduce((acc, r) => {
    const m = Number(r.monto ?? 0);
    if (!m) return acc;
    return acc + fxConvert(m, r.moneda ?? 'USD', targetCurrency);
  }, 0);
}

/**
 * Helper para stats: desglosa un array por moneda y suma en targetCurrency.
 * Devuelve { totalEnTarget, porMoneda: { EUR: X, MXN: Y }, mezcla: boolean }
 */
export function resumenMoneda(
  rows: Array<{ monto: number; moneda: string | null | undefined }>,
  targetCurrency: string
): {
  totalEnTarget: number;
  porMoneda: Record<string, { count: number; totalOriginal: number; totalEnTarget: number }>;
  mezcla: boolean;
} {
  const buckets: Record<string, { count: number; totalOriginal: number; totalEnTarget: number }> = {};
  let totalEnTarget = 0;
  for (const r of rows) {
    const m = Number(r.monto ?? 0);
    const mon = r.moneda ?? 'UNKNOWN';
    const enTarget = fxConvert(m, mon, targetCurrency);
    totalEnTarget += enTarget;
    if (!buckets[mon]) buckets[mon] = { count: 0, totalOriginal: 0, totalEnTarget: 0 };
    buckets[mon].count++;
    buckets[mon].totalOriginal += m;
    buckets[mon].totalEnTarget += enTarget;
  }
  // mezcla = true si hay >1 moneda presente (excluyendo la target dominante).
  const monedasEnUso = Object.keys(buckets).filter(m => buckets[m].count > 0);
  const mezcla = monedasEnUso.length > 1;
  return { totalEnTarget, porMoneda: buckets, mezcla };
}

export const CURRENCY_CONSTANTS = {
  DEFAULT_TENANT_CURRENCY: 'MXN',
  FX_TO_USD,
} as const;
