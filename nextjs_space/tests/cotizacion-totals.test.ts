import { describe, expect, it } from 'vitest'
import { calculateCotizacionDisplayTotals } from '@/lib/cotizaciones/cotizacion-totals'

describe('Totales visibles de cotización', () => {
  it('separa subtotal bruto, descuentos por línea y subtotal neto', () => {
    const totals = calculateCotizacionDisplayTotals(
      [
        { cantidad: 12, precioUnitario: 199, descuento: 0 },
        { cantidad: 1, precioUnitario: 500, descuento: 500 },
      ],
      2388,
      0,
    )

    expect(totals).toEqual({
      subtotalBruto: 2888,
      descuentosLineas: 500,
      subtotal: 2388,
      descuentoGlobal: 0,
      baseImponible: 2388,
    })
  })

  it('aplica el descuento global después de los descuentos por línea', () => {
    const totals = calculateCotizacionDisplayTotals(
      [{ cantidad: 1, precioUnitario: 1000, descuento: 100 }],
      900,
      90,
    )

    expect(totals.subtotalBruto).toBe(1000)
    expect(totals.descuentosLineas).toBe(100)
    expect(totals.subtotal).toBe(900)
    expect(totals.descuentoGlobal).toBe(90)
    expect(totals.baseImponible).toBe(810)
  })
})
