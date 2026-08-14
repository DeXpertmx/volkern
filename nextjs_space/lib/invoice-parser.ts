import type { OcrOverlay, OcrWord, VatRowTemplate } from '@/lib/finance/ocr-template'

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
  tipo_recargo: number | null
  cuota_recargo: number | null
  total_factura: number | null
  desglose_iva?: DesgloseIva[]
}

export interface VisionResult {
  // Identificación
  numero_factura: string | null
  serie: string | null
  fecha_emision: string | null   // DD/MM/AAAA
  fecha_operacion: string | null  // DD/MM/AAAA (solo si distinta)
  fecha_vencimiento: string | null // DD/MM/AAAA
  moneda: string | null
  forma_pago: string | null

  // Partes
  emisor: EmisorInfo
  receptor: ReceptorInfo

  // Líneas de detalle
  lineas: LineaFactura[]

  // Totales e impuestos
  totales: TotalesFactura
  regimen_fiscal: string | null
  tipo_operacion: string | null

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

// Sanitiza el nombre de un proveedor extraído por OCR/IA. Algunos modelos
// devuelven en el campo de razón social texto extra de la cabecera de la
// factura (fechas, vencimiento, moneda, forma de pago, dirección, teléfono…).
// Cortamos en el primer marcador de cabecera y eliminamos ruido residual.
export function sanitizeSupplierName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let name = raw.replace(/\s+/g, ' ').trim()
  if (!name) return null

  // Primer marcador que indica el final del nombre real (etiquetas de cabecera)
  const boundary = name.search(
    /\b(?:fecha\s*(?:de\s*)?(?:emisi[oó]n|expedici[oó]n|operaci[oó]n|vencimiento|pago|factura|valor|entrega|albar[áa]n)?|vencimiento|vence\s*el|moneda|divisa|forma\s+de\s+pago|condiciones?\s+de\s+pago|n[úu]mero\s+de\s+factura|n°?\s*factura|factura\s*n[ºo°]?|c[oó]digo|ref\.?\s*[:.]?|tel[eé]fono|telf\.?|e?-?mail|fax|web\s*:|iban\s*:|cuenta\s+|nif|cif|dni|domicilio|direcci[oó]n|calle|avda?\.|registro\s+mercantil|p[áa]gina)\b[\s\S]*$/i
  )
  if (boundary === 0) return null // la cabecera ocupa todo el campo: sin proveedor
  if (boundary > 0) name = name.slice(0, boundary).trim()

  // Si quedaron fechas sueltas, monedas o importes embebidos, cortarlos.
  // Cuidado con no comernos el punto de "S.L.": solo quitamos separadores
  // finales si van precedidos de un marcador de cabecera ya recortado.
  name = name
    .replace(/\s+(?:\d{1,2})[/.-](?:\d{1,2})[/.-](?:\d{2,4})\b/g, '')
    .replace(/\s*[(（]?\s*(?:EUR|USD|MXN|GBP|CHF|CAD|ARS|COP|CLP|PEN|BRL)\s*[)）]?\s*$/i, '')
    .replace(/\s+€\s*$/, '')
    .trim()

  // Limpiar separadores finales solitarios ("ACME S.L." se conserva; "ACME:" no)
  name = name.replace(/(\S[^:.\-–—]{2})\s*[:.\-–—]+\s*$/, '$1').trim()

  if (name.length < 2) return null
  // Solo ruido (números, símbolos) → no es un proveedor
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñÀ-ÿ]/.test(name)) return null
  return name
}

// Normaliza el desglose de IVA tolerando formatos del modelo: nombres en
// español/inglés, arrays anidados en totales o a nivel raíz, y cuotas con
// o sin símbolo de euro. Devuelve [] si no hay filas válidas.
// Convierte un importe procedente del modelo a número, tolerando coma decimal
// europea y símbolo de euro ("200,00 €" → 200, "1.234,56" → 1234.56).
function amountToNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return NaN
  let cleaned = value.replace(/[€\s]/g, '').trim()
  if (!cleaned) return NaN
  // Coma como separador decimal (formato europeo)
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    cleaned = cleaned.replace(',', '.')
  } else if (cleaned.includes(',') && cleaned.includes('.')) {
    // Último separador es la coma → decimal europeo con puntos de miles
    cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  }
  return Number(cleaned)
}

