export interface EmisorInfo {
  nombre: string | null
  nif: string | null
  direccion: string | null
}

export interface ReceptorInfo {
  nombre: string | null
  nif: string | null
  direccion: string | null
}

export interface LineaFactura {
  descripcion: string | null
  cantidad: number | null
  precio_unitario: number | null
  importe: number | null
}

export interface TotalesFactura {
  base_imponible: number | null
  tipo_iva: number | null
  cuota_iva: number | null
  tipo_irpf: number | null
  cuota_irpf: number | null
  total_factura: number | null
}

export interface VisionResult {
  // Identificación
  numero_factura: string | null
  serie: string | null
  fecha_emision: string | null   // DD/MM/AAAA
  fecha_operacion: string | null  // DD/MM/AAAA (solo si distinta)

  // Partes
  emisor: EmisorInfo
  receptor: ReceptorInfo

  // Líneas de detalle
  lineas: LineaFactura[]

  // Totales e impuestos
  totales: TotalesFactura

  // IBAN
  iban: string | null

  // Categoría inferida
  category: string

  // ── Campos planos legacy (backward compat con frontend actual) ──
  supplier: string | null
  total: number | null
  nif: string | null
  date: string | null
  invoiceNumber: string | null
  taxableBase: number | null
  vatRate: number | null
  vatAmount: number | null
  operationDate: string | null
  issuerName: string | null
  issuerAddress: string | null
  issuerTaxId: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Convierte un importe a número, tolerando separadores de miles/decimales europeos y US.
// Ej: "1.600,00" => 1600.00 ; "1,200.00" => 1200.00 ; "1 696,00" => 1696.00 ; "1600" => 1600
function toNum(s: string): number | null {
  if (!s) return null
  // Quitar espacios y símbolo de euro
  let cleaned = s.replace(/\s+/g, '').replace(/€/g, '')
  if (!cleaned) return null
  // Detectar el separador decimal: el último punto o coma seguido de 1 o 2 dígitos
  const m = cleaned.match(/^(.*[.,])(\d{1,2})$/)
  if (m) {
    const integerPart = m[1].replace(/[.,]/g, '')
    const decimalPart = m[2]
    const n = parseFloat(`${integerPart}.${decimalPart}`)
    return isFinite(n) ? Math.round(n * 100) / 100 : null
  }
  // Sin parte decimal: eliminar separadores de miles
  cleaned = cleaned.replace(/[.,]/g, '')
  const n = parseFloat(cleaned)
  return isFinite(n) ? Math.round(n * 100) / 100 : null
}

// Normaliza un NIF/CIF: elimina espacios y guiones, pasa a mayúsculas.
function normalizeNif(s: string): string {
  return s.replace(/[\s\-]/g, '').toUpperCase()
}

// Divide una línea en columnas cuando el layout es de dos columnas.
function splitLineColumns(line: string): string[] {
  // Tabulaciones o dos+ espacios con contenido a ambos lados
  const cols = line.split(/\t| {2,}/).map(c => c.trim()).filter(Boolean)
  return cols
}

// Verifica si una cadena parece un NIF/CIF/DNI español.
function looksLikeNif(s: string): boolean {
  const n = normalizeNif(s)
  return /^[A-Z]\d{7,8}[A-Z0-9]?$|^\d{8}[A-Z]$|^\d{8}$/i.test(n)
}

// Extrae NIF/CIF de una línea, admitiendo guiones y etiquetas previas.
function extractNif(line: string): string | null {
  // Etiqueta + valor: relajamos para aguantar OCR defectuoso (ej: "B-87654321" o "123430/82")
  const labelMatch = line.match(/(?:nif|cif|dni)[\s\/\-]*(?:dni|nif|cif)?\s*[:.]?\s*([A-Za-z0-9\-\/]{6,16})/i)
  if (labelMatch) {
    const candidate = labelMatch[1].trim()
    // Si el candidato tiene formato decente lo normalizamos; si no, devolvemos null
    // para no inventar datos ante un OCR erróneo.
    if (looksLikeNif(candidate)) return normalizeNif(candidate)
    return null
  }
  // Sin etiqueta
  const bareMatch = line.match(/\b([A-Za-z]?[-]?\d{7,8}[A-Za-z0-9]?|\d{8}[-]?[A-Za-z])\b/)
  if (bareMatch && looksLikeNif(bareMatch[1])) return normalizeNif(bareMatch[1])
  return null
}

// Determina si una línea parece una dirección postal.
function looksLikeAddress(line: string): boolean {
  return /(?:calle|c\/|c\.|avda|avenida|plaza|paseo|carretera|ctra|pol[ií]gono|camino|bulevar|urb\.|^\d{5}\b|madrid|barcelona|españa|sevilla|valencia)/i.test(line)
}

// Extrae la parte izquierda y derecha de un bloque de dos columnas.
function splitTwoColumnBlock(lines: string[], startIdx: number, endIdx: number): { leftLines: string[]; rightLines: string[] } {
  const leftLines: string[] = []
  const rightLines: string[] = []
  for (let i = startIdx; i < endIdx; i++) {
    const cols = splitLineColumns(lines[i])
    if (cols.length >= 2) {
      leftLines.push(cols[0])
      rightLines.push(cols[1])
    } else if (cols.length === 1) {
      // Asumimos que la línea larga sin columnas pertenece a la izquierda (emisor)
      leftLines.push(cols[0])
    }
  }
  return { leftLines, rightLines }
}

// Extrae nombre, NIF y dirección de un bloque de líneas de una parte (emisor o receptor).
function extractParty(lines: string[], _isReceptor = false): { nombre: string | null; nif: string | null; direccion: string | null } {
  let nombre: string | null = null
  let nif: string | null = null
  let direccion: string | null = null

  const stopWords = /registro mercantil|actividad|contacto|email|tel[eé]fono|fax|web|datos de pago|forma de pago|informaci[oó]n legal|total a pagar/i
  const titleWords = /emisor|receptor|cliente|datos fiscales/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (titleWords.test(line)) continue
    if (stopWords.test(line)) continue

    // NIF
    const lineNif = extractNif(line)
    if (lineNif && !nif) {
      nif = lineNif
      continue
    }

    // Dirección (puede extenderse varias líneas)
    if (looksLikeAddress(line)) {
      const parts: string[] = [line]
      // Consumir líneas posteriores mientras parezcan dirección o contengan CP/país
      let j = i + 1
      while (j < lines.length && !stopWords.test(lines[j]) && !extractNif(lines[j])) {
        const next = lines[j].trim()
        if (!next) break
        if (looksLikeAddress(next) || /^\d{5}\b/.test(next) || /españa|spain/i.test(next)) {
          parts.push(next)
          j++
        } else {
          break
        }
      }
      direccion = parts.join(', ').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim()
      i = j - 1
      continue
    }

    // Nombre: línea con texto razonable, acumulable para razones sociales multilínea
    if (line.length > 2 && !/^[\d\s\-\/.,:;()]+$/.test(line) && !/iva|irpf|total|base|importe/i.test(line)) {
      if (!nombre) {
        nombre = line
      } else {
        // Fusionar solo si la siguiente línea parece seguir la razón social y no es ruido administrativo
        const last = nombre.split(' ').pop()?.toUpperCase()
        const isCompanySuffix = /^(S\.?L\.?|S\.?A\.?|S\.?L\.?U\.?|S\.?A\.?U\.?|S\.?C\.?|S\.?C\.?P\.?|C\.?B\.?|S\.?A\.?P\.?|S\.?A\.?T|LLC|INC|GMBH|BV|LTD)$/i.test(last || '')
        const isAdministrativeNoise = /hoja|registro|folio|tomo|nº\s*\d|m-\d|inscripci[oó]n|contacto|nif|cif|dni/i.test(line)
        if (isCompanySuffix && !isAdministrativeNoise) {
          nombre += ' ' + line
        }
      }
    }
  }

