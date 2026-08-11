/**
 * Cálculos de IVA para el registro de gastos y facturas.
 */

/**
 * Cuota de IVA = base imponible × tipo / 100.
 * Recibe strings (valores de formulario) y devuelve '' si falta algún dato
 * o los valores no son válidos, para no pisar valores ya existentes.
 */
export function computeVatAmount(base: string, rate: string): string {
  const b = parseFloat(base)
  const r = parseFloat(rate)
  if (!Number.isFinite(b) || !Number.isFinite(r) || b <= 0 || r <= 0) return ''
  return ((b * r) / 100).toFixed(2)
}
