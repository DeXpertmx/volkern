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
  /** Página del PDF a la que pertenece la región (1 por defecto para imágenes y plantillas antiguas). */
  page?: number
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

/**
 * Plantilla de tramos de IVA: posición (relativa 0..1) de las columnas
 * tipo/base/cuota de cada fila de impuestos del proveedor. Se aprende cuando
 * el usuario confirma los tramos tras el escaneo y permite extraerlos en el
 * siguiente escaneo por geometría, sin volver a detectar ni re-asociar.
 */
export interface VatRowTemplate {
  /** Región del tipo de IVA (p. ej. "21,00 %"). */
  rate: { x: number; y: number; w: number; h: number }
  /** Región de la base imponible del tramo. */
  base: { x: number; y: number; w: number; h: number }
  /** Región de la cuota del tramo. */
  cuota: { x: number; y: number; w: number; h: number }
  /** Valores confirmados cuando se aprendió la plantilla (referencia). */
  reference?: { tipo: number; base: number; cuota: number } | null
  /** Página del PDF a la que pertenecen las regiones (1 por defecto). */
  page?: number
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
  { field: 'fecha_vencimiento', label: 'Fecha de vencimiento', normalize: normDate },
  { field: 'numero_factura', label: 'Nº de factura (folio)', normalize: normText },
  { field: 'moneda', label: 'Moneda', normalize: normText },
  { field: 'forma_pago', label: 'Forma de pago', normalize: normText },
  { field: 'base_imponible', label: 'Base imponible', normalize: normMoney },
  { field: 'tipo_iva', label: 'Tipo de IVA (%)', normalize: normText },
  { field: 'cuota_iva', label: 'Cuota de IVA', normalize: normMoney },
  { field: 'tipo_irpf', label: 'Retención IRPF (%)', normalize: normText },
  { field: 'cuota_irpf', label: 'Cuota de IRPF', normalize: normMoney },
  { field: 'tipo_recargo', label: 'Recargo de equivalencia (%)', normalize: normText },
  { field: 'cuota_recargo', label: 'Cuota de recargo', normalize: normMoney },
  { field: 'regimen_fiscal', label: 'Régimen fiscal', normalize: normText },
  { field: 'tipo_operacion', label: 'Tipo de operación', normalize: normText },
  { field: 'total_factura', label: 'Total de la factura', normalize: normMoney },
  { field: 'emisor_nombre', label: 'Proveedor (razón social)', normalize: normText },
  { field: 'emisor_nif', label: 'NIF/CIF del proveedor', normalize: normNif },
  { field: 'emisor_direccion', label: 'Domicilio del proveedor', normalize: normText },
  { field: 'receptor_nombre', label: 'Receptor (razón social)', normalize: normText },
  { field: 'receptor_nif', label: 'NIF/CIF del receptor', normalize: normNif },
  { field: 'receptor_direccion', label: 'Domicilio del receptor', normalize: normText },
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
  fields: OcrTemplateField[],
  page = 1
): Record<string, string> {
  if (!overlay || overlay.width <= 0 || overlay.height <= 0 || !Array.isArray(fields)) return {}
  const result: Record<string, string> = {}
  for (const region of fields) {
    if ((region.page ?? 1) !== page) continue
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

// Normaliza fechas en cualquier formato común, incluido el ISO del <input
// type="date"> ("2026-07-24" → "24/07/2026").
function normDateLoose(raw: string): string | null {
  const s = raw.trim()
  const ymd = s.match(/^(\d{4})[\s./-]{1,3}(\d{1,2})[\s./-]{1,3}(\d{1,2})$/)
  if (ymd) return `${ymd[3].padStart(2, '0')}/${ymd[2].padStart(2, '0')}/${ymd[1]}`
  return normDate(s)
}

/**
 * ¿Dos valores de un campo representan lo mismo aunque estén en formatos
 * distintos? ("2026-07-24" ≈ "24/07/2026", "B-87654321" ≈ "B87654321",
 * "1.210,00" ≈ 1210). Se usa para saber si el usuario CAMBIÓ de verdad un
 * campo tras el escaneo o solo lo re-escribió igual que lo leyó el OCR.
 */
export function valuesEquivalent(a: string, b: string): boolean {
  if (sameFieldValue(a, b)) return true
  const da = normDateLoose(a)
  const db = normDateLoose(b)
  if (da && db && da === db) return true
  const na = normNif(a)
  const nb = normNif(b)
  if (na && nb && na === nb) return true
  return false
}

// ─── Aprendizaje automático: proponer la región de un valor corregido ───────

/** Propuesta de región: dónde está un valor corregido en la imagen del OCR. */
export interface RegionProposal {
  field: string
  label: string
  region: OcrTemplateField
  /** Texto tal como aparece en el OCR (para mostrarlo en el aviso). */
  matchedText: string
  /** 1 = coincidencia exacta, 0.85 = subcadena (palabra más larga). */
  confidence: number
  /**
   * Valor corregido que se guardará como referencia de la plantilla. Para los
   * tramos de IVA es el valor editado en la fila (el formulario solo guarda
   * agregados, así que no se puede derivar después); para los campos de texto
   * se deja null y se usa el valor actual del formulario al guardar.
   */
  reference?: string | null
}

// Clave canónica de comparación: fecha, importe, NIF o texto en mayúsculas.
// El prefijo evita colisiones entre tipos ("m:21" no es "t:21").
function normalizeToken(raw: string, def: OcrFieldDef): string | null {
  const s = raw.trim()
  if (!s) return null
  const d = normDateLoose(s)
  if (d) return `d:${d}`
  // Importe o porcentaje ("1.210,00", "21%") — sin letras para no confundir
  // un folio tipo "F2026-00142" con un importe.
  if (!/[A-Za-zÀ-ÿ]/.test(s)) {
    const n = toNum(s)
    if (n !== null) return `m:${n}`
  }
  const nif = normNif(s)
  if (nif && (/^[A-Z]\d{7,8}[A-Z0-9]?$/.test(nif) || /^\d{8}[A-Z]$/.test(nif))) return `n:${nif}`
  return `t:${s.replace(/\s+/g, ' ').toUpperCase()}`
}

// Puntuación de una palabra/línea contra el valor objetivo.
function tokenScore(key: string, target: string, moneyLike: boolean): number {
  if (key === target) return 1
  const a = key.replace(/\s+/g, '').toLowerCase()
  const b = target.replace(/\s+/g, '').toLowerCase()
  if (a === b) return 1
  // Para importes la igualdad numérica ya cubre los formatos ("m:1210" ==
  // "m:1210"); la subcadena solo para textos (nombres, folios, IBAN…).
  if (!moneyLike && (a.includes(b) || b.includes(a))) {
    if (Math.min(a.length, b.length) >= 4) return 0.85
  }
  return 0
}

// Agrupa palabras por línea (mismo centro vertical) para poder comparar
// valores de varias palabras (razón social, dirección, IBAN…).
function groupLines(words: OcrWord[]): OcrWord[][] {
  const sorted = words.slice().sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: OcrWord[][] = []
  for (const w of sorted) {
    const cy = w.y + w.h / 2
    const line = lines.find(l => {
      const first = l[0]
      const fcy = first.y + first.h / 2
      return Math.abs(cy - fcy) <= Math.max(6, Math.max(first.h, w.h) * 0.7)
    })
    if (line) line.push(w)
    else lines.push([w])
  }
  return lines
}

// Caja de un conjunto de palabras en coordenadas relativas 0..1.
function bboxOf(words: OcrWord[], imgW: number, imgH: number): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const w of words) {
    minX = Math.min(minX, w.x)
    minY = Math.min(minY, w.y)
    maxX = Math.max(maxX, w.x + w.w)
    maxY = Math.max(maxY, w.y + w.h)
  }
  const x = Math.max(0, minX / imgW)
  const y = Math.max(0, minY / imgH)
  return {
    x,
    y,
    w: Math.min(1 - x, (maxX - minX) / imgW),
    h: Math.min(1 - y, (maxY - minY) / imgH),
  }
}

