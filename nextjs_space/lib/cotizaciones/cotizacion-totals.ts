export interface CotizacionDisplayItem {
  cantidad: number
  precioUnitario: number
  descuento?: number | null
}

export interface CotizacionDisplayTotals {
  subtotalBruto: number
  descuentosLineas: number
  subtotal: number
  descuentoGlobal: number
  baseImponible: number
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateCotizacionDisplayTotals(
  items: CotizacionDisplayItem[] | null | undefined,
  subtotalValue: number,
  descuentoMontoValue: number,
): CotizacionDisplayTotals {
  const subtotalBruto = roundCurrency(
    (items || []).reduce((sum, item) => {
      const cantidad = Number(item.cantidad) || 0
      const precioUnitario = Number(item.precioUnitario) || 0
      return sum + Math.max(0, cantidad * precioUnitario)
    }, 0),
  )
  const descuentosLineas = roundCurrency(
    (items || []).reduce((sum, item) => sum + Math.max(0, Number(item.descuento) || 0), 0),
  )
  const subtotalCalculado = roundCurrency(Math.max(0, subtotalBruto - descuentosLineas))
  const subtotal = Number.isFinite(Number(subtotalValue))
    ? roundCurrency(Math.max(0, Number(subtotalValue)))
    : subtotalCalculado
  const descuentoGlobal = roundCurrency(
    Math.min(subtotal, Math.max(0, Number(descuentoMontoValue) || 0)),
  )

  return {
    subtotalBruto,
    descuentosLineas,
    subtotal,
    descuentoGlobal,
    baseImponible: roundCurrency(Math.max(0, subtotal - descuentoGlobal)),
  }
}
