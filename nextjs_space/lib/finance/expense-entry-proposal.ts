export interface ExpenseEntryProposalVatRow {
  rate: number
  base: number
  amount: number
}

export interface ExpenseEntryProposalInput {
  category: string
  amount: string | number
  taxableBase?: string | number | null
  vatRate?: string | number | null
  vatAmount?: string | number | null
  irpfAmount?: string | number | null
  surchargeAmount?: string | number | null
  operationType?: string | null
  vatBreakdown?: ExpenseEntryProposalVatRow[]
}

export interface ExpenseEntryProposalLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface ExpenseEntryProposal {
  expenseAccountCode: string
  expenseAccountName: string
  operationType: string
  treatmentLabel: string
  requiresFiscalReview: boolean
  reverseChargeVat: number
  taxableBase: number
  vatAmount: number
  surchargeAmount: number
  irpfAmount: number
  supplierPayable: number
  expectedGrossTotal: number
  sourceTotal: number
  difference: number
  totalMatches: boolean
  balanced: boolean
  lines: ExpenseEntryProposalLine[]
}

const CATEGORY_ACCOUNTS: Array<[string, string, string]> = [
  ['compras', '600', 'Compras de mercaderías'],
  ['materias primas', '601', 'Compras de materias primas'],
  ['arrendamiento', '621', 'Arrendamientos y cánones'],
  ['alquiler', '621', 'Arrendamientos y cánones'],
  ['reparacion', '622', 'Reparaciones y conservación'],
  ['honorarios', '623', 'Servicios profesionales independientes'],
  ['profesional', '623', 'Servicios profesionales independientes'],
  ['transporte', '624', 'Transportes'],
  ['seguro', '625', 'Primas de seguros'],
  ['banca', '626', 'Servicios bancarios'],
  ['publicidad', '627', 'Publicidad, propaganda y relaciones públicas'],
  ['suministro', '628', 'Suministros'],
  ['luz', '628', 'Suministros'],
  ['agua', '628', 'Suministros'],
  ['gas', '628', 'Suministros'],
  ['telefono', '628', 'Suministros'],
  ['marketing', '629', 'Otros servicios'],
  ['software', '629', 'Otros servicios'],
  ['suscripcion', '629', 'Otros servicios'],
]

const REVERSE_CHARGE_OPERATIONS = new Set(['intracomunitaria', 'inversion_sujeto_pasivo'])
const NO_SPANISH_VAT_OPERATIONS = new Set(['exportacion', 'exenta', 'no_sujeta', 'canarias_igic'])

