import { describe, expect, it } from 'vitest'
import { normalizeVatBreakdown, parseInvoiceText, sanitizeSupplierName } from '@/lib/invoice-parser'

describe('parseInvoiceText · facturas con varios IVA', () => {
  it('conserva los tres tramos con sus bases y cuotas', () => {
    const result = parseInvoiceText(`
      SUMINISTROS GENERALES DEL SUR S.L.
      NIF: B12345678
      FACTURA Nº F-2026-0812
      Fecha Emisión: 12/08/2026
      Vencimiento: 12/09/2026
      Forma de pago: Transferencia bancaria a 30 días
      EMISOR\tRECEPTOR
      SUMINISTROS GENERALES DEL SUR S.L.\tMI EMPRESA S.L.
      NIF: B12345678\tNIF: B87654321
      DESGLOSE IMPOSITIVO POR TIPO DE IVA
      Tipo IVA\tBase Imponible\tCuota IVA
      21,00 %\t300,00 €\t63,00 €
      10,00 %\t200,00 €\t20,00 €
      4,00 %\t100,00 €\t4,00 €
      Base Imponible Total: 600,00 €
      Recargo de equivalencia (5,20%): 31,20 €
      Total Impuestos (IVA): 87,00 €
      Régimen general
      TOTAL FACTURA: 718,20 €
    `)

    expect(result).not.toBeNull()
    expect(result!.fecha_emision).toBe('12/08/2026')
    expect(result!.fecha_operacion).toBeNull()
    expect(result!.fecha_vencimiento).toBe('12/09/2026')
    expect(result!.moneda).toBe('EUR')
    expect(result!.forma_pago).toBe('Transferencia bancaria a 30 días')
    expect(result!.totales.tipo_recargo).toBe(5.2)
    expect(result!.totales.cuota_recargo).toBe(31.2)
    expect(result!.regimen_fiscal).toBe('recargo_equivalencia')
    expect(result!.tipo_operacion).toBe('nacional')
    expect(result!.totales.desglose_iva).toEqual([
      { tipo: 21, base: 300, cuota: 63 },
      { tipo: 10, base: 200, cuota: 20 },
      { tipo: 4, base: 100, cuota: 4 },
    ])
    expect(result!.totales.base_imponible).toBe(600)
    expect(result!.totales.cuota_iva).toBe(87)
    expect(result!.totales.total_factura).toBe(718.2)
  })

  it('sanea el nombre del proveedor y descarta la cabecera de la factura', () => {
    expect(sanitizeSupplierName('SUMINISTROS GENERALES DEL SUR S.L. Fecha Emisión: 12/08/2026 Vencimiento: 12/09/2026 Moneda: EUR (€)'))
      .toBe('SUMINISTROS GENERALES DEL SUR S.L.')
    expect(sanitizeSupplierName('INNOVATECH SOLUCIONES S.L. Fecha Emisión: 24/07/2026'))
      .toBe('INNOVATECH SOLUCIONES S.L.')
    expect(sanitizeSupplierName('ACME S.A. Teléfono: 912 345 678 · www.acme.es'))
      .toBe('ACME S.A.')
    expect(sanitizeSupplierName('   ')).toBeNull()
    expect(sanitizeSupplierName('Fecha Emisión: 12/08/2026')).toBeNull()
  })

  it('normaliza el desglose de IVA con formatos variados del modelo', () => {
    expect(normalizeVatBreakdown([
      { tipo: 21, base: 300, cuota: 63 },
      { tipo: 10, base: '200,00 €', cuota: '20,00 €' },
    ])).toEqual([
      { tipo: 21, base: 300, cuota: 63 },
      { tipo: 10, base: 200, cuota: 20 },
    ])
    expect(normalizeVatBreakdown([
      { rate: 21, taxableBase: 300, vatAmount: 63 },
      { rate: 10, taxableBase: 200, vatAmount: 20 },
    ])).toEqual([
      { tipo: 21, base: 300, cuota: 63 },
      { tipo: 10, base: 200, cuota: 20 },
    ])
    expect(normalizeVatBreakdown([{ tipo: 21, base: 300 }])).toEqual([])
  })
})
