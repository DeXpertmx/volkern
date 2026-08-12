import { describe, expect, it } from 'vitest'
import { applyVatRowTemplate, associateVatRowsByPosition, vatRowGeometry, type DesgloseIva } from '@/lib/invoice-parser'
import type { OcrOverlay, VatRowTemplate } from '@/lib/finance/ocr-template'

const W = 800
const H = 1000

// Palabras en [texto, x, y] en píxeles de la imagen original.
function overlay(words: Array<[string, number, number]>): OcrOverlay {
  return {
    width: W,
    height: H,
    words: words.map(([text, x, y]) => ({ text, x, y, w: text.length * 12, h: 24 })),
  }
}

describe('associateVatRowsByPosition', () => {
  it('re-asocia las cuotas intercambiadas por el parser usando la posición de las filas', () => {
    const ov = overlay([
      ['21,00', 100, 100], ['%', 180, 100], ['300,00', 260, 100], ['63,00', 380, 100],
      ['10,00', 100, 140], ['%', 180, 140], ['200,00', 260, 140], ['20,00', 380, 140],
    ])
    // El parser de texto plano emparejó mal base/cuota entre las dos filas
    const detected: DesgloseIva[] = [
      { tipo: 21, base: 300, cuota: 20 },
      { tipo: 10, base: 200, cuota: 63 },
    ]
    const result = associateVatRowsByPosition(ov, detected, { base_imponible: 500, total_factura: 583 })
    expect(result).toEqual([
      { tipo: 21, base: 300, cuota: 63 },
      { tipo: 10, base: 200, cuota: 20 },
    ])
  })

  it('recupera los tramos desde la geometría cuando el modelo no leyó el desglose', () => {
    const ov = overlay([
      ['IVA', 50, 100], ['21,00%', 100, 100], ['300,00€', 220, 100], ['63,00€', 340, 100],
      ['IVA', 50, 140], ['10,00%', 100, 140], ['200,00€', 220, 140], ['20,00€', 340, 140],
    ])
    const result = associateVatRowsByPosition(ov, [], { base_imponible: 500, total_factura: 583 })
    expect(result).toEqual([
      { tipo: 21, base: 300, cuota: 63 },
      { tipo: 10, base: 200, cuota: 20 },
    ])
  })

  it('conserva el desglose detectado cuando cuadra igual que el posicional', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['300,00', 260, 100], ['63,00', 380, 100],
    ])
    const detected: DesgloseIva[] = [{ tipo: 21, base: 300, cuota: 63 }]
    const result = associateVatRowsByPosition(ov, detected, { base_imponible: 300, total_factura: 363 })
    expect(result).toEqual(detected)
  })

  it('devuelve el desglose detectado si no hay cajas de palabras', () => {
    const detected: DesgloseIva[] = [{ tipo: 21, base: 300, cuota: 63 }]
    expect(associateVatRowsByPosition(null, detected)).toEqual(detected)
    expect(associateVatRowsByPosition({ width: 0, height: 0, words: [] }, detected)).toEqual(detected)
  })

  it('descarta el total del tramo cuando viene incluido en la misma fila', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['300,00', 200, 100], ['63,00', 300, 100], ['363,00', 400, 100],
    ])
    const result = associateVatRowsByPosition(ov, [], { base_imponible: 300, total_factura: 363 })
    expect(result).toEqual([{ tipo: 21, base: 300, cuota: 63 }])
  })

  it('corrige el orden cuando la cuota aparece antes que la base', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['63,00', 220, 100], ['300,00', 340, 100],
    ])
    const result = associateVatRowsByPosition(ov, [], { base_imponible: 300, total_factura: 363 })
    expect(result).toEqual([{ tipo: 21, base: 300, cuota: 63 }])
  })

  it('asocia la base cuando aparece antes de la columna del tipo', () => {
    const ov = overlay([
      ['Base', 60, 100], ['300,00', 160, 100], ['IVA', 300, 100], ['21,00%', 340, 100], ['Cuota', 440, 100], ['63,00', 500, 100],
    ])
    const result = associateVatRowsByPosition(ov, [], { base_imponible: 300, total_factura: 363 })
    expect(result).toEqual([{ tipo: 21, base: 300, cuota: 63 }])
  })

  it('ignora filas de recargo, IRPF y totales que no son tramos de IVA', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['300,00', 220, 100], ['63,00', 340, 100],
      ['Recargo', 50, 140], ['5,20%', 100, 140], ['31,20', 220, 140],
      ['IRPF', 50, 180], ['15,00%', 100, 180], ['90,00', 220, 180],
      ['Total', 60, 220], ['454,20', 160, 220],
    ])
    const result = associateVatRowsByPosition(ov, [], { base_imponible: 300, total_factura: 454.2 })
    expect(result).toEqual([{ tipo: 21, base: 300, cuota: 63 }])
  })

  it('separa dos tramos que comparten la misma línea (dos columnas juntas)', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['300,00', 180, 100], ['63,00', 260, 100], ['10,00%', 380, 100], ['200,00', 460, 100], ['20,00', 540, 100],
    ])
    const result = associateVatRowsByPosition(ov, [], { base_imponible: 500, total_factura: 583 })
    expect(result).toEqual([
      { tipo: 21, base: 300, cuota: 63 },
      { tipo: 10, base: 200, cuota: 20 },
    ])
  })

  it('descarta filas cuya relación tipo × base no cuadre (no inventa tramos)', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['1.600,00', 220, 100], ['63,00', 340, 100],
    ])
    const result = associateVatRowsByPosition(ov, [], { base_imponible: 1600, total_factura: 1696 })
    // 21% de 1.600 no es 63,00 → no es una fila de tramo fiable
    expect(result).toEqual([])
  })
})