function numberValue(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function accountForCategory(category: string): { code: string; name: string } {
  const normalized = category.toLowerCase().trim()
  const found = CATEGORY_ACCOUNTS.find(([keyword]) => normalized.includes(keyword))
  return found ? { code: found[1], name: found[2] } : { code: '629', name: 'Otros servicios' }
}

function operationTreatment(operationType: string): { label: string; review: boolean } {
  switch (operationType) {
    case 'intracomunitaria': return { label: 'Adquisición intracomunitaria · inversión del sujeto pasivo', review: true }
    case 'inversion_sujeto_pasivo': return { label: 'Inversión del sujeto pasivo', review: true }
    case 'exportacion': return { label: 'Exportación · sin IVA español', review: true }
    case 'exenta': return { label: 'Operación exenta', review: true }
    case 'no_sujeta': return { label: 'Operación no sujeta', review: true }
    case 'canarias_igic': return { label: 'Canarias · IGIC', review: true }
    case 'recargo_equivalencia': return { label: 'Régimen de recargo de equivalencia', review: false }
    default: return { label: 'Operación nacional · régimen general', review: false }
  }
}

/**
 * Construye una propuesta de partida doble sin tocar la base de datos.
 * La propuesta usa el desglose fiscal corregido por el usuario cuando existe
 * y aplica un tratamiento explícito para operaciones no nacionales.
 */
export function buildExpenseEntryProposal(input: ExpenseEntryProposalInput): ExpenseEntryProposal {
  const sourceTotal = roundMoney(numberValue(input.amount))
  const operationType = (input.operationType || 'nacional').toLowerCase()
  const isReverseCharge = REVERSE_CHARGE_OPERATIONS.has(operationType)
  const excludesSpanishVat = NO_SPANISH_VAT_OPERATIONS.has(operationType)
  const treatment = operationTreatment(operationType)
  const breakdown = (input.vatBreakdown || [])
    .filter(row => Number.isFinite(row.rate) && Number.isFinite(row.base) && Number.isFinite(row.amount) && row.amount > 0)
  const detectedVatAmount = breakdown.length > 0
    ? roundMoney(breakdown.reduce((sum, row) => sum + row.amount, 0))
    : roundMoney(numberValue(input.vatAmount))
  const surchargeAmount = roundMoney(numberValue(input.surchargeAmount))
  const irpfAmount = roundMoney(Math.abs(numberValue(input.irpfAmount)))
  const vatRate = numberValue(input.vatRate)
  const explicitBase = numberValue(input.taxableBase)
  const rawBase = explicitBase > 0
    ? explicitBase
    : Math.max(sourceTotal - (isReverseCharge || excludesSpanishVat ? 0 : detectedVatAmount) - surchargeAmount, 0)
  const taxableBase = roundMoney(rawBase)
  const calculatedReverseVat = vatRate > 0 ? roundMoney(taxableBase * vatRate / 100) : 0
  const vatAmount = excludesSpanishVat ? 0 : (isReverseCharge ? (detectedVatAmount || calculatedReverseVat) : detectedVatAmount)
  const reverseChargeVat = isReverseCharge ? vatAmount : 0
  const effectiveBreakdown = excludesSpanishVat ? [] : breakdown
  const expectedGrossTotal = roundMoney(taxableBase + (isReverseCharge ? 0 : vatAmount) + surchargeAmount)
  const supplierPayable = roundMoney(expectedGrossTotal - irpfAmount)
  const difference = roundMoney((supplierPayable + irpfAmount) - sourceTotal)
  const expenseAccount = accountForCategory(input.category)

  const lines: ExpenseEntryProposalLine[] = [
    { accountCode: expenseAccount.code, accountName: expenseAccount.name, debit: taxableBase, credit: 0 },
  ]

  if (effectiveBreakdown.length > 0) {
    effectiveBreakdown.forEach(row => {
      lines.push({ accountCode: '472', accountName: `IVA soportado ${row.rate}%`, debit: roundMoney(row.amount), credit: 0 })
      if (isReverseCharge) lines.push({ accountCode: '477', accountName: `IVA autorrepercutido ${row.rate}%`, debit: 0, credit: roundMoney(row.amount) })
    })
  } else if (vatAmount > 0) {
    lines.push({ accountCode: '472', accountName: isReverseCharge ? 'IVA soportado (autorrepercusión)' : 'IVA soportado', debit: vatAmount, credit: 0 })
    if (isReverseCharge) lines.push({ accountCode: '477', accountName: 'IVA autorrepercutido', debit: 0, credit: vatAmount })
  }

  if (surchargeAmount > 0) {
    lines.push({ accountCode: '472', accountName: 'Recargo de equivalencia', debit: surchargeAmount, credit: 0 })
  }
  if (supplierPayable > 0) {
    lines.push({ accountCode: '410', accountName: 'Acreedores por prestaciones de servicios', debit: 0, credit: supplierPayable })
  }
  if (irpfAmount > 0) {
    lines.push({ accountCode: '4751', accountName: 'HP acreedora por retenciones practicadas', debit: 0, credit: irpfAmount })
  }

  const totalDebit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0))
  const totalCredit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0))

  return {
    expenseAccountCode: expenseAccount.code,
    expenseAccountName: expenseAccount.name,
    operationType,
    treatmentLabel: treatment.label,
    requiresFiscalReview: treatment.review,
    reverseChargeVat,
    taxableBase,
    vatAmount,
    surchargeAmount,
    irpfAmount,
    supplierPayable,
    expectedGrossTotal,
    sourceTotal,
    difference,
    totalMatches: Math.abs(difference) <= 0.02,
    balanced: Math.abs(totalDebit - totalCredit) <= 0.001,
    lines,
  }
}
