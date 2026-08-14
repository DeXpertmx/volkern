/**
 * Catálogo único de categorías de gastos y su cuenta contable del Plan
 * General Contable español (Grupo 6 — Compras y Gastos).
 *
 * Fuente única de verdad: lo usan la UI (selector de categoría del escaneo),
 * el parser OCR (invoice-parser) y el mapeo contable de gastos
 * (expense-entry-proposal / clasificación). Mantener aquí cualquier categoría
 * nueva; las cuentas deben existir en el plan del tenant (accounting_accounts,
 * code LIKE '6%').
 */

export interface ExpenseCategory {
  /** Identificador interno guardado en erp_expenses.category */
  value: string
  /** Etiqueta visible en la UI */
  label: string
  /** Cuenta contable del Grupo 6 del PGC */
  accountCode: string
  /** Nombre de la cuenta contable */
  accountName: string
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { value: 'mercaderias', label: 'Mercaderías', accountCode: '600', accountName: 'Compras de mercaderías' },
  { value: 'materias_primas', label: 'Materias primas', accountCode: '601', accountName: 'Compras de materias primas' },
  { value: 'transporte', label: 'Transporte', accountCode: '624', accountName: 'Transportes' },
  { value: 'suministros', label: 'Suministros', accountCode: '628', accountName: 'Suministros (luz, agua, gas, telecomunicaciones)' },
  { value: 'alquiler', label: 'Alquiler', accountCode: '621', accountName: 'Arrendamientos y cánones' },
  { value: 'oficina', label: 'Oficina y papelería', accountCode: '629', accountName: 'Otros servicios (material de oficina)' },
  { value: 'tecnologia', label: 'Tecnología y software', accountCode: '629', accountName: 'Otros servicios (software, suscripciones, hosting)' },
  { value: 'marketing', label: 'Marketing y publicidad', accountCode: '627', accountName: 'Publicidad, propaganda y relaciones públicas' },
  { value: 'profesional', label: 'Servicios profesionales', accountCode: '623', accountName: 'Servicios de profesionales independientes' },
  { value: 'mantenimiento', label: 'Mantenimiento', accountCode: '622', accountName: 'Reparaciones y conservación' },
  { value: 'seguros', label: 'Seguros', accountCode: '625', accountName: 'Primas de seguros' },
  { value: 'banca', label: 'Servicios bancarios', accountCode: '626', accountName: 'Servicios bancarios y similares' },
  { value: 'otros', label: 'Otros', accountCode: '629', accountName: 'Otros servicios' },
]

/** Mapa value → categoría para búsqueda directa */
export const EXPENSE_CATEGORY_MAP: Record<string, ExpenseCategory> = Object.fromEntries(
  EXPENSE_CATEGORIES.map(c => [c.value, c])
)

/**
 * Resuelve la cuenta contable de una categoría. Acepta el value del catálogo
 * (p. ej. 'mercaderias') o texto libre con keywords (p. ej. 'compras de
 * supermercado'). Fallback: 629 Otros servicios.
 */
export function accountForExpenseCategory(category: string): { code: string; name: string } {
  // Normaliza: minúsculas, sin acentos (para que 'reparación' matchee 'reparacion')
  const normalized = category.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!normalized) return { code: '629', name: 'Otros servicios' }

  // 1. Value exacto del catálogo
  const byValue = EXPENSE_CATEGORY_MAP[normalized]
  if (byValue) return { code: byValue.accountCode, name: byValue.accountName }

  // 2. Keywords contables (formato libre: descripción, OCR, legacy)
  const KEYWORDS: Array<[RegExp, ExpenseCategory]> = [
    [/mercader|compras de mercader|supermercado|alimentaci|restaurante|comida|cafeter/, EXPENSE_CATEGORY_MAP.mercaderias],
    [/materias? primas|materia prima/, EXPENSE_CATEGORY_MAP.materias_primas],
    [/transporte|combustible|gasolinera|peaje|parking|taxi|uber/, EXPENSE_CATEGORY_MAP.transporte],
    [/suministro|luz|electricidad|agua|\bgas\b|telef|telecomunicac|movistar|vodafone|orange|endesa|iberdrola|naturgy/, EXPENSE_CATEGORY_MAP.suministros],
    [/arrendamiento|alquiler|renta/, EXPENSE_CATEGORY_MAP.alquiler],
    [/papeler|material oficina|oficina|toner|tóner|cartucho/, EXPENSE_CATEGORY_MAP.oficina],
    [/software|suscripcion|hosting|dominio|aws|azure|google cloud|microsoft|adobe|informátic|tecnolog|apple|equipo de computo/, EXPENSE_CATEGORY_MAP.tecnologia],
    [/publicidad|marketing|google ads|facebook ads|meta ads|seo|sem|redes sociales|propaganda/, EXPENSE_CATEGORY_MAP.marketing],
    [/honorarios|profesional|asesor|abogado|notario|gestor|consultor|auditor|arquitecto|ingeniero|procurador|registrador/, EXPENSE_CATEGORY_MAP.profesional],
    [/mantenimiento|reparacion|conservación|avería/, EXPENSE_CATEGORY_MAP.mantenimiento],
    [/seguro/, EXPENSE_CATEGORY_MAP.seguros],
    [/banca|bancario|comision bancaria|intereses de deudas/, EXPENSE_CATEGORY_MAP.banca],
  ]
  for (const [re, cat] of KEYWORDS) {
    if (re.test(normalized)) return { code: cat.accountCode, name: cat.accountName }
  }

  return { code: '629', name: 'Otros servicios' }
}