export function normalizeVatBreakdown(breakdown: unknown): { tipo: number; base: number; cuota: number }[] {
  const candidates: any[] = Array.isArray(breakdown)
    ? breakdown
    : (breakdown && typeof breakdown === 'object' ? Object.values(breakdown).filter(Array.isArray).flat() : [])
  const rows = candidates
    .map((row: any) => ({
      tipo: Number(row?.tipo ?? row?.tipo_iva ?? row?.iva ?? row?.rate ?? row?.type ?? row?.vatRate ?? row?.porcentaje),
      base: amountToNumber(row?.base ?? row?.base_imponible ?? row?.taxableBase ?? row?.baseImponible),
      cuota: amountToNumber(row?.cuota ?? row?.cuota_iva ?? row?.importe ?? row?.amount ?? row?.vatAmount),
    }))
    .filter(row => Number.isFinite(row.tipo) && Number.isFinite(row.base) && Number.isFinite(row.cuota))
  // Sin duplicados exactos
  return rows.filter((row, idx) => rows.findIndex(r => r.tipo === row.tipo && r.base === row.base && r.cuota === row.cuota) === idx)
}

// ─── Asociación posicional de tramos de IVA ─────────────────────────────────
// El texto plano leído por el OCR pierde la geometría: dos filas de impuestos
// pueden llegar desordenadas o con la cuota de una fila pegada a la base de
// otra. Cuando hay cajas de palabras con posición (OCR.space o detección
// local con tesseract), agrupamos las palabras en filas por su centro vertical
// y asignamos en cada fila tipo → base → cuota por orden horizontal, de modo
// que cada tramo detectado queda asociado a sus valores reales aunque el texto
// venga revuelto.

// Agrupa palabras por fila usando el centro vertical (tolerante a la altura
// de letra y al ruido del OCR). Las filas quedan ordenadas de arriba abajo.
function groupOverlayRows(words: OcrWord[]): OcrWord[][] {
  const sorted = words.slice().sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: OcrWord[][] = []
  for (const w of sorted) {
    const cy = w.y + w.h / 2
    const row = rows.find(r => {
      const first = r[0]
      const fcy = first.y + first.h / 2
      return Math.abs(cy - fcy) <= Math.max(8, Math.max(first.h, w.h) * 0.75)
    })
    if (row) row.push(w)
    else rows.push([w])
  }
  return rows
}

// Extrae el tipo de IVA de un token tipo "21%", "21,00%" o "21, 00%".
function rateFromToken(text: string): number | null {
  const m = text.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/i)
  if (!m) return null
  const n = toNum(m[1])
  return n === null ? null : Math.round(n * 100) / 100
}

// ¿El token es un importe (sin letras ni %)? Devuelve su valor o null.
function moneyFromToken(text: string): number | null {
  const t = text.replace(/[€$£]/g, '').trim()
  if (!t || /[A-Za-zÀ-ÿ%]/.test(t)) return null
  return toNum(t)
}

// Tramo con la geometría de sus tokens (para poder aprender la posición).
interface VatRowTokens {
  tipo: number
  base: number
  cuota: number
  rateTok: OcrWord
  baseTok: OcrWord
  cuotaTok: OcrWord
}

