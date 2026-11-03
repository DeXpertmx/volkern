/**
 * Parseo común de las tres rutas de importación.
 *
 * `mode` es el interruptor de seguridad: sin él, el comportamiento es el de
 * siempre (commit). La previsualización no escribe datos y devuelve el informe
 * de calidad con la cuarentena en CSV.
 */

import { NextResponse } from 'next/server'
import type { ColumnMap, ImportSource, ImportType } from '@/lib/import/import-types'
import type { ApiKeyAuthResult } from '@/lib/api-key-auth'
import { procesarImportacion } from '@/lib/import/procesar'

const VERDADEROS = new Set(['true', '1', 'on', 'si', 'sí'])

export async function importarDesdeFormData(
  req: Request,
  auth: ApiKeyAuthResult,
  tipo: ImportType,
  source: ImportSource = 'generic_csv',
) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const mappingBruto = formData.get('mapping')

  if (!file || !mappingBruto) {
    return NextResponse.json({ error: 'Archivo y mapping requeridos' }, { status: 400 })
  }

  let mapping: ColumnMap[]
  try {
    const parseado = JSON.parse(String(mappingBruto))
    if (!Array.isArray(parseado)) throw new Error('no es un array')
    mapping = parseado
  } catch {
    return NextResponse.json({ error: 'El mapeo de columnas no es JSON válido' }, { status: 400 })
  }

  const mode = String(formData.get('mode') || 'commit') === 'preview' ? 'preview' : 'commit'
  const incluirPosiblesDuplicados = VERDADEROS.has(
    String(formData.get('incluirPosiblesDuplicados') || '').toLowerCase(),
  )

  const yearBruto = formData.get('fiscalYear')
  const year = yearBruto ? Number.parseInt(String(yearBruto), 10) : undefined

  const batchBruto = formData.get('batchId')
  const batchId =
    typeof batchBruto === 'string' && batchBruto.trim() ? batchBruto.trim().slice(0, 64) : undefined

  const buffer = Buffer.from(await file.arrayBuffer())

  const resultado = await procesarImportacion({
    tenantId: auth.tenant!.id,
    userId: auth.user?.id || 'system',
    tipo,
    source,
    buffer,
    mimeType: file.type,
    mapping,
    mode,
    incluirPosiblesDuplicados,
    fiscalYear: Number.isFinite(year) ? year : undefined,
    fileName: file.name,
    batchId,
  })

  return NextResponse.json(resultado)
}
