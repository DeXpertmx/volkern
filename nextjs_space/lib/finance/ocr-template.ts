// ─────────────────────────────────────────────────────────────────────────────
// Plantillas de lectura por proveedor (OCR human-in-the-loop).
//
// Cada empresa tiene su propio formato de factura. Cuando el OCR genérico no
// lee bien un campo (fecha, folio, importes…), el usuario lo señala dibujando
// un rectángulo sobre la imagen en el visualizador. Ese rectángulo se guarda
// como región de la plantilla del proveedor (coordenadas relativas 0..1).
//
// En el siguiente escaneo del mismo proveedor, `applyTemplate` usa esas
// regiones para extraer los campos directamente de las cajas de palabras del
// OCR, ignorando el resto del documento.
// ─────────────────────────────────────────────────────────────────────────────

/** Una palabra reconocida por el OCR con su caja (píxeles de la imagen original). */
export interface OcrWord {
  text: string
  x: number
  y: number
  w: number
  h: number
}

/** Región de la plantilla: coordenadas relativas 0..1 sobre la imagen. */
export interface OcrTemplateField {
  field: string
  label: string
  x: number
  y: number
  w: number
  h: number
  /**
   * Valor de referencia (el corregido/confirmado cuando se aprendió la
   * plantilla). Se usa para validar lecturas futuras: si un campo deja de
   * producir valores con su mismo formato, la región probablemente apunta
   * al sitio equivocado.
   */
  reference?: string | null
}

/** Overlay de OCR.space: dimensiones de la imagen + palabras con cajas. */
export interface OcrOverlay {
  width: number
  height: number
  words: OcrWord[]
}

/** Definición de un campo anotable: cómo se etiqueta y cómo se normaliza su valor. */
export interface OcrFieldDef {
  field: string
  label: string
  /** Cómo transformar el texto crudo de la región al valor del campo. */
  normalize: (raw: string) => string | null
}

// Convierte texto a número tolerando formatos europeos ("1.696,00", "14, 20").
function toNum(s: string): number | null {
  if (!s) return null
  let cleaned = s.replace(/\s+/g, '').replace(/€/g, '')
  if (!cleaned) return null
  const m = cleaned.match(/^(.*[.,])(\d{1,2})$/)
  if (m) {
    const n = parseFloat(`${m[1].replace(/[.,]/g, '')}.${m[2]}`)
    return isFinite(n) ? Math.round(n * 100) / 100 : null
  }
  cleaned = cleaned.replace(/[.,]/g, '')
  const n = parseFloat(cleaned)
  return isFinite(n) ? Math.round(n * 100) / 100 : null
}

