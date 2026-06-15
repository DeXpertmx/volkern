import { prisma } from '@/lib/db'
import { ImportRow, ImportResult, ColumnMap } from './import-types'

export async function importCatalog(
  tenantId: string,
  rows: ImportRow[],
  columnMap: ColumnMap[]
): Promise<ImportResult> {
  const imported: string[] = []
  const errors: { row: number; field: string; message: string }[] = []
  const map = new Map(columnMap.map(m => [m.targetField, m.sourceField]))

  for (const row of rows) {
    try {
      const nombre = getField(row.data, map, 'nombre')
      const precioStr = getField(row.data, map, 'precio') || '0'
      const duracionStr = getField(row.data, map, 'duracion') || '60'
      const descripcion = getField(row.data, map, 'descripcion')

      if (!nombre) {
        errors.push({ row: row.rowNumber, field: 'nombre', message: 'Nombre requerido' })
        continue
      }

      const precio = parseFloat(precioStr.replace(',', '.'))
      const duracion = parseInt(duracionStr)

      const existing = await prisma.servicio.findFirst({
        where: { tenantId, nombre },
      })

      if (existing) {
        await prisma.servicio.update({
          where: { id: existing.id },
          data: {
            descripcion: descripcion || existing.descripcion,
            precio: isNaN(precio) ? existing.precio : precio,
            duracionMinutos: isNaN(duracion) ? existing.duracionMinutos : duracion,
          },
        })
      } else {
        await prisma.servicio.create({
          data: {
            tenantId,
            nombre,
            descripcion,
            precio: isNaN(precio) ? 0 : precio,
            duracionMinutos: isNaN(duracion) ? 60 : duracion,
            activo: true,
            moneda: 'EUR',
          },
        })
      }

      imported.push(existing?.id || 'new')
    } catch (err) {
      errors.push({
        row: row.rowNumber,
        field: 'general',
        message: err instanceof Error ? err.message : 'Error',
      })
    }
  }

  return {
    success: errors.length === 0,
    imported: imported.length,
    failed: errors.length,
    total: rows.length,
    errors,
  }
}

function getField(data: Record<string, string>, map: Map<string, string>, targetField: string): string | undefined {
  const sourceField = map.get(targetField)
  if (!sourceField || sourceField === '__skip__') return undefined
  return data[sourceField]?.trim() || undefined
}