// Expande un poco la región (para incluir la etiqueta o el símbolo € adyacente)
// y la mantiene dentro de 0..1.
function padRegion(r: { x: number; y: number; w: number; h: number }, pad: number): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, r.x - pad)
  const y = Math.max(0, r.y - pad)
  const w = Math.min(1 - x, r.w + pad * 2)
  const h = Math.min(1 - y, r.h + pad * 2)
  return { x, y, w, h }
}

/**
 * Busca en el overlay del OCR dónde está un valor concreto (el que el usuario
 * acaba de corregir a mano en el formulario) y devuelve la región relativa
 * para guardarla en la plantilla del proveedor — el modo de aprendizaje
 * automático: corriges un campo y el sistema te propone la caja.
 *
 * Compara palabra a palabra y línea a línea (para nombres/direcciones), con
 * normalización por tipo: fechas en cualquier formato, importes europeos/US,
 * NIF con o sin guiones. Devuelve null si no encuentra nada fiable (≥ 0.85).
 */
export function findRegionForValue(
  overlay: OcrOverlay,
  value: string,
  def: OcrFieldDef
): RegionProposal | null {
  if (!overlay || overlay.width <= 0 || overlay.height <= 0) return null
  const target = normalizeToken(value, def)
  if (!target) return null
  // Los campos de importe solo se casan por igualdad numérica (no subcadena).
  const moneyLike = def.normalize === normMoney || def.normalize === normText && /%|iva|irpf/i.test(def.label)
  const words = overlay.words

  let best: { score: number; boxWords: OcrWord[]; text: string } | null = null

  // Palabra individual
  for (const w of words) {
    const key = normalizeToken(w.text, def)
    if (!key) continue
    const score = tokenScore(key, target, moneyLike)
    if (score > 0 && (!best || score > best.score)) {
      best = { score, boxWords: [w], text: w.text }
    }
  }

  // Línea completa (razón social, dirección, IBAN partido…)
  for (const line of groupLines(words)) {
    const joined = line.map(w => w.text).join(' ')
    const key = normalizeToken(joined, def)
    if (!key) continue
    const score = tokenScore(key, target, moneyLike)
    if (score > 0 && (!best || score > best.score)) {
      best = { score, boxWords: line, text: joined }
    }
  }

  if (!best || best.score < 0.85) return null

  const region = padRegion(bboxOf(best.boxWords, overlay.width, overlay.height), 0.015)
  return {
    field: def.field,
    label: def.label,
    region: { field: def.field, label: def.label, ...region },
    matchedText: best.text,
    confidence: best.score,
  }
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
