import { describe, it, expect } from 'vitest'
import {
  overlayFromOcrSpace,
  applyTemplate,
  wordsInRegion,
  OCR_FIELD_DEFS,
  findRegionForValue,
  getOcrFieldDef,
  sameFieldValue,
  valuesEquivalent,
  fieldFormat,
  validateReference,
  type OcrTemplateField,
  type OcrOverlay,
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

describe('fieldFormat', () => {
  it('clasifica fechas, importes, NIF, folios y texto', () => {
    expect(fieldFormat('24/07/2026')).toBe('date')
    expect(fieldFormat('02-08-26')).toBe('date')
    expect(fieldFormat('1.696,00')).toBe('money')
    expect(fieldFormat('1696.00')).toBe('money')
    expect(fieldFormat('336')).toBe('money')
    expect(fieldFormat('B87654321')).toBe('nif')
    expect(fieldFormat('12345678Z')).toBe('nif')
    expect(fieldFormat('F2026-00142')).toBe('alnum')
    expect(fieldFormat('INNOVATECH SOLUCIONES')).toBe('text')
  })
})

describe('validateReference', () => {
  it('acepta el mismo valor o valores del mismo formato (cada factura varía)', () => {
    expect(validateReference('24/07/2026', '24/07/2026').ok).toBe(true)
    expect(validateReference('02/08/2026', '24/07/2026').ok).toBe(true) // misma fecha, distinto día
    expect(validateReference('1500.00', '1000.00').ok).toBe(true) // mismo formato importe
    expect(validateReference('F2026-00199', 'F2026-00142').ok).toBe(true) // mismo formato folio
    expect(validateReference('B87654321', 'B87654321').ok).toBe(true)
  })

  it('marca cuando el formato deja de coincidir con la referencia', () => {
    expect(validateReference('1000.00', '24/07/2026').ok).toBe(false) // importe donde había fecha
    expect(validateReference('24/07/2026', '1000.00').ok).toBe(false) // fecha donde había importe
    expect(validateReference('1.210,00', 'F2026-00142').ok).toBe(false) // importe donde había folio
  })

  it('sin referencia no valida (ok)', () => {
    expect(validateReference('1000.00', null).ok).toBe(true)
    expect(validateReference('1000.00', undefined).ok).toBe(true)
  })
})

describe('sameFieldValue', () => {
  it('considera iguales los importes en formatos distintos', () => {
    expect(sameFieldValue('1.696,00', '1696.00')).toBe(true)
    expect(sameFieldValue('1696', '1696.00')).toBe(true)
    expect(sameFieldValue('1 696,00', '1696.00')).toBe(true)
    expect(sameFieldValue('336,00', '336.00')).toBe(true)
  })

  it('distingue importes distintos', () => {
    expect(sameFieldValue('1696.00', '1600.00')).toBe(false)
    expect(sameFieldValue('336.00', '210.00')).toBe(false)
  })

  it('compara texto y fechas de forma normalizada', () => {
    expect(sameFieldValue('24/07/2026', '24/07/2026')).toBe(true)
    expect(sameFieldValue('INNOVATECH SOLUCIONES', 'innovateth soluciones')).toBe(false)
    expect(sameFieldValue('B87654321', 'B-87654321'.replace(/-/g, ''))).toBe(true)
  })
})

describe('OCR_FIELD_DEFS', () => {
  it('define los campos anotables con etiqueta y normalizador', () => {
    expect(OCR_FIELD_DEFS.some(f => f.field === 'fecha_emision')).toBe(true)
    expect(OCR_FIELD_DEFS.some(f => f.field === 'total_factura')).toBe(true)
    expect(OCR_FIELD_DEFS.some(f => f.field === 'receptor_nombre')).toBe(true)
    expect(OCR_FIELD_DEFS.some(f => f.field === 'receptor_nif')).toBe(true)
    expect(OCR_FIELD_DEFS.some(f => f.field === 'receptor_direccion')).toBe(true)
    for (const def of OCR_FIELD_DEFS) {
      expect(def.label.length).toBeGreaterThan(0)
      expect(typeof def.normalize).toBe('function')
    }
  })
})

function overlayOf(): OcrOverlay {
  return overlayFromOcrSpace(sampleOverlay())!
}

describe('applyTemplate · páginas PDF', () => {
  it('solo aplica las regiones de la página activa', () => {
    const overlay = overlayOf()
    const pageOne = { ...region('numero_factura', 365, 105, 200, 45), page: 1 }
    const pageTwo = { ...region('fecha_emision', 300, 140, 300, 70), page: 2 }

    expect(applyTemplate(overlay, [pageOne, pageTwo], 1)).toEqual({ numero_factura: 'F2026-00142' })
    expect(applyTemplate(overlay, [pageOne, pageTwo], 2)).toEqual({ fecha_emision: '24/07/2026' })
  })
})

describe('findRegionForValue', () => {
  it('encuentra la región de una fecha corregida a mano (formato ISO del input)', () => {
    const overlay = overlayOf()
    const proposal = findRegionForValue(overlay, '2026-07-24', getOcrFieldDef('fecha_emision')!)
    expect(proposal).not.toBeNull()
    expect(proposal!.field).toBe('fecha_emision')
    expect(proposal!.matchedText).toBe('24/07/2026')
    // La región debe contener la palabra de la fecha (x 400-550, y 160-190)
    expect(proposal!.region.x * IMG_W).toBeGreaterThan(380)
    expect(proposal!.region.x * IMG_W).toBeLessThan(430)
    expect(proposal!.region.y * IMG_H).toBeLessThan(160)
    expect((proposal!.region.y + proposal!.region.h) * IMG_H).toBeGreaterThan(190)
  })

  it('encuentra un folio con coincidencia exacta', () => {
    const overlay = overlayOf()
    const proposal = findRegionForValue(overlay, 'F2026-00142', getOcrFieldDef('numero_factura')!)
    expect(proposal).not.toBeNull()
    expect(proposal!.matchedText).toBe('F2026-00142')
  })

  it('encuentra un importe europeo comparando el valor numérico', () => {
    const overlay = overlayOf()
    const proposal = findRegionForValue(overlay, '1696', getOcrFieldDef('total_factura')!)
    expect(proposal).not.toBeNull()
    expect(proposal!.matchedText).toBe('1.696,00')
    // El importe 336,00 no debe ganar aunque 336 sea subcadena de 1696
    expect(proposal!.region.x * IMG_W).toBeGreaterThan(700)
  })

  it('encuentra el NIF con guiones', () => {
    const overlay = overlayOf()
    const proposal = findRegionForValue(overlay, 'B87654321', getOcrFieldDef('emisor_nif')!)
    expect(proposal).not.toBeNull()
    expect(proposal!.matchedText).toBe('B-87654321')
  })

  it('encuentra una razón social de varias palabras juntando la línea', () => {
    const overlay = overlayOf()
    const proposal = findRegionForValue(overlay, 'INNOVATECH SOLUCIONES', getOcrFieldDef('emisor_nombre')!)
    expect(proposal).not.toBeNull()
    expect(proposal!.matchedText).toBe('INNOVATECH SOLUCIONES')
    // La línea abarca ambas palabras (x 100-440, y 220-250)
    expect(proposal!.region.x * IMG_W).toBeLessThan(120)
    expect((proposal!.region.x + proposal!.region.w) * IMG_W).toBeGreaterThan(430)
  })

  it('no propone nada cuando el valor no está en el documento', () => {
    const overlay = overlayOf()
    expect(findRegionForValue(overlay, '99/99/9999', getOcrFieldDef('fecha_emision')!)).toBeNull()
    expect(findRegionForValue(overlay, 'ZZZZ-99999', getOcrFieldDef('numero_factura')!)).toBeNull()
  })

  it('no confunde el tipo de IVA con un importe de otra fila', () => {
    const overlay = overlayOf()
    const proposal = findRegionForValue(overlay, '21', getOcrFieldDef('tipo_iva')!)
    expect(proposal).not.toBeNull()
    expect(proposal!.matchedText).toBe('21%')
  })

  it('encuentra la base imponible de un tramo corregida a mano (matching monetario)', () => {
    const overlay = overlayOf()
    const proposal = findRegionForValue(overlay, '1600', getOcrFieldDef('base_imponible')!)
    expect(proposal).not.toBeNull()
    expect(proposal!.field).toBe('base_imponible')
    expect(proposal!.matchedText).toBe('1.600,00')
  })
})

describe('valuesEquivalent', () => {
  it('considera equivalentes fechas en formatos distintos', () => {
    expect(valuesEquivalent('2026-07-24', '24/07/2026')).toBe(true)
    expect(valuesEquivalent('2026-07-24', '25/07/2026')).toBe(false)
  })

  it('considera equivalentes NIF con y sin guiones e importes', () => {
    expect(valuesEquivalent('B87654321', 'B-87654321')).toBe(true)
    expect(valuesEquivalent('1696', '1.696,00')).toBe(true)
    expect(valuesEquivalent('1696', '1600')).toBe(false)
  })
})