  return { nombre, nif, direccion }
}

// ─── Spanish Invoice Regex Parser ───────────────────────────────────────────
// Extrae TODOS los campos de una factura española desde texto plano (OCR.space)
export function parseInvoiceText(text: string): VisionResult | null {
  if (!text || text.trim().length < 10) return null

  let rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // ── Preproceso: eliminar encabezados sueltos que confunden al parser ──
  // Ej: "INNOVATECH SOLUCIONES\tFACTURA" -> "INNOVATECH SOLUCIONES" ; "S.L.\t" -> "S.L."
  rawLines = rawLines.map(l => {
    // Si una línea termina en FACTURA o FACTURA\t... quedarse con la parte izquierda hasta el separador
    return l.replace(/\s*[\t]+\s*FACTURA\s*$/, '').replace(/\s+FACTURA\s*$/, '').trim()
  }).filter(l => {
    if (!l) return false
    // Quitar líneas que son solo ruido de encabezado
    if (/^(FACTURA|INVOICE|FACTURE)$/i.test(l)) return false
    return true
  })

  const lines = rawLines
  const full = lines.join(' ').trim()
  const lowerFull = full.toLowerCase()

  // ── Número de factura + Serie ──
  let invoiceNumber: string | null = null
  let serie: string | null = null
  const invPatterns = [
    /n[úu]mero\s+de\s+factura\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,25})/i,
    /factura\s*n[ºo°]?\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,25})/i,
    /(?:factura|n[ºo°])\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,25})/i,
    /\bfactura\b[^\d]{0,20}([A-Za-z0-9][A-Za-z0-9\-\/]{2,25})/i,
  ]
  for (const pattern of invPatterns) {
    const m = full.match(pattern)
    if (m) { invoiceNumber = m[1].trim(); break }
  }
  if (invoiceNumber) {
    const serieMatch = invoiceNumber.match(/^([A-Za-z]+\d*)/)
    if (serieMatch) serie = serieMatch[1]
  }

  // ── Fechas ──
  const allDates = [...full.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g)]
  const fmtDate = (d: string, m: string, y: string): string => {
    const yy = y.length === 2 ? '20' + y : y
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${yy}`
  }
  // Etiquetas específicas para distinguir emisión/operación
  const fechaExpMatch = full.match(/(?:fecha\s+de\s+expedici[oó]n|fecha\s+de\s+emisi[oó]n)\s*[:.]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i)
  const fechaOpMatch = full.match(/(?:fecha\s+de\s+operaci[oó]n|fecha\s+operaci[oó]n)\s*[:.]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i)
  let fecha_emision: string | null = fechaExpMatch ? fmtDate(fechaExpMatch[1], fechaExpMatch[2], fechaExpMatch[3]) : null
  let fecha_operacion: string | null = fechaOpMatch ? fmtDate(fechaOpMatch[1], fechaOpMatch[2], fechaOpMatch[3]) : null
  if (!fecha_emision && allDates.length > 0) {
    const [_, d1, m1, y1] = allDates[0]
    fecha_emision = fmtDate(d1, m1, y1)
  }
  if (!fecha_operacion && allDates.length > 1) {
    const [__, d2, m2, y2] = allDates[1]
    fecha_operacion = fmtDate(d2, m2, y2)
  }

  // ── Emisor / Receptor (layout de dos columnas) ──
  let emisorNombre: string | null = null
  let emisorNif: string | null = null
  let emisorDireccion: string | null = null
  let receptorNombre: string | null = null
  let receptorNif: string | null = null
  let receptorDireccion: string | null = null

  const emisorHeaderIdx = lines.findIndex(l => /emisor/i.test(l))
  const receptorHeaderIdx = lines.findIndex(l => /receptor|cliente/i.test(l))
  const detalleStartIdx = lines.findIndex(l => /descripci[oó]n\s+del\s+producto|cant\.|precio ud/i.test(l))

  const isSameLineHeader = emisorHeaderIdx >= 0 && emisorHeaderIdx === receptorHeaderIdx

  if (emisorHeaderIdx >= 0 && (receptorHeaderIdx > emisorHeaderIdx || isSameLineHeader)) {
    const maxIdx = Math.max(emisorHeaderIdx, receptorHeaderIdx)
    const endParty = detalleStartIdx > maxIdx ? detalleStartIdx : Math.min(lines.length, maxIdx + 12)
    // Si el header está en la misma línea, empezamos después para no tomar los títulos como datos
    const startIdx = isSameLineHeader ? emisorHeaderIdx + 1 : emisorHeaderIdx
    const { leftLines, rightLines } = splitTwoColumnBlock(lines, startIdx, endParty)
    const emisorParty = extractParty(leftLines)
    const receptorParty = extractParty(rightLines, true)
    emisorNombre = emisorParty.nombre
    emisorNif = emisorParty.nif
    emisorDireccion = emisorParty.direccion
    receptorNombre = receptorParty.nombre
    receptorNif = receptorParty.nif
    receptorDireccion = receptorParty.direccion
  } else {
    // Fallback: emisor en primeras líneas, receptor tras "Cliente"
    const emisorEndIdx = lines.findIndex(l => /^(?:cliente|receptor|destinatario)/i.test(l))
    const emisorLines = emisorEndIdx > 0 ? lines.slice(0, emisorEndIdx) : lines.slice(0, Math.min(8, lines.length))
    const emisorParty = extractParty(emisorLines)
    emisorNombre = emisorParty.nombre
    emisorNif = emisorParty.nif
    emisorDireccion = emisorParty.direccion

    const receptorStart = lines.findIndex(l => /^(?:cliente|receptor|destinatario)/i.test(l))
    if (receptorStart >= 0) {
      const receptorParty = extractParty(lines.slice(receptorStart + 1, receptorStart + 8), true)
      receptorNombre = receptorParty.nombre
      receptorNif = receptorParty.nif
      receptorDireccion = receptorParty.direccion
    }
  }

  // Si el emisor sigue vacío, intentar con primeras líneas
  if (!emisorNombre) {
    const party = extractParty(lines.slice(0, 8))
    emisorNombre = party.nombre
    emisorNif = party.nif
    emisorDireccion = party.direccion
  }

  // ── Líneas de detalle ──
  const lineas: LineaFactura[] = []
  const lineasStart = lines.findIndex(l => /^(?:cant|cantidad|descripci[oó]n|concepto|art[ií]culo|producto|ref\s*[:.])/i.test(l))
  const lineasEnd = lines.findIndex(l => /(?:base\s+imponible|subtotal|total|importe\s+total|suma|iva\s*\d)/i.test(l))
  if (lineasStart >= 0 && lineasEnd > lineasStart) {
    const pendingDescription: string[] = []
    const moneyRegex = /\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/g
    for (let i = lineasStart + 1; i < lineasEnd; i++) {
      // Quitar símbolo de euro y porcentajes (IVA) antes de buscar importes
      const line = lines[i].replace(/€/g, '').replace(/\d{1,2}\s*%/g, '').trim()
      const amounts = [...line.matchAll(moneyRegex)].map(m => m[0])
      if (amounts.length >= 2) {
        // Último importe = importe línea, penúltimo = precio unitario
        const importe = amounts[amounts.length - 1]
        const precio = amounts[amounts.length - 2]
        // Descripción: líneas previas + texto antes del primer importe
        // Con regex global match() no devuelve index; usamos search() que sí lo devuelve sin tocar lastIndex.
        const firstAmountIdx = line.search(moneyRegex)
        let inlineDesc = firstAmountIdx > 0 ? line.slice(0, firstAmountIdx).trim() : ''
        // Cantidad: número entero justo antes del primer importe (opcional); por defecto 1
        let cantidad = 1
        const qtyMatch = inlineDesc.match(/(\d+)\s*$/)
        if (qtyMatch) {
          const q = parseInt(qtyMatch[1], 10)
          if (q < 1000) {
            cantidad = q
            inlineDesc = inlineDesc.replace(/\s*\d+\s*$/, '').trim()
          }
        }
        const descParts = [...pendingDescription]
        if (inlineDesc) descParts.push(inlineDesc)
        let descripcion = descParts.join(' ').replace(/\s+/g, ' ').trim() || null
        // Fallback: si tras quitar cantidad/importes la descripción quedó vacía,
        // reutilizar la línea ya limpia de importes y porcentajes como descripción.
        if (!descripcion) {
          descripcion = line.replace(/\s+/g, ' ').trim() || null
        }
        lineas.push({
          descripcion,
          cantidad,
          precio_unitario: toNum(precio),
          importe: toNum(importe),
        })
        pendingDescription.length = 0
      } else if (!/^(?:base|subtotal|total|importe|iva|imp|página|\d+%)/i.test(line)) {
        // Acumular como descripción
        pendingDescription.push(line.replace(/\t/g, ' ').trim())
      }
    }
  }

  // ── Base Imponible ──
  let baseImponible: number | null = null
  const baseMatch = full.match(/(?:base\s+imponible\s+total|base\s+imponible|base|subtotal|bruto|importe\s+neto)\s*[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i)
  if (baseMatch) baseImponible = toNum(baseMatch[1])

  // ── IVA ──
  let tipoIva: number | null = null
  let cuotaIva: number | null = null
  // Tolerar "IVA (21% sobre 1.600,00 €):" o "IVA 21%"
  const ivaRateMatch = full.match(/(?:iva|i\.v\.a\.)[^0-9]*(\d{1,2}(?:[.,]\d+)?)\s*%/i)
  if (ivaRateMatch) tipoIva = toNum(ivaRateMatch[1])
  // Cuota IVA: buscar "IVA (21% sobre X): 336,00" o "IVA: 336,00"
  const ivaAmtMatch = full.match(/(?:iva|cuota\s+iva)[^:]*:\s*€?\s*[-–]?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i)
  if (ivaAmtMatch) cuotaIva = toNum(ivaAmtMatch[1])

  // ── IRPF ──
  let tipoIrpf: number | null = null
  let cuotaIrpf: number | null = null
  // Tolerar "Retención IRPF (-15%)*:" o "IRPF 15%"
  const irpfRateMatch = full.match(/(?:irpf|retenci[oó]n)[^0-9]*(\d{1,2}(?:[.,]\d+)?)\s*%/i)
  if (irpfRateMatch) tipoIrpf = toNum(irpfRateMatch[1])
  const irpfAmtMatch = full.match(/(?:irpf|retenci[oó]n)[^:]*:\s*€?\s*[-–]?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i)
  if (irpfAmtMatch) cuotaIrpf = -Math.abs(toNum(irpfAmtMatch[1]) || 0)

  // ── Total Factura ──
  let totalFactura: number | null = null
  const totalMatch = full.match(/(?:total\s+a\s+pagar|total\s+factura|importe\s+total|neto\s+a\s+pagar)\s*[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i)
  if (totalMatch) totalFactura = toNum(totalMatch[1])
  // Fallback: "TOTAL A PAGAR: 1.696,00 €"
  if (!totalFactura) {
    const totalMatch2 = full.match(/total\s*[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)\s*€?/i)
    if (totalMatch2) totalFactura = toNum(totalMatch2[1])
  }
  if (!totalFactura) {
    const allNums = [...full.matchAll(/([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2}))\s*€/g)]
    if (allNums.length > 0) {
      totalFactura = toNum(allNums[allNums.length - 1][1])
    }
  }

  // ── IBAN ──
  let iban: string | null = null
  // Patrón flexible para IBAN con espacios irregulares
  const ibanMatch = full.match(/\b(ES\d{2}(?:[\s-]*\d){20})\b/i)
  if (ibanMatch) {
    iban = ibanMatch[1].replace(/[\s-]/g, '')
  }
  // Fallback: buscar "IBAN:" seguido de cualquier cosa parecida a IBAN
  if (!iban) {
    const ibanLabelMatch = full.match(/iban\s*[:.]?\s*([A-Za-z]{2}\d{2}[\s\d-]{10,30})/i)
    if (ibanLabelMatch) {
      const candidate = ibanLabelMatch[1].replace(/[\s-]/g, '').toUpperCase()
      if (/^ES\d{2}\d{18,24}$/.test(candidate)) iban = candidate
    }
  }

  // ── Categoría (heurística) ──
  let category = 'otros'
  const catMap: Record<string, string[]> = {
    alimentacion: ['supermercado', 'restaurante', 'comida', 'alimentaci', 'cafeter', 'bar ', 'panader', 'carnicer', 'fruter'],
    transporte: ['gasolinera', 'combustible', 'carburante', 'peaje', 'aparcamiento', 'parking', 'uber', 'taxi', 'renfe', 'vueling', 'iberia', 'transporte', 'gasolina'],
    suministros: ['luz', 'electricidad', 'agua', 'gas', 'telefónica', 'movistar', 'vodafone', 'orange', 'suministro', 'endesa', 'iberdrola', 'naturgy'],
    oficina: ['papelería', 'librería', 'material oficina', 'fichero', 'impresora', 'tóner', 'cartucho', 'oficina'],
    tecnologia: ['apple', 'amazon', 'software', 'hosting', 'dominio', 'aws', 'google cloud', 'azure', 'microsoft', 'adobe', 'tecnolog', 'informática'],
    marketing: ['google ads', 'facebook ads', 'meta ads', 'publicidad', 'marketing', 'seo', 'sem', 'redes sociales'],
    profesional: ['asesor', 'abogado', 'notario', 'gestor', 'consultor', 'auditor', 'arquitecto', 'ingeniero', 'procurador', 'registrador'],
  }
  for (const [cat, keywords] of Object.entries(catMap)) {
    if (keywords.some(k => lowerFull.includes(k))) {
      category = cat
      break
    }
  }

  // ── Sincronizar campos legacy ──
  const hasData = !!(emisorNombre || totalFactura || fecha_emision)
  if (!hasData) return null

  return {
    numero_factura: invoiceNumber,
    serie,
    fecha_emision,
    fecha_operacion,
    emisor: {
      nombre: emisorNombre,
      nif: emisorNif,
      direccion: emisorDireccion,
    },
    receptor: {
      nombre: receptorNombre,
      nif: receptorNif,
      direccion: receptorDireccion,
    },
    lineas,
    totales: {
      base_imponible: baseImponible,
      tipo_iva: tipoIva,
      cuota_iva: cuotaIva,
      tipo_irpf: tipoIrpf,
      cuota_irpf: cuotaIrpf,
      total_factura: totalFactura,
    },
    iban,
    category,

    // Campos planos legacy
    supplier: emisorNombre,
    total: totalFactura,
    nif: emisorNif,
    date: fecha_emision,
    invoiceNumber,
    taxableBase: baseImponible,
    vatRate: tipoIva,
    vatAmount: cuotaIva,
    operationDate: fecha_operacion,
    issuerName: emisorNombre,
    issuerAddress: emisorDireccion,
    issuerTaxId: emisorNif,
  }
}

// Objeto fallback para cuando ningún proveedor de visión extrae datos.
export const FALLBACK: VisionResult = {
  numero_factura: null,
  serie: null,
  fecha_emision: null,
  fecha_operacion: null,
  emisor: { nombre: null, nif: null, direccion: null },
  receptor: { nombre: null, nif: null, direccion: null },
  lineas: [],
  totales: {
    base_imponible: null,
    tipo_iva: null,
    cuota_iva: null,
    tipo_irpf: null,
    cuota_irpf: null,
    total_factura: null,
  },
  iban: null,
  category: 'otros',
  supplier: null,
  total: null,
  nif: null,
  date: null,
  invoiceNumber: null,
  taxableBase: null,
  vatRate: null,
  vatAmount: null,
  operationDate: null,
  issuerName: null,
  issuerAddress: null,
  issuerTaxId: null,
}
