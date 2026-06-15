import { prisma } from '@/lib/db'
import { ImportSource, ImportType, ImportStatus, SourceTemplate } from './import-types'
import { parseFile, detectSource, autoMapColumns } from './column-mapper'
import { importClients } from './import-clients'
import { importOpeningBalances, importJournalEntries } from './import-accounting'
import { importCatalog } from './import-catalog'
import { sageClientsTemplate } from './sage/clients'
import { sageAccountingTemplate, sageBalancesTemplate } from './sage/accounting'
import { microdataClientsTemplate } from './microdata/clients'
import { microdataAccountingTemplate, microdataBalancesTemplate } from './microdata/accounting'

const ALL_TEMPLATES: SourceTemplate[] = [
  sageClientsTemplate,
  sageAccountingTemplate,
  sageBalancesTemplate,
  microdataClientsTemplate,
  microdataAccountingTemplate,
  microdataBalancesTemplate,
]

export async function detectFileFormat(
  fileBuffer: Buffer,
  mimeType: string
): Promise<{
  headers: string[]
  preview: Record<string, string>[]
  detectedSource: ImportSource | null
  detectedType: ImportType | null
  template: SourceTemplate | null
  suggestedMapping: { sourceField: string; targetField: string }[]
}> {
  const { headers, rows } = parseFile(fileBuffer, mimeType)
  const template = detectSource(headers, ALL_TEMPLATES)
  const preview = rows.slice(0, 10)

  return {
    headers,
    preview,
    detectedSource: template?.source || null,
    detectedType: template?.type || null,
    template: template || null,
    suggestedMapping: template ? autoMapColumns(headers, template) : headers.map(h => ({ sourceField: h, targetField: '__skip__' })),
  }
}

export async function executeImport(
  tenantId: string,
  userId: string,
  type: ImportType,
  source: ImportSource,
  fileBuffer: Buffer,
  mimeType: string,
  columnMapping: { sourceField: string; targetField: string }[]
): Promise<{
  success: boolean
  imported: number
  failed: number
  total: number
  errors: { row: number; field: string; message: string }[]
  logId: string
}> {
  const { headers, rows } = parseFile(fileBuffer, mimeType)
  const dataRows = rows.map((r, i) => ({ rowNumber: i + 1, data: r }))

  let result: { success: boolean; imported: number; failed: number; total: number; errors: { row: number; field: string; message: string }[] }

  switch (type) {
    case 'clients':
      result = await importClients(tenantId, dataRows, columnMapping, userId)
      break
    case 'accounting':
      result = await importOpeningBalances(tenantId, dataRows, columnMapping)
      break
    case 'catalog':
      result = await importCatalog(tenantId, dataRows, columnMapping)
      break
    default:
      result = { success: false, imported: 0, failed: rows.length, total: rows.length, errors: [] }
  }

  const status: ImportStatus = result.failed === 0 ? 'completed' : result.imported > 0 ? 'partial' : 'failed'

  const log = await prisma.importLog.create({
    data: {
      tenantId,
      type,
      source,
      fileName: 'upload',
      fileSize: fileBuffer.length,
      recordsTotal: result.total,
      recordsImported: result.imported,
      recordsFailed: result.failed,
      errors: result.errors.length > 0 ? result.errors : undefined,
      columnMapping: columnMapping.length > 0 ? columnMapping : undefined,
      status,
      createdBy: userId,
    },
  })

  return {
    ...result,
    logId: log.id,
  }
}
