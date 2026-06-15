export type ImportSource = 'sage' | 'microdata' | 'generic_csv' | 'generic_xlsx'
export type ImportType = 'clients' | 'accounting' | 'catalog'
export type ImportStatus = 'completed' | 'partial' | 'failed'

export interface ColumnDef {
  key: string
  label: string
  required: boolean
  description?: string
  aliases: string[]
}

export interface ColumnMap {
  sourceField: string
  targetField: string
}

export interface ImportRow {
  rowNumber: number
  data: Record<string, string>
  errors?: string[]
}

export interface ImportResult {
  success: boolean
  imported: number
  failed: number
  total: number
  errors: { row: number; field: string; message: string }[]
  logId?: string
}

export interface SourceTemplate {
  name: string
  source: ImportSource
  type: ImportType
  columns: ColumnDef[]
  detect: (headers: string[]) => boolean
}

export interface PgcMapping {
  sourceCode: string
  sourceName: string
  targetCode: string
  targetName: string
  confidence: number
}