function normDate(raw: string): string | null {
  // Tolerar "24/07/2026", "24-07-26", "24 / 07 / 2026", "24.07.2026"
  const m = raw.match(/(\d{1,2})[\s./-]{1,3}(\d{1,2})[\s./-]{1,3}(\d{2,4})/)
  if (!m) return null
  const y = m[3].length === 2 ? '20' + m[3] : m[3]
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`
}

function normMoney(raw: string): string | null {
  // Tolerar etiquetas en la misma región ("TOTAL 1.696,00") extrayendo el
  // primer importe del texto en vez de exigir que todo sea un número.
  const m = raw.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\s?\d{1,2})/)
  if (!m) return null
  const n = toNum(m[0])
  return n === null ? null : n.toFixed(2)
}

function normNif(raw: string): string | null {
  const clean = raw.replace(/[\s\-]/g, '').toUpperCase()
  // Si la región incluye la etiqueta ("NIF: B-87654321"), extraer el token
  // NIF/CIF/NIE en vez de devolver el texto completo.
  const m = clean.match(/[A-Z]\d{7,8}[A-Z0-9]?|\d{8}[A-Z]/)
  return m ? m[0] : null
}

function normText(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim()
  return t || null
}

/** Campos que el usuario puede anotar sobre la imagen. */
export const OCR_FIELD_DEFS: OcrFieldDef[] = [
  { field: 'fecha_emision', label: 'Fecha de la factura', normalize: normDate },
  { field: 'fecha_operacion', label: 'Fecha de operación', normalize: normDate },
  { field: 'numero_factura', label: 'Nº de factura (folio)', normalize: normText },
  { field: 'base_imponible', label: 'Base imponible', normalize: normMoney },
  { field: 'tipo_iva', label: 'Tipo de IVA (%)', normalize: normText },
  { field: 'cuota_iva', label: 'Cuota de IVA', normalize: normMoney },
  { field: 'tipo_irpf', label: 'Retención IRPF (%)', normalize: normText },
  { field: 'cuota_irpf', label: 'Cuota de IRPF', normalize: normMoney },
  { field: 'total_factura', label: 'Total de la factura', normalize: normMoney },
  { field: 'emisor_nombre', label: 'Proveedor (razón social)', normalize: normText },
  { field: 'emisor_nif', label: 'NIF/CIF del proveedor', normalize: normNif },
  { field: 'iban', label: 'IBAN', normalize: normText },
]

export function getOcrFieldDef(field: string): OcrFieldDef | undefined {
  return OCR_FIELD_DEFS.find(f => f.field === field)
}

// ─── Extracción ──────────────────────────────────────────────────────────────

/** Extrae las palabras dentro de una región (coordenadas relativas). */
export function wordsInRegion(words: OcrWord[], imgW: number, imgH: number, region: OcrTemplateField): OcrWord[] {
  const rx = region.x * imgW
  const ry = region.y * imgH
  const rw = region.w * imgW
  const rh = region.h * imgH
  return words.filter(w => {
    const cx = w.x + w.w / 2
    const cy = w.y + w.h / 2
    return cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh
  })
}

/**
 * Aplica una plantilla al overlay de un escaneo: para cada región de la
 * plantilla extrae las palabras que caen dentro y normaliza su texto.
 * Devuelve un mapa `field → valor` (solo campos con valor extraíble).
 */
export function applyTemplate(
  overlay: OcrOverlay,
  fields: OcrTemplateField[]
): Record<string, string> {
  if (!overlay || overlay.width <= 0 || overlay.height <= 0 || !Array.isArray(fields)) return {}
  const result: Record<string, string> = {}
  for (const region of fields) {
    const def = getOcrFieldDef(region.field)
    if (!def) continue
    const inside = wordsInRegion(overlay.words, overlay.width, overlay.height, region)
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x)
    const raw = inside.map(w => w.text).join(' ')
    const value = def.normalize(raw)
    if (value !== null) result[region.field] = value
  }
  return result
}

// Convierte texto a número tolerando formatos europeos y US
// ("1.696,00" → 1696, "1696.00" → 1696, "1,200.50" → 1200.50).
function parseNumberLenient(s: string): number | null {
  const cleaned = s.replace(/[^\d.,-]/g, '')
  if (!cleaned) return null
  const m = cleaned.match(/^(.*[.,])(\d{1,2})$/)
  if (m) {
    const n = parseFloat(`${m[1].replace(/[.,]/g, '')}.${m[2]}`)
    return isFinite(n) ? n : null
  }
  const n = parseFloat(cleaned.replace(/[.,]/g, ''))
  return isFinite(n) ? n : null
}

/**
 * Compara dos valores de un campo tolerando formatos distintos:
 * "1.696,00" ≈ 1696 ≈ "1696.00" ≈ "1 696,00" (mismo importe) y
 * "24/07/2026" == "24/07/2026". Usada para decidir si la plantilla discrepa
 * de lo que leyó el parser genérico.
 */
export type FieldFormat = 'date' | 'money' | 'nif' | 'alnum' | 'text'

/** Clasifica el formato de un valor de campo (para validar contra la referencia). */
export function fieldFormat(s: string): FieldFormat {
  const clean = s.trim()
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(clean)) return 'date'
  const upper = clean.toUpperCase()
  if (/^[A-Z]\d{7,8}[A-Z0-9]?$/.test(upper) || /^\d{8}[A-Z]$/.test(upper)) return 'nif'
  // Importe: sin letras (evita que un folio tipo "F2026-00142" pase por money
  // tras normalizar) y que sea numérico al parsearlo.
  if (!/[A-Za-zÀ-ÿ]/.test(clean) && parseNumberLenient(clean) !== null) return 'money'
  if (/[A-Za-zÀ-ÿ]/.test(clean) && /\d/.test(clean)) return 'alnum'
  return 'text'
}

/**
 * Valida una lectura contra el valor de referencia guardado en la plantilla.
 * Valores del MISMO formato se consideran válidos (cada factura trae datos
 * distintos: fechas, folios e importes cambian), pero si el formato cambia
 * (la referencia era una fecha y ahora sale un importe) la región apunta mal.
 */
export function validateReference(
  extracted: string,
  reference: string | null | undefined
): { ok: boolean; reason?: string } {
  if (!reference) return { ok: true }
  const a = extracted.trim().toLowerCase()
  const b = reference.trim().toLowerCase()
  if (a === b) return { ok: true }
  if (fieldFormat(extracted) === fieldFormat(reference)) return { ok: true }
  return { ok: false, reason: 'Formato distinto al guardado en la plantilla' }
}

export function sameFieldValue(a: string, b: string): boolean {
  const x = a.trim().toLowerCase().replace(/\s+/g, '')
  const y = b.trim().toLowerCase().replace(/\s+/g, '')
  if (x === y) return true
  const nx = parseNumberLenient(x)
  const ny = parseNumberLenient(y)
  return nx !== null && ny !== null && Math.abs(nx - ny) < 0.005
}

/**
 * Convierte el `TextOverlay` de OCR.space (JSON crudo) al formato interno.
 * Devuelve null si el overlay no trae palabras.
 */
export function overlayFromOcrSpace(json: any): OcrOverlay | null {
  const overlay = json?.ParsedResults?.[0]?.TextOverlay
  if (!overlay) return null
  const width = Number(overlay.Width)
  const height = Number(overlay.Height)
  if (!width || !height) return null
  const words: OcrWord[] = []
  for (const line of overlay.Lines || []) {
    for (const w of line.Words || []) {
      const text = String(w.WordText || '').trim()
      if (!text) continue
      const x = Number(w.Left)
      const y = Number(w.Top)
      const ww = Number(w.Width)
      const wh = Number(w.Height)
      if (!isFinite(x) || !isFinite(y) || !isFinite(ww) || !isFinite(wh)) continue
      words.push({ text, x, y, w: ww, h: wh })
    }
  }
  if (words.length === 0) return null
  return { width, height, words }
}
