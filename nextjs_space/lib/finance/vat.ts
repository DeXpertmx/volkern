/**
 * Cálculos de importes porcentuales para el registro de gastos y facturas
 * (cuota de IVA, retención de IRPF, etc.).
 */

/**
 * Importe = base × porcentaje / 100 (p. ej. cuota IVA o retención IRPF).
 * Recibe strings (valores de formulario) y devuelve '' si falta algún dato
 * o los valores no son válidos, para no pisar valores ya existentes.
 */
export function computePercentageAmount(base: string, rate: string): string {
  const b = parseFloat(base)
  const r = parseFloat(rate)
  if (!Number.isFinite(b) || !Number.isFinite(r) || b <= 0 || r <= 0) return ''
  return ((b * r) / 100).toFixed(2)
}

/**
 * Cuota de IVA = base imponible × tipo / 100.
 * Alias de computePercentageAmount para mantener compatibilidad.
 */
export const computeVatAmount = computePercentageAmount;