// Convierte una fila de impuestos en tramos {tipo, base, cuota} con los tokens
// que originaron cada columna. Tolerante a:
// - columnas en distinto orden ("63,00 € 300,00 €" → se detecta la cuota),
// - el total del tramo incluido en la misma fila (base + cuota → se descarta),
// - varios tramos en una misma línea (dos columnas juntas),
// - el "%" como palabra separada del número.
// Solo emite filas cuya relación tipo × base ≈ cuota se cumpla; si no, la
// descarta (mejor no inventar un tramo que guardar uno mal asociado).
function rowsWithTokens(row: OcrWord[]): VatRowTokens[] {
  const tokens = row.slice().sort((a, b) => a.x - b.x)
  // Un "%" suelto convierte el número anterior en el tipo ("21,00" "%")
  for (let i = 1; i < tokens.length; i++) {
    if (/^%+$/.test(tokens[i].text.trim()) && moneyFromToken(tokens[i - 1].text) !== null && rateFromToken(tokens[i - 1].text) === null) {
      tokens[i - 1] = { ...tokens[i - 1], text: tokens[i - 1].text + '%' }
    }
  }

  const result: VatRowTokens[] = []
  let current: { rate: number | null; rateTok: OcrWord | null; moneys: OcrWord[] } | null = null
  // Importes que aparecen antes del primer tipo de la fila (la base suele
  // preceder a la columna de IVA: "Base 300,00 | IVA 21% | Cuota 63,00").
  let pending: OcrWord[] = []
  const flush = () => {
    if (!current || current.rate === null || current.rateTok === null || current.moneys.length < 2) {
      current = null
      return
    }
    let moneys = current.moneys.slice()
    let baseTok = moneys[0]
    let cuotaTok = moneys[1]
    let base = moneyFromToken(baseTok.text) ?? 0
    let cuota = moneyFromToken(cuotaTok.text) ?? 0
    // Si hay un tercer importe que es la suma base+cuota, es el total del tramo
    if (moneys.length >= 3 && Math.abs((moneyFromToken(moneys[2].text) ?? 0) - (base + cuota)) < 0.02) {
      moneys = moneys.slice(0, 2)
    }
    const ratio = current.rate / 100
    const direct = Math.abs(base * ratio - cuota)
    const swapped = Math.abs(cuota * ratio - base)
    const tol = Math.max(0.02, Math.abs(base * ratio) * 0.02, Math.abs(cuota * ratio) * 0.02)
    // Si la cuota y la base llegaron en orden inverso, corregir el emparejamiento
    if (swapped < direct && swapped <= tol) {
      ;[baseTok, cuotaTok] = [cuotaTok, baseTok]
    }
    const b = moneyFromToken(baseTok.text) ?? 0
    const c = moneyFromToken(cuotaTok.text) ?? 0
    const ok = Math.min(direct, swapped) <= Math.max(tol, 0.02) || (current.rate === 0 && c === 0)
    if (ok) {
      result.push({
        tipo: current.rate,
        base: Math.round(b * 100) / 100,
        cuota: Math.round(c * 100) / 100,
        rateTok: current.rateTok,
        baseTok,
        cuotaTok,
      })
    }
    current = null
  }

  for (const t of tokens) {
    const rate = rateFromToken(t.text)
    if (rate !== null) {
      flush()
      current = { rate, rateTok: t, moneys: pending }
      pending = []
      continue
    }
    const money = moneyFromToken(t.text)
    if (money !== null) {
      if (current) current.moneys.push(t)
      else pending.push(t)
    }
  }
  flush()
  return result
}

// Puntúa un desglose contra los totales de la factura: menor es mejor. Incluye
// la suma de bases contra base_imponible, base+cuota contra total_factura y la
// coherencia interna de cada tramo (cuota ≈ base × tipo), que detecta cuotas
// intercambiadas entre filas del mismo tipo.
function reconcileScore(rows: DesgloseIva[], totals?: { base_imponible?: number | null; total_factura?: number | null }): number | null {
  if (rows.length === 0) return Infinity
  let err = 0
  let refs = 0
  const baseSum = rows.reduce((s, r) => s + r.base, 0)
  const vatSum = rows.reduce((s, r) => s + r.cuota, 0)
  if (totals?.base_imponible && totals.base_imponible > 0) {
    err += Math.abs(baseSum - totals.base_imponible) / totals.base_imponible
    refs++
  }
  if (totals?.total_factura && totals.total_factura > 0) {
    err += Math.abs(baseSum + vatSum - totals.total_factura) / totals.total_factura
    refs++
  }
  for (const r of rows) {
    if (r.base > 0 && r.tipo > 0) {
      const expected = (r.base * r.tipo) / 100
      err += Math.abs(r.cuota - expected) / Math.max(expected, 0.01)
      refs++
    }
  }
  return refs > 0 ? err / refs : null
}

/**
 * Re-asocia los tramos de IVA detectados usando la posición de las palabras en
 * la imagen. Devuelve el mejor desglose entre el detectado (modelo/regex sobre
 * texto plano) y el reconstruido por geometría, decidiendo por cómo cuadra cada
 * candidato con los totales de la factura.
 */