describe('vatRowGeometry', () => {
  it('devuelve regiones de cada columna alineadas con los valores de la fila', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['300,00', 220, 100], ['63,00', 340, 100],
    ])
    const geometry = vatRowGeometry(ov)
    expect(geometry).toHaveLength(1)
    const g = geometry[0]
    expect(g).toMatchObject({ tipo: 21, base: 300, cuota: 63, page: 1 })
    // Las regiones están en coordenadas relativas 0..1 y apuntan a la palabra correcta
    expect(g.rateRegion.x).toBeGreaterThan(0.1)
    expect(g.rateRegion.x).toBeLessThan(0.2)
    expect(g.baseRegion.x).toBeGreaterThan(0.25)
    expect(g.cuotaRegion.x).toBeGreaterThan(0.4)
  })
})

describe('applyVatRowTemplate', () => {
  it('extrae los tramos desde las regiones aprendidas (misma posición, valores nuevos)', () => {
    // Primera factura: se aprende la geometría
    const first = overlay([
      ['21,00%', 100, 100], ['300,00', 220, 100], ['63,00', 340, 100],
      ['10,00%', 100, 140], ['200,00', 220, 140], ['20,00', 340, 140],
    ])
    const geometry = vatRowGeometry(first)
    const vatRows: VatRowTemplate[] = geometry.map(g => ({
      rate: g.rateRegion,
      base: g.baseRegion,
      cuota: g.cuotaRegion,
      reference: { tipo: g.tipo, base: g.base, cuota: g.cuota },
      page: g.page,
    }))

    // Segunda factura del mismo proveedor: otros importes en las mismas columnas
    const second = overlay([
      ['21,00%', 100, 100], ['500,00', 220, 100], ['105,00', 340, 100],
      ['10,00%', 100, 140], ['150,00', 220, 140], ['15,00', 340, 140],
    ])
    const result = applyVatRowTemplate(second, vatRows)
    expect(result).toEqual([
      { tipo: 21, base: 500, cuota: 105 },
      { tipo: 10, base: 150, cuota: 15 },
    ])
  })

  it('solo lee las filas de la página indicada', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['300,00', 220, 100], ['63,00', 340, 100],
    ])
    const geometry = vatRowGeometry(ov, 2)
    const vatRows: VatRowTemplate[] = geometry.map(g => ({
      rate: g.rateRegion, base: g.baseRegion, cuota: g.cuotaRegion, page: g.page,
    }))
    expect(applyVatRowTemplate(ov, vatRows, 1)).toEqual([])
    expect(applyVatRowTemplate(ov, vatRows, 2)).toEqual([{ tipo: 21, base: 300, cuota: 63 }])
  })

  it('no emite filas cuando la región no contiene palabras (layout cambiado)', () => {
    const ov = overlay([
      ['21,00%', 100, 100], ['300,00', 220, 100], ['63,00', 340, 100],
    ])
    const geometry = vatRowGeometry(ov)
    const vatRows: VatRowTemplate[] = geometry.map(g => ({
      rate: { x: 0.9, y: 0.9, w: 0.05, h: 0.02 },
      base: g.baseRegion,
      cuota: g.cuotaRegion,
      page: g.page,
    }))
    // La región del tipo no tiene palabras → la fila no se emite
    expect(applyVatRowTemplate(ov, vatRows)).toEqual([])
  })
})
