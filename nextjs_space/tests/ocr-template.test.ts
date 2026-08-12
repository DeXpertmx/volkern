import { describe, it, expect } from 'vitest'
import {
  overlayFromOcrSpace,
  applyTemplate,
  wordsInRegion,
  OCR_FIELD_DEFS,
  type OcrTemplateField,
} from '@/lib/finance/ocr-template'

// Imagen 1000x1400 (formato típico A4 escaneado)
const IMG_W = 1000
const IMG_H = 1400

// Simula el TextOverlay de OCR.space: una factura con los campos en posiciones fijas
function sampleOverlay() {
  return {
    ParsedResults: [{
      TextOverlay: {
        Width: IMG_W,
        Height: IMG_H,
        Lines: [
          { Words: [{ WordText: 'FACTURA', Left: 400, Top: 40, Width: 200, Height: 40 }] },
          { Words: [{ WordText: 'Nº:', Left: 300, Top: 110, Width: 60, Height: 30 }, { WordText: 'F2026-00142', Left: 370, Top: 110, Width: 180, Height: 30 }] },
          { Words: [{ WordText: 'Fecha:', Left: 300, Top: 160, Width: 90, Height: 30 }, { WordText: '24/07/2026', Left: 400, Top: 160, Width: 150, Height: 30 }] },
          { Words: [{ WordText: 'INNOVATECH', Left: 100, Top: 220, Width: 180, Height: 30 }, { WordText: 'SOLUCIONES', Left: 290, Top: 220, Width: 150, Height: 30 }] },
          { Words: [{ WordText: 'NIF:', Left: 100, Top: 260, Width: 50, Height: 30 }, { WordText: 'B-87654321', Left: 160, Top: 260, Width: 140, Height: 30 }] },
          { Words: [{ WordText: 'Base', Left: 700, Top: 600, Width: 60, Height: 30 }, { WordText: 'imponible', Left: 770, Top: 600, Width: 130, Height: 30 }, { WordText: '1.600,00', Left: 700, Top: 640, Width: 150, Height: 30 }] },
          { Words: [{ WordText: 'IVA', Left: 700, Top: 690, Width: 60, Height: 30 }, { WordText: '21%', Left: 780, Top: 690, Width: 70, Height: 30 }, { WordText: '336,00', Left: 700, Top: 730, Width: 120, Height: 30 }] },
          { Words: [{ WordText: 'TOTAL', Left: 650, Top: 790, Width: 120, Height: 40 }, { WordText: '1.696,00', Left: 790, Top: 790, Width: 160, Height: 40 }] },
          { Words: [{ WordText: 'ES9100491234561234567890', Left: 150, Top: 950, Width: 320, Height: 30 }] },
        ],
      },
    }],
  }
}

function region(field: string, x: number, y: number, w: number, h: number): OcrTemplateField {
  return { field, label: field, x: x / IMG_W, y: y / IMG_H, w: w / IMG_W, h: h / IMG_H }
}

describe('overlayFromOcrSpace', () => {
  it('extrae palabras con sus cajas y dimensiones', () => {
    const overlay = overlayFromOcrSpace(sampleOverlay())
    expect(overlay).not.toBeNull()
    expect(overlay!.width).toBe(IMG_W)
    expect(overlay!.height).toBe(IMG_H)
    expect(overlay!.words.length).toBeGreaterThan(5)
    expect(overlay!.words[1]).toMatchObject({ text: 'Nº:', x: 300, y: 110 })
  })

  it('ignora palabras vacías y devuelve null sin overlay', () => {
    expect(overlayFromOcrSpace({})).toBeNull()
    expect(overlayFromOcrSpace({ ParsedResults: [{}] })).toBeNull()
    expect(overlayFromOcrSpace({ ParsedResults: [{ TextOverlay: { Width: 100, Height: 100, Lines: [{ Words: [{ WordText: '  ' }] }] } }] })).toBeNull()
  })
})

describe('wordsInRegion', () => {
  it('devuelve solo las palabras cuyo centro cae dentro de la región', () => {
    const overlay = overlayFromOcrSpace(sampleOverlay())!
    // Región alrededor de la fecha (x 300-600, y 140-210)
    const words = wordsInRegion(overlay.words, IMG_W, IMG_H, region('fecha_emision', 300, 140, 300, 70))
    expect(words.map(w => w.text).join(' ')).toBe('Fecha: 24/07/2026')
  })

  it('no mezcla palabras de filas adyacentes', () => {
    const overlay = overlayFromOcrSpace(sampleOverlay())!
    const words = wordsInRegion(overlay.words, IMG_W, IMG_H, region('emisor_nif', 100, 255, 210, 40))
    expect(words.map(w => w.text).join(' ')).toBe('NIF: B-87654321')
  })
})

describe('applyTemplate', () => {
  it('extrae y normaliza fecha, folio, importes y NIF por región', () => {
    const overlay = overlayFromOcrSpace(sampleOverlay())!
    const fields: OcrTemplateField[] = [
      region('fecha_emision', 300, 140, 300, 70),
      region('numero_factura', 365, 105, 200, 45),
      region('base_imponible', 690, 630, 170, 50),
      region('cuota_iva', 690, 720, 140, 50),
      region('total_factura', 640, 780, 320, 60),
      region('emisor_nombre', 90, 210, 360, 50),
      region('emisor_nif', 100, 255, 210, 40),
      region('iban', 140, 940, 340, 50),
    ]
    const values = applyTemplate(overlay, fields)
    expect(values.fecha_emision).toBe('24/07/2026')
    expect(values.numero_factura).toBe('F2026-00142')
    expect(values.base_imponible).toBe('1600.00')
    expect(values.cuota_iva).toBe('336.00')
    expect(values.total_factura).toBe('1696.00')
    expect(values.emisor_nombre).toBe('INNOVATECH SOLUCIONES')
    expect(values.emisor_nif).toBe('B87654321')
    expect(values.iban).toBe('ES9100491234561234567890')
  })

  it('devuelve {} cuando la región no contiene palabras', () => {
    const overlay = overlayFromOcrSpace(sampleOverlay())!
    const values = applyTemplate(overlay, [region('fecha_emision', 10, 10, 50, 40)])
    expect(values).toEqual({})
  })

  it('ignora campos desconocidos o coords inválidas', () => {
    const overlay = overlayFromOcrSpace(sampleOverlay())!
    const values = applyTemplate(overlay, [
      region('campo_inexistente', 300, 140, 300, 70),
    ])
    expect(values).toEqual({})
  })
})

describe('OCR_FIELD_DEFS', () => {
  it('define los campos anotables con etiqueta y normalizador', () => {
    expect(OCR_FIELD_DEFS.some(f => f.field === 'fecha_emision')).toBe(true)
    expect(OCR_FIELD_DEFS.some(f => f.field === 'total_factura')).toBe(true)
    for (const def of OCR_FIELD_DEFS) {
      expect(def.label.length).toBeGreaterThan(0)
      expect(typeof def.normalize).toBe('function')
    }
  })
})