export function associateVatRowsByPosition(
  overlay: OcrOverlay | null | undefined,
  detected: DesgloseIva[],
  totals?: { base_imponible?: number | null; total_factura?: number | null }
): DesgloseIva[] {
  if (!overlay || overlay.width <= 0 || overlay.height <= 0 || !Array.isArray(overlay.words) || overlay.words.length === 0) {
    return detected
  }
  const positional = vatRowGeometry(overlay).map(({ tipo, base, cuota }) => ({ tipo, base, cuota }))
  const unique = positional.filter((r, i) => positional.findIndex(x => x.tipo === r.tipo && x.base === r.base && x.cuota === r.cuota) === i)
  if (unique.length === 0) return detected

  const dScore = reconcileScore(detected, totals)
  const pScore = reconcileScore(unique, totals)
  // Sin totales de referencia: gana el que aporte más filas (más información)
  if (pScore === null || dScore === null) {
    if (unique.length > detected.length) return unique
    if (unique.length < detected.length) return detected
    return detected
  }
  if (Math.abs(pScore - dScore) < 1e-9) return unique.length >= detected.length ? unique : detected
  return pScore < dScore ? unique : detected
}

/** Región relativa 0..1 de una palabra, con un pequeño margen. */
function regionOfWord(w: OcrWord, imgW: number, imgH: number, pad = 0.006): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, w.x / imgW - pad)
  const y = Math.max(0, w.y / imgH - pad)
  return {
    x,
    y,
    w: Math.min(1 - x, w.w / imgW + pad * 2),
    h: Math.min(1 - y, w.h / imgH + pad * 2),
  }
}

/** Una fila de impuestos con las regiones de sus columnas (para aprender). */
export interface VatRowGeometry {
  tipo: number
  base: number
  cuota: number
  /** Región del tipo de IVA (0..1 sobre la imagen). */
  rateRegion: { x: number; y: number; w: number; h: number }
  /** Región de la base imponible del tramo. */
  baseRegion: { x: number; y: number; w: number; h: number }
  /** Región de la cuota del tramo. */
  cuotaRegion: { x: number; y: number; w: number; h: number }
  page: number
}

/**
 * Tramos de IVA con la posición real de cada columna en la imagen. Es la base
 * para aprender la plantilla del proveedor cuando el usuario confirma los
 * tramos: en el siguiente escaneo se extraen por geometría sin re-asociar.
 */
export function vatRowGeometry(overlay: OcrOverlay | null | undefined, page = 1): VatRowGeometry[] {
  if (!overlay || overlay.width <= 0 || overlay.height <= 0 || !Array.isArray(overlay.words) || overlay.words.length === 0) return []
  const out: VatRowGeometry[] = []
  for (const row of groupOverlayRows(overlay.words)) {
    for (const r of rowsWithTokens(row)) {
      out.push({
        tipo: r.tipo,
        base: r.base,
        cuota: r.cuota,
        rateRegion: regionOfWord(r.rateTok, overlay.width, overlay.height),
        baseRegion: regionOfWord(r.baseTok, overlay.width, overlay.height),
        cuotaRegion: regionOfWord(r.cuotaTok, overlay.width, overlay.height),
        page,
      })
    }
  }
  return out
}

// Texto de las palabras cuyo centro cae dentro de una región.
function wordsTextInRegion(overlay: OcrOverlay, region: { x: number; y: number; w: number; h: number }): string {
  const rx = region.x * overlay.width
  const ry = region.y * overlay.height
  const rw = region.w * overlay.width
  const rh = region.h * overlay.height
  return overlay.words
    .filter(w => {
      const cx = w.x + w.w / 2
      const cy = w.y + w.h / 2
      return cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh
    })
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(w => w.text)
    .join(' ')
}

/**
 * Extrae los tramos de IVA de una plantilla aprendida por posición: para cada
 * fila guardada lee el tipo, la base y la cuota de sus regiones en el overlay
 * del nuevo escaneo, sin re-detectar ni re-asociar.
 */
