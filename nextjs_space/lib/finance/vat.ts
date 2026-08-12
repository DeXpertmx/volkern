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
 * Tramo de IVA del desglose (base imponible y tipo como strings de input).
 */
export interface VatTranche {
  base: string
  rate: string
}

/**
 * Rellena automáticamente los tramos vacíos para que la suma de bases
 * cuadre con `target` (la base imponible total a repartir). Los tramos ya
 * rellenos no se tocan; los vacíos se reparten a partes iguales y el último
 * absorbe el redondeo, de forma que sum(base) === target.
 *
 * `fillableIndices` permite excluir tramos (p. ej. los que el usuario acaba
 * de vaciar a propósito para teclear otro valor). Devuelve null si no hay
 * nada que repartir (objetivo inválido, sin tramos rellenables o resto <= 0).
 */
export function fillEmptyTranches(
  rows: VatTranche[],
  target: string | number,
  fillableIndices?: number[]
): string[] | null {
  const t = typeof target === 'number' ? target : parseFloat(target)
  if (!Number.isFinite(t) || t <= 0) return null

  const isFilled = (r: VatTranche) => {
    const b = parseFloat(r.base)
    return Number.isFinite(b) && b > 0
  }
  const fillable =
    fillableIndices ?? rows.map((_, i) => i).filter(i => !isFilled(rows[i]))
  if (fillable.length === 0) return null

  const sumFilled = rows.reduce(
    (acc, r) => acc + (isFilled(r) ? parseFloat(r.base) : 0),
    0
  )
  const remaining = t - sumFilled
  if (remaining <= 0.005) return null

  const share = Math.round((remaining / fillable.length) * 100) / 100
  const result = rows.map(r => r.base)
  fillable.forEach((idx, k) => {
    const isLast = k === fillable.length - 1
    const val = isLast ? remaining - share * (fillable.length - 1) : share
    result[idx] = val.toFixed(2)
  })
  return result
}

/**
 * Modo "resto en el último": solo el último tramo rellenable absorbe el
 * resto (target − suma de los ya rellenos); los tramos intermedios vacíos
 * se dejan vacíos hasta que el usuario los llene.
 *
 * `fillableIndices` permite excluir tramos (p. ej. los que el usuario acaba
 * de vaciar a propósito para teclear otro valor). Devuelve null si no hay
 * nada que repartir (objetivo inválido, sin tramos rellenables o resto <= 0).
 */
export function fillLastTranche(
  rows: VatTranche[],
  target: string | number,
  fillableIndices?: number[]
): string[] | null {
  const t = typeof target === 'number' ? target : parseFloat(target)
  if (!Number.isFinite(t) || t <= 0) return null

  const isFilled = (r: VatTranche) => {
    const b = parseFloat(r.base)
    return Number.isFinite(b) && b > 0
  }
  const fillable =
    fillableIndices ?? rows.map((_, i) => i).filter(i => !isFilled(rows[i]))
  if (fillable.length === 0) return null

  const sumFilled = rows.reduce(
    (acc, r) => acc + (isFilled(r) ? parseFloat(r.base) : 0),
    0
  )
  const remaining = t - sumFilled
  if (remaining <= 0.005) return null

  const result = rows.map(r => r.base)
  result[fillable[fillable.length - 1]] = remaining.toFixed(2)
  return result
}

/**
 * Conciliación del total de factura:  base + IVA + recargo − IRPF debe cuadrar con el
 * total detectado. El recargo es opcional para mantener la compatibilidad
 * con facturas que no lo usan.
 */
export function computeInvoiceTotalMismatch(
  base: string,
  vatAmount: string,
  irpfAmount: string,
  totalFactura: string,
  surchargeAmount = '',
  tolerance = 0.02
): { expected: number; difference: number } | null {
  const b = parseFloat(base)
  const t = parseFloat(totalFactura)
  if (!Number.isFinite(b) || !Number.isFinite(t)) return null

  const v = parseFloat(vatAmount)
  const i = parseFloat(irpfAmount)
  const s = parseFloat(surchargeAmount)
  const expected = b + (Number.isFinite(v) ? v : 0) + (Number.isFinite(s) ? s : 0) - (Number.isFinite(i) ? i : 0)
  const difference = expected - t

  if (Math.abs(difference) <= tolerance) return null
  return { expected, difference }
}
