export function isTelegramCommand(text: string, command: string): boolean {
  const normalizedCommand = command.replace(/^\//, '')
  const pattern = new RegExp(`^/${normalizedCommand}(?:@\\w+)?(?:\\s|$)`, 'i')
  return pattern.test(text)
}

export function parseTelegramInvoiceDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!match) return undefined

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3])
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return undefined

  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return date
}

const DISCARDABLE_EXPENSE_INBOX_STATUSES = new Set(['PENDING_REVIEW', 'REVIEW', 'ERROR'])

export function canDiscardTelegramExpenseStatus(status: string): boolean {
  return DISCARDABLE_EXPENSE_INBOX_STATUSES.has(status)
}

export function canRestoreTelegramExpenseStatus(status: string): boolean {
  return status === 'DISCARDED'
}

export interface TelegramExpenseSummaryInput {
  fileName: string
  status: string
  pageStart: number
  pageEnd: number
  extractedData?: unknown
  errorMessage?: string | null
}

function summaryValue(value: unknown, fallback = 'no leído'): string {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
  return text ? text.slice(0, 180) : fallback
}

export function buildTelegramExpenseSummary(input: TelegramExpenseSummaryInput): string {
  const extracted = (input.extractedData && typeof input.extractedData === 'object'
    ? input.extractedData
    : {}) as any
  const totals = extracted.totales || {}
  const total = totals.total_factura ?? extracted.total
  const vat = totals.cuota_iva ?? extracted.vatAmount
  const base = totals.base_imponible ?? extracted.taxableBase
  const surcharge = totals.cuota_recargo
  const irpf = totals.cuota_irpf
  const vatRows = Array.isArray(totals.desglose_iva) ? totals.desglose_iva.length : 0

  return [
    `📄 ${summaryValue(input.fileName)}`,
    `Estado: ${summaryValue(input.status)}`,
    `Páginas: ${input.pageStart}–${input.pageEnd}`,
    `Proveedor: ${summaryValue(extracted.emisor?.nombre || extracted.supplier)}`,
    `NIF: ${summaryValue(extracted.emisor?.nif || extracted.issuerTaxId)}`,
    `Factura: ${summaryValue(extracted.numero_factura || extracted.invoiceNumber)}`,
    `Fecha: ${summaryValue(extracted.fecha_emision || extracted.date)}`,
    `Base: ${base == null ? 'no leída' : base}`,
    `IVA: ${vat == null ? 'no leído' : vat}${vatRows ? ` (${vatRows} tramos)` : ''}`,
    `Recargo: ${surcharge == null ? '0' : surcharge}`,
    `IRPF: ${irpf == null ? '0' : irpf}`,
    `Total: ${total == null ? 'no leído' : `${summaryValue(extracted.moneda, 'EUR')} ${total}`}`,
    ...(input.errorMessage ? [`Error: ${summaryValue(input.errorMessage)}`] : []),
    '',
    'Para corregir: /gasto_corregir ID campo valor',
    'Campos: proveedor, nif, factura, fecha, vencimiento, total, base, iva, recargo, irpf, moneda, pago u operacion.',
  ].join('\n')
}

export function parseTelegramNumber(value: string): number | null {
  const cleaned = value.replace(/[^0-9,.-]/g, '').replace(/\s/g, '')
  if (!cleaned) return null

  let normalized = cleaned
  const comma = cleaned.lastIndexOf(',')
  const dot = cleaned.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else if (comma >= 0) {
    normalized = cleaned.replace(',', '.')
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\./g, '')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null
}