export function applyVatRowTemplate(
  overlay: OcrOverlay | null | undefined,
  vatRows: VatRowTemplate[],
  page = 1
): DesgloseIva[] {
  if (!overlay || overlay.width <= 0 || overlay.height <= 0 || !Array.isArray(vatRows) || vatRows.length === 0) return []
  const out: DesgloseIva[] = []
  for (const v of vatRows) {
    if ((v.page ?? 1) !== page) continue
    const tipo = rateFromToken(wordsTextInRegion(overlay, v.rate))
    const base = moneyFromToken(wordsTextInRegion(overlay, v.base))
    const cuota = moneyFromToken(wordsTextInRegion(overlay, v.cuota))
    if (tipo !== null && base !== null && cuota !== null) {
      out.push({ tipo, base: Math.round(base * 100) / 100, cuota: Math.round(cuota * 100) / 100 })
    }
  }
  return out
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
  const fecha_vencimiento: string | null = fechaVencMatch ? fmtDate(fechaVencMatch[1], fechaVencMatch[2], fechaVencMatch[3]) : null

  // Moneda: conservar el código ISO cuando aparezca (EUR, USD, MXN…),
  // incluso si el documento solo muestra el símbolo €.
  const currencyMatch = full.match(/\b(EUR|USD|MXN|GBP|CHF|CAD|ARS|COP|CLP|PEN|BRL)\b/i)
  const moneda = currencyMatch ? currencyMatch[1].toUpperCase() : (full.includes('€') ? 'EUR' : null)

  // Forma de pago: tomar solo el valor posterior a la etiqueta, sin absorber
  // la fecha de vencimiento ni el resto de la sección de condiciones.
  const paymentLine = lines.find(line => /^(?:forma\s+de\s+pago|m[eé]todo\s+de\s+pago|medio\s+de\s+pago)\s*[:.]/i.test(line))
  const paymentMatch = paymentLine?.match(/^(?:forma\s+de\s+pago|m[eé]todo\s+de\s+pago|medio\s+de\s+pago)\s*[:.]\s*(.+)$/i)
  const forma_pago = paymentMatch ? paymentMatch[1].trim() : null
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
  // Priorizar la etiqueta de total: en una tabla de varios IVA aparece
  // también "Base Imponible" como encabezado y el regex genérico podía
  // capturar por error la primera cuota del desglose.
  const baseTotalMatch = full.match(/base\s+imponible\s+total\s*[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
  const baseMatch = full.match(/(?:base\s+imponible|subtotal|importe\s+neto)[^:]{0,25}[:.]?\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
  if (baseTotalMatch) baseImponible = toNum(baseTotalMatch[1])
  else if (baseMatch) baseImponible = toNum(baseMatch[1])

  // ── IVA ──
  let tipoIva: number | null = null
  let cuotaIva: number | null = null
  const desgloseIva: DesgloseIva[] = []

  // Desglose por tipo de IVA: buscar líneas tipo "21,00 %  600,10 €  126,02 €",
  // "IVA 21% · Base 600,10 · Cuota 126,02" o filas de tabla con varios tramos.
  const ivaRowRegex = /^(?:\d{1,3}(?:[.,]\d{3})*\s*x\s*)?(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:[^\d€]*?)?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)\s*€?\s*[^\d€]*?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)\s*€?/i
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

  // Variante con etiquetas: "IVA 21% - 600,10 - 126,02"
  if (desgloseIva.length === 0) {
    const labeledRowRegex = /(?:iva|cuota)[^\n]*?(\d{1,2}(?:[.,]\d+)?)\s*%\s*[-–:]?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)[^\n]*?\s*[-–:]?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/gi
    let labeledMatch: RegExpExecArray | null
    while ((labeledMatch = labeledRowRegex.exec(full)) !== null) {
      desgloseIva.push({
        tipo: toNum(labeledMatch[1]) || 0,
        base: toNum(labeledMatch[2]) || 0,
        cuota: toNum(labeledMatch[3]) || 0,
      })
    }
  }

  if (desgloseIva.length > 0) {
    // Si no había una etiqueta explícita de base total, la suma de los tramos
    // es la fuente fiable. Evita quedarse con la primera cuota capturada por
    // el encabezado "Base Imponible" de la tabla.
    if (!baseTotalMatch) {
      baseImponible = desgloseIva.reduce((sum, item) => sum + item.base, 0)
    }
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

  // ── Recargo de equivalencia y tipo de operación ──
  let tipoRecargo: number | null = null
  let cuotaRecargo: number | null = null
  const recargoRateMatch = full.match(/recargo(?:\s+de\s+equivalencia)?[^0-9-]*(-?\d{1,2}(?:[.,]\d+)?)\s*%/i)
  if (recargoRateMatch) tipoRecargo = toNum(recargoRateMatch[1])
  const recargoAmountMatch = full.match(/recargo(?:\s+de\s+equivalencia)?[^:]*:\s*€?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\s*\d{1,2})?)/i)
  if (recargoAmountMatch) cuotaRecargo = toNum(recargoAmountMatch[1])

  let regimenFiscal: string | null = null
  if (/recargo\s+de\s+equivalencia/i.test(full)) regimenFiscal = 'recargo_equivalencia'
  else if (/inversi[oó]n\s+del\s+sujeto\s+pasivo/i.test(full)) regimenFiscal = 'inversion_sujeto_pasivo'
  else if (/intracomunitaria?|adquisici[oó]n\s+intracomunitaria/i.test(full)) regimenFiscal = 'intracomunitaria'
  else if (/igic/i.test(full)) regimenFiscal = 'igic'
  else if (/no\s+sujeta?|no\s+sujeto/i.test(full)) regimenFiscal = 'no_sujeta'
  else if (/exenta?|exento/i.test(full)) regimenFiscal = 'exenta'
  else if (/iva/i.test(full)) regimenFiscal = 'general'

  const tipoOperacion = /intracomunitaria?|adquisici[oó]n\s+intracomunitaria/i.test(full)
    ? 'intracomunitaria'
    : /exportaci[oó]n/i.test(full)
      ? 'exportacion'
      : /inversi[oó]n\s+del\s+sujeto\s+pasivo/i.test(full)
        ? 'inversion_sujeto_pasivo'
        : /igic/i.test(full)
          ? 'canarias_igic'
          : /no\s+sujeta?|no\s+sujeto/i.test(full)
            ? 'no_sujeta'
            : /exenta?|exento/i.test(full)
              ? 'exenta'
              : 'nacional'

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

  // ── Categoría (heurística, catálogo único) ──
  let category = 'otros'
  const catMap: Record<string, string[]> = {
    mercaderias: ['supermercado', 'restaurante', 'comida', 'alimentaci', 'cafeter', 'bar ', 'panader', 'carnicer', 'fruter'],
    materias_primas: ['materia prima', 'materias primas'],
    transporte: ['gasolinera', 'combustible', 'carburante', 'peaje', 'aparcamiento', 'parking', 'uber', 'taxi', 'renfe', 'vueling', 'iberia', 'transporte', 'gasolina'],
    suministros: ['luz', 'electricidad', 'agua', 'gas', 'telefónica', 'movistar', 'vodafone', 'orange', 'suministro', 'endesa', 'iberdrola', 'naturgy'],
    alquiler: ['alquiler', 'arrendamiento', 'renta'],
    oficina: ['papelería', 'librería', 'material oficina', 'fichero', 'impresora', 'tóner', 'cartucho', 'oficina'],
    tecnologia: ['apple', 'amazon', 'software', 'hosting', 'dominio', 'aws', 'google cloud', 'azure', 'microsoft', 'adobe', 'tecnolog', 'informática'],
    marketing: ['google ads', 'facebook ads', 'meta ads', 'publicidad', 'marketing', 'seo', 'sem', 'redes sociales', 'propaganda'],
    profesional: ['asesor', 'abogado', 'notario', 'gestor', 'consultor', 'auditor', 'arquitecto', 'ingeniero', 'procurador', 'registrador', 'honorarios'],
    mantenimiento: ['mantenimiento', 'reparación', 'reparacion', 'avería', 'conservación'],
    seguros: ['seguro'],
    banca: ['banca', 'bancario', 'comisión bancaria', 'comision bancaria'],
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
    fecha_vencimiento,
    moneda,
    forma_pago,
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
      tipo_recargo: tipoRecargo,
      cuota_recargo: cuotaRecargo,
      total_factura: totalFactura,
      desglose_iva: desgloseIva.length > 0 ? desgloseIva : undefined,
    },
    iban,
    category,
    regimen_fiscal: regimenFiscal,
    tipo_operacion: tipoOperacion,
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
  fecha_vencimiento: null,
  moneda: null,
  forma_pago: null,
  emisor: { nombre: null, nif: null, direccion: null },
  receptor: { nombre: null, nif: null, direccion: null },
  lineas: [],
  totales: {
    base_imponible: null,
    tipo_iva: null,
    cuota_iva: null,
    tipo_irpf: null,
    cuota_irpf: null,
    tipo_recargo: null,
    cuota_recargo: null,
    total_factura: null,
    desglose_iva: undefined,
  },
  iban: null,
  category: 'otros',
  regimen_fiscal: null,
  tipo_operacion: null,
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
