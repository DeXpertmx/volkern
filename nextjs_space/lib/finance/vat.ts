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

/**
 * Conciliación del total de factura: base + IVA − IRPF debe cuadrar con el
 * total detectado. Devuelve null si faltan datos o la diferencia está dentro
 * de la tolerancia (por defecto ±0.02 por redondeos); si no, el desajuste.
 */
export function computeInvoiceTotalMismatch(
  base: string,
  vatAmount: string,
  irpfAmount: string,
  totalFactura: string,
  tolerance = 0.02
): { expected: number; difference: number } | null {
  const b = parseFloat(base)
  const t = parseFloat(totalFactura)
  if (!Number.isFinite(b) || !Number.isFinite(t)) return null

  const v = parseFloat(vatAmount)
  const i = parseFloat(irpfAmount)
  const expected = b + (Number.isFinite(v) ? v : 0) - (Number.isFinite(i) ? i : 0)
  const difference = expected - t

  if (Math.abs(difference) <= tolerance) return null
  return { expected, difference }
}
