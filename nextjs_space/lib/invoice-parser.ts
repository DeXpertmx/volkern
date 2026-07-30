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

export interface DesgloseIva {
  tipo: number
  base: number
  cuota: number
}

export interface TotalesFactura {
  base_imponible: number | null
  tipo_iva: number | null
  cuota_iva: number | null
  tipo_irpf: number | null
  cuota_irpf: number | null
  total_factura: number | null
  desglose_iva?: DesgloseIva[]
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

  // ── Verifactu / AEAT verificación ──
  verifactu: boolean

  // Campos planos legacy (backward compat con frontend actual) ──
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
  // Etiqueta + valor: relajamos para aguantar OCR defectuoso (ej: "B-87654321" o "123430/82").
  // Soporta "NIF: B-123", "NIF Cliente: B-123", "NIF/DNI 12345678Z".
  const labelMatch = line.match(/(?:nif|cif|dni)(?:[\s\/\-]*(?:dni|nif|cif|cliente|de|del|emisor|receptor))?\s*[:.]\s*([A-Za-z0-9\-\/]{6,16})/i)
  if (labelMatch) {
    const candidate = labelMatch[1].trim()
    // Si el candidato tiene formato decente lo normalizamos; si no, devolvemos null
    // para no inventar datos ante un OCR erróneo.
    if (looksLikeNif(candidate)) return normalizeNif(candidate)
    return null
  }
  // Variante sin dos puntos, p. ej. "NIF B-12345678" o "DNI 12345678Z"
  const bareLabelMatch = line.match(/(?:nif|cif|dni)\s+([A-Za-z0-9\-\/]{6,16})/i)
  if (bareLabelMatch && looksLikeNif(bareLabelMatch[1])) return normalizeNif(bareLabelMatch[1])
  // Sin etiqueta
  const bareMatch = line.match(/\b([A-Za-z]?[-]?\d{7,8}[A-Za-z0-9]?|\d{8}[-]?[A-Za-z])\b/)
  if (bareMatch && looksLikeNif(bareMatch[1])) return normalizeNif(bareMatch[1])
  return null
}

