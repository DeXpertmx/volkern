import { ColumnDef, ColumnMap, SourceTemplate } from './import-types'
import { parse } from 'csv-parse/sync'

export function normalize(val: string): string {
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function getValue(row: Record<string, string>, key: string, aliases: string[]): string | undefined {
  for (const alias of [key, ...aliases]) {
    const normalized = normalize(alias)
    const match = Object.entries(row).find(([k]) => normalize(k) === normalized)
    if (match) return match[1]?.trim()
  }
  return undefined
}

export function detectSource(headers: string[], templates: SourceTemplate[]): SourceTemplate | null {
  const normalizedHeaders = headers.map(normalize)

  for (const tmpl of templates) {
    const tmplNorm = tmpl.columns.map(c => normalize(c.label))
    const matchCount = tmplNorm.filter(t => normalizedHeaders.includes(t)).length
    const ratio = matchCount / tmplNorm.length

    if (ratio >= 0.4) return tmpl
  }
  return null
}

export function autoMapColumns(headers: string[], template: SourceTemplate): ColumnMap[] {
  const maps: ColumnMap[] = []

  for (const header of headers) {
    const normalized = normalize(header)
    let bestMatch: { target: string; score: number } | null = null

    for (const col of template.columns) {
      const allAliases = [col.label, col.key, ...col.aliases]
      for (const alias of allAliases) {
        if (normalize(alias) === normalized) {
          if (!bestMatch || col.required) {
            bestMatch = { target: col.key, score: col.required ? 2 : 1 }
          }
        }
      }
    }

    maps.push({
      sourceField: header,
      targetField: bestMatch?.target || '__skip__',
    })
  }

  return maps
}

export async function parseFile(fileBuffer: Buffer, mimeType: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  // Decide el formato el contenido, no el MIME: un .xlsx llega como ZIP (`PK`) y
  // un .xls como OLE (`d0cf11e0`). Un CSV es texto aunque el navegador lo mande
  // como hoja de cálculo, y pasarlo por SheetJS lo releía en cp1252: «Gestión»
  // entraba como «GestiÃ³n» y el cliente no reconocía ni su propio catálogo.
  const primeros = fileBuffer.subarray(0, 4)
  const esZip = primeros[0] === 0x50 && primeros[1] === 0x4b
  const esOle = primeros.toString('hex') === 'd0cf11e0'
  const declaradoExcel = /spreadsheet|excel/i.test(mimeType || '')
  const traeBytesNulos = fileBuffer.subarray(0, 1024).includes(0)

  if (esZip || esOle || (declaradoExcel && traeBytesNulos)) {
    try {
      // Import diferido: xlsx pesa ~7M y solo se necesita al parsear un fichero.
      const XLSX = await import('xlsx');
      // 65001: un libro de texto dentro de Excel también viene en UTF-8.
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', codepage: 65001 })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' })
      if (json.length === 0) return { headers: [], rows: [] }
      return {
        headers: Object.keys(json[0]),
        rows: json.map((r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))),
      }
    } catch {
    }
  }

  const text = fileBuffer.toString('utf-8')
  // Exportar con punto y coma es lo normal en el Excel en español; sin esto el
  // fichero entero cae en una sola columna.
  const cabecera = text.split(/\r?\n/, 1)[0] ?? ''
  const puntoYComa = (cabecera.match(/;/g)?.length ?? 0) > (cabecera.match(/,/g)?.length ?? 0)
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    delimiter: puntoYComa ? ';' : ',',
  })

  if (records.length === 0) return { headers: [], rows: [] }
  return {
    headers: Object.keys(records[0]),
    rows: records.map((r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))),
  }
}