// Determina si una línea parece una dirección postal.
function looksLikeAddress(line: string): boolean {
  // Requiere un indicador de vía (calle, avda, plaza, etc.) o un CP al inicio.
  // No basta con el nombre de una ciudad para evitar que "SUMINISTROS INDUSTRIALES VALENCIA C.B."
  // se confunda con una dirección.
  return /\b(?:calle|c\/|av(?:da)?\.|avenida|plaza|paseo|carretera|ctra|pol[ií]gono|camino|bulevar|urb\.|^\d{5}\b)/i.test(line)
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

  const stopWords = /registro mercantil|actividad|contacto|email|tel[eé]fono|\btel[:\s]|telf[:\s]|tpv|fax|web|datos de pago|forma de pago|informaci[oó]n legal|total a pagar|hora:|atendido por|vendedor|factura simplificada|n°?\s*factura|n[úu]mero\s+de\s+factura|datos de emisi[oó]n|detalles del pedido|concepto|horas|ref\.?\s*contrato|forma de pago|attn:|attention:/i
  const titleWords = /emisor|receptor|cliente|datos fiscales/i

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim()
    if (!rawLine) continue
    if (stopWords.test(rawLine)) continue

    // NIF
    const lineNif = extractNif(rawLine)
    if (lineNif && !nif) {
      nif = lineNif
      continue
    }

    // Para líneas tipo "Cliente Identificado: TALLERES...", quitar el prefijo
    let line = rawLine.replace(/^(?:cliente(?:\s+identificado)?|receptor|destinatario|emisor)\s*[:.-]?\s*/i, '')

    // Si después de quitar el prefijo no queda nada o es solo "Datos fiscales" etc.
    if (!line) continue
    if (titleWords.test(line)) continue

    // Dirección (puede extenderse varias líneas)
    if (looksLikeAddress(line)) {
      const parts: string[] = [line]
      // Consumir líneas posteriores mientras parezcan dirección o contengan CP/país
      let j = i + 1
      while (j < lines.length && !stopWords.test(lines[j]) && !extractNif(lines[j])) {
        const next = lines[j].trim().replace(/^(?:cliente(?:\s+identificado)?|receptor|destinatario|emisor)\s*[:.-]?\s*/i, '')
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
    const isNameCandidate = line.length > 2 && !/^[\d\s\-\/.,:;()]+$/.test(line) && !/\b(iva|irpf|total|base|importe)\b/i.test(line)
    if (isNameCandidate) {
      if (!nombre) {
        nombre = line
      } else {
        // Fusionar si la siguiente línea continúa la razón social o aporta el sufijo societario
        const last = nombre.split(' ').pop()?.toUpperCase()
        const hasCompanySuffix = /\b(S\.?L\.?U\.?|S\.?L\.?|S\.?A\.?U\.?|S\.?A\.?|S\.?C\.?|S\.?C\.?P\.?|C\.?B\.?|S\.?A\.?P\.?|S\.?A\.?T|LLC|INC|GMBH|BV|LTD)\b/i.test(line)
        const isCompanySuffix = /^(S\.?L\.?|S\.?A\.?|S\.?L\.?U\.?|S\.?A\.?U\.?|S\.?C\.?|S\.?C\.?P\.?|C\.?B\.?|S\.?A\.?P\.?|S\.?A\.?T|LLC|INC|GMBH|BV|LTD)$/i.test(last || '')
        const isAdministrativeNoise = /hoja|registro|folio|tomo|nº\s*\d|m-\d|inscripci[oó]n|contacto|nif|cif|dni/i.test(line)
        const looksLikeContinuation = /^DEL?\s|^DE\s|^[A-Z]/i.test(line) && !isAdministrativeNoise
        if ((isCompanySuffix || hasCompanySuffix || looksLikeContinuation) && !isAdministrativeNoise) {
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
    /n[úu]mero\s+de\s+factura\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]*\d[A-Za-z0-9\-\/]*)/i,
    /factura\s*n[ºo°]?\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]*\d[A-Za-z0-9\-\/]*)/i,
    /(?:factura|n[ºo°])\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]*\d[A-Za-z0-9\-\/]*)/i,
    /\bfactura\b[^\d]{0,20}([A-Za-z0-9][A-Za-z0-9\-\/]*\d[A-Za-z0-9\-\/]*)/i,
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
  // Normalizamos importes tipo "14, 20" a "14,20" para no romper detección de fechas cercanas
  const allDates = [...full.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g)]
  const fmtDate = (d: string, m: string, y: string): string => {
    const yy = y.length === 2 ? '20' + y : y
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${yy}`
  }
  // Etiquetas específicas para distinguir emisión/operación/vencimiento
  const fechaExpMatch = full.match(/(?:fecha\s+de\s+expedici[oó]n|fecha\s+de\s+emisi[oó]n)\s*[:.]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i)
  const fechaOpMatch = full.match(/(?:fecha\s+de\s+operaci[oó]n|fecha\s+operaci[oó]n)\s*[:.]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i)
  const fechaVencMatch = full.match(/(?:fecha\s+de\s+vencimiento|vencimiento)\s*[:.]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i)
  let fecha_emision: string | null = fechaExpMatch ? fmtDate(fechaExpMatch[1], fechaExpMatch[2], fechaExpMatch[3]) : null
  let fecha_operacion: string | null = fechaOpMatch ? fmtDate(fechaOpMatch[1], fechaOpMatch[2], fechaOpMatch[3]) : null
  if (!fecha_emision && allDates.length > 0) {
    const [_, d1, m1, y1] = allDates[0]
    fecha_emision = fmtDate(d1, m1, y1)
  }
  if (!fecha_operacion && allDates.length > 1) {
    const [__, d2, m2, y2] = allDates[1]
    const cand = fmtDate(d2, m2, y2)
    const isVencimiento = fechaVencMatch && fmtDate(fechaVencMatch[1], fechaVencMatch[2], fechaVencMatch[3]) === cand
    if (!isVencimiento) {
      fecha_operacion = cand
    }
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
    // Cortar el bloque de partes al primer encabezado de sección posterior (datos de emisión, detalles, concepto, tabla...)
    const sectionEndIdx = lines.findIndex((l, idx) =>
      idx > maxIdx &&
      /^(?:datos\s+de\s+emisi[oó]n|detalles\s+del\s+pedido|concepto|descripci[oó]n\s+del\s+producto|c[oó]digo|cant\.|cantidad|precio|horas|ref\.?\s*contrato)/i.test(l)
    )
    const endParty = sectionEndIdx >= 0 ? sectionEndIdx : (detalleStartIdx > maxIdx ? detalleStartIdx : Math.min(lines.length, maxIdx + 12))
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
    // Fallback: emisor en primeras líneas, receptor tras "Cliente" / "Receptor"
    const emisorEndIdx = lines.findIndex(l => /(?:cliente|receptor|destinatario)/i.test(l))
    const emisorRawLines = emisorEndIdx > 0 ? lines.slice(0, emisorEndIdx) : lines.slice(0, Math.min(10, lines.length))
    // El emisor puede venir en dos columnas (nombre a la izquierda, datos de factura a la derecha)
    const { leftLines: emisorLeft } = splitTwoColumnBlock(emisorRawLines, 0, emisorRawLines.length)
    const emisorParty = extractParty(emisorLeft)
    emisorNombre = emisorParty.nombre
    emisorNif = emisorParty.nif
    emisorDireccion = emisorParty.direccion

    const receptorStart = lines.findIndex(l => /(?:cliente|receptor|destinatario)/i.test(l))
    if (receptorStart >= 0) {
      // El bloque del receptor incluye la línea que contiene el label (p. ej. "Cliente Identificado: ...")
      // porque ahí suele ir el nombre.
      const startIncludesLabel = /cliente\s+(?:identificado|raz[oó]n|nombre)|receptor|destinatario/i.test(lines[receptorStart])
      const receptorLines = startIncludesLabel
        ? [lines[receptorStart], ...lines.slice(receptorStart + 1)]
        : lines.slice(receptorStart)
      // El bloque del receptor termina cuando empieza la tabla de líneas o un total/resumen
      const receptorEnd = lines.findIndex((l, idx) =>
        idx > receptorStart &&
        /^(?:total|c[oó]digo|descripci[oó]n|cant\.|cantidad|base|subtotal|importe\s+total|suma\s+importes|desglose|datos\s+de|detalles\s+del|concepto)/i.test(l)
      )
      const effectiveEnd = receptorEnd >= 0 ? receptorEnd - receptorStart : receptorStart + 10
      const receptorRawLines = receptorLines.slice(0, effectiveEnd)
      // El receptor también puede venir en dos columnas (datos a la izq, dirección de envío a la der)
      const { leftLines: receptorLeft } = splitTwoColumnBlock(receptorRawLines, 0, receptorRawLines.length)
      const receptorParty = extractParty(receptorLeft, true)
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
  const lineasStart = lines.findIndex(l => /^(?:c[oó]digo|cant|cantidad|descripci[oó]n|concepto|art[ií]culo|producto|ref\s*[:.])/i.test(l))
  const lineasEnd = lines.findIndex(l => /(?:base\s+imponible|subtotal|total\s+factura|importe\s+total|suma\s+importes|desglose\s+impositivo)/i.test(l))
  if (lineasStart >= 0 && lineasEnd > lineasStart) {
    let pendingDescription: string[] = []
    let trailingDescription: string[] = []
    let lastItem: LineaFactura | null = null
    let lastAmountLineHadCode = false
    // Normalizamos importes con espaciados raros del OCR ("14, 20", "48, 00")
    const moneyRegex = /\d{1,3}(?:[.,]\d{3})*[.,]\s*\d{2}/g
    for (let i = lineasStart + 1; i < lineasEnd; i++) {
      // Quitar símbolo de euro y porcentajes (IVA/descuento) antes de buscar importes
      const line = lines[i].replace(/€/g, '').replace(/\d{1,2}\s*%/g, '').trim()
      const amounts = [...line.matchAll(moneyRegex)].map(m => m[0])
      if (amounts.length >= 2) {
        // Antes de procesar el nuevo item, adjuntar descripciones trailing al anterior.
        if (lastItem && trailingDescription.length > 0) {
          const extra = trailingDescription.join(' ').replace(/\s+/g, ' ').trim()
          if (extra) lastItem.descripcion = ((lastItem.descripcion || '') + ' ' + extra).trim()
        }

        // Último importe = importe línea, penúltimo = precio unitario.
        // Si hay 3 importes y el primero × el segundo ≈ el tercero, el primero es la cantidad.
        let importe = amounts[amounts.length - 1]
        let precio = amounts[amounts.length - 2]
        let inferredQty: number | null = null
        if (amounts.length >= 3) {
          const a = toNum(amounts[0]) || 0
          const b = toNum(amounts[1]) || 0
          const c = toNum(amounts[2]) || 0
          if (a > 0 && b > 0 && c > 0 && Math.abs(a * b - c) < 0.01) {
            inferredQty = a
          }
        }
        // Descripción: líneas previas + texto antes del primer importe
        const firstAmountIdx = line.search(moneyRegex)
        let inlineDesc = firstAmountIdx > 0 ? line.slice(0, firstAmountIdx).trim() : ''

        // Separar código de producto si aparece al inicio (ej: ENV-0912, PAL-EU01, ALM-FNB)
        const codeMatch = inlineDesc.match(/^[A-Z]{2,4}(?:[-.][A-Z0-9]{1,6})?\d{0,6}\b/)
        let code = ''
        if (codeMatch) {
          code = codeMatch[0]
          inlineDesc = inlineDesc.slice(code.length).trim()
        }

        // Cantidad: preferir heurística de 3 importes; si no, el número entero justo antes del primer importe.
        let cantidad = 1
        if (inferredQty !== null) {
          cantidad = inferredQty
        } else {
          const qtyMatch = inlineDesc.match(/(\d+)\s*$/)
          if (qtyMatch) {
            const q = parseInt(qtyMatch[1], 10)
            if (q < 1000) {
              cantidad = q
              inlineDesc = inlineDesc.replace(/\s*\d+\s*$/, '').trim()
            }
          }
        }

        const descParts = [...pendingDescription]
        if (inlineDesc) descParts.push(inlineDesc)
        if (code) descParts.unshift(code)
        let descripcion = descParts.join(' ').replace(/\s+/g, ' ').trim() || null
        // Fallback: si tras quitar cantidad/importes la descripción quedó vacía,
        // reutilizar la línea ya limpia de importes y porcentajes como descripción.
        if (!descripcion) {
          descripcion = line.replace(/\s+/g, ' ').trim() || null
        }
        const newItem: LineaFactura = {
          descripcion,
          cantidad,
          precio_unitario: toNum(precio),
          importe: toNum(importe),
        }
        lineas.push(newItem)
        lastItem = newItem
        lastAmountLineHadCode = !!codeMatch
        trailingDescription = []
        pendingDescription = []
      } else if (!/^(?:base|subtotal|total|importe|iva|imp|página|\d+%)/i.test(line)) {
        // Acumular como descripción.
        // Línea trailing si: comienza con minúscula, es parentética, o el item anterior tenía código de producto.
        const cleanLine = line.replace(/\t/g, ' ').trim()
        const isLowerOrParen = /^[a-záéíóúüñ(]/.test(cleanLine) || /^\([^)]*\)$/.test(cleanLine)
        const isTrailing = isLowerOrParen || (lastAmountLineHadCode && trailingDescription.length === 0)
        if (lastItem && isTrailing && trailingDescription.length === 0) {
          trailingDescription.push(cleanLine)
        } else {
          pendingDescription.push(cleanLine)
        }
      }
    }
    // Aplicar trailing descriptions pendientes al último item
    if (lastItem && trailingDescription.length > 0) {
      const extra = trailingDescription.join(' ').replace(/\s+/g, ' ').trim()
      if (extra) lastItem.descripcion = ((lastItem.descripcion || '') + ' ' + extra).trim()
    }
  }

  // ── Base Imponible ──
  let baseImponible: number | null = null
  const baseMatch = full.match(/(?:base\s+imponible|subtotal|importe\s+neto)[^:]{0,25}[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
  if (baseMatch) baseImponible = toNum(baseMatch[1])

  // ── IVA ──
  let tipoIva: number | null = null
  let cuotaIva: number | null = null
  const desgloseIva: DesgloseIva[] = []

  // Desglose por tipo de IVA: buscar líneas tipo "21,00 %  600,10 €  126,02 €"
  const ivaRowRegex = /^(\d{1,2}(?:[.,]\d+)?)\s*%\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)\s*€?/i
  for (const line of lines) {
    const m = line.match(ivaRowRegex)
    if (m) {
      desgloseIva.push({
        tipo: toNum(m[1]) || 0,
        base: toNum(m[2]) || 0,
        cuota: toNum(m[3]) || 0,
      })
    }
  }

  if (desgloseIva.length > 0) {
    // El tipo de IVA principal es el de mayor base imponible
    const mainIva = desgloseIva.reduce((prev, curr) => (curr.base > prev.base ? curr : prev))
    tipoIva = mainIva.tipo
    cuotaIva = desgloseIva.reduce((sum, item) => sum + item.cuota, 0)
  } else {
    // Fallback para facturas con un solo tipo de IVA
    const ivaRateMatch = full.match(/(?:iva|i\.v\.a\.)[^0-9]*(\d{1,2}(?:[.,]\d+)?)\s*%/i)
    if (ivaRateMatch) tipoIva = toNum(ivaRateMatch[1])
    const ivaAmtMatch = full.match(/(?:iva|cuota\s+iva)[^:]*:\s*€?\s*[-–]?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
    if (ivaAmtMatch) cuotaIva = toNum(ivaAmtMatch[1])
  }

  // Priorizar etiquetas explícitas de totalidad de IVA
  const totalIvaMatch = full.match(/total\s+(?:impuestos|iva)[^:]*:\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
  if (totalIvaMatch) cuotaIva = toNum(totalIvaMatch[1])

  // ── IRPF ──
  let tipoIrpf: number | null = null
  let cuotaIrpf: number | null = null
  // Tolerar "Retención IRPF (-15%)*:", "IRPF 15%" o "Retención IRPF (%):"
  const irpfRateMatch = full.match(/(?:irpf|retenci[oó]n)[^0-9]*(-?\d{1,2}(?:[.,]\d+)?)\s*%/i)
  if (irpfRateMatch) tipoIrpf = toNum(irpfRateMatch[1])
  // Si aparece la etiqueta de retención pero sin tasa, asumir 0%
  const hasIrpfLabel = /retenci[oó]n\s+(?:irpf|sobre\s+el\s+trabajo)|\bIRPF\b/i.test(full)
  if (hasIrpfLabel && tipoIrpf === null) tipoIrpf = 0
  const irpfAmtMatch = full.match(/(?:irpf|retenci[oó]n)[^:]*:\s*€?\s*[-–]?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
  if (irpfAmtMatch) cuotaIrpf = -Math.abs(toNum(irpfAmtMatch[1]) || 0)

  // ── Total Factura ──
  let totalFactura: number | null = null
  const totalMatch = full.match(/(?:total\s+a\s+pagar|total\s+factura|importe\s+total|neto\s+a\s+pagar)\s*[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
  if (totalMatch) totalFactura = toNum(totalMatch[1])
  // Fallback: "TOTAL A PAGAR: 1.696,00 €"
  if (!totalFactura) {
    const totalMatch2 = full.match(/total\s*[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)\s*€?/i)
    if (totalMatch2) totalFactura = toNum(totalMatch2[1])
  }
  if (!totalFactura) {
    const allNums = [...full.matchAll(/([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2}))\s*€/g)]
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

  // ── Verifactu ──
  const verifactu = /VERI[\s\*]?FACTU|QR\s*AEAT|factura\s*verificable\s*en\s*la\s*sede/i.test(full)

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
      desglose_iva: desgloseIva.length > 0 ? desgloseIva : undefined,
    },
    iban,
    category,
    verifactu,

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
    desglose_iva: undefined,
  },
  iban: null,
  category: 'otros',
  verifactu: false,
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
