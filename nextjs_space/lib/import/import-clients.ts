import { prisma } from '@/lib/db'
import { ImportRow, ImportResult, ColumnMap } from './import-types'

export async function importClients(
  tenantId: string,
  rows: ImportRow[],
  columnMap: ColumnMap[],
  userId: string
): Promise<ImportResult> {
  const imported: string[] = []
  const errors: { row: number; field: string; message: string }[] = []

  const map = new Map(columnMap.map(m => [m.targetField, m.sourceField]))

  for (const row of rows) {
    try {
      const nombre = getField(row.data, map, 'nombre')
      const email = getField(row.data, map, 'email')
      const telefono = getField(row.data, map, 'telefono')
      const empresa = getField(row.data, map, 'empresa')
      const nif = getField(row.data, map, 'nif')
      const direccion = getField(row.data, map, 'direccion')
      const ciudad = getField(row.data, map, 'ciudad')
      const pais = getField(row.data, map, 'pais')
      const codigoPostal = getField(row.data, map, 'codigo_postal')

      const fieldErrors: string[] = []
      if (!nombre) fieldErrors.push('nombre')
      if (!email && !nif) fieldErrors.push('email/nif')

      if (fieldErrors.length > 0) {
        errors.push({
          row: row.rowNumber,
          field: fieldErrors.join(', '),
          message: `Campos requeridos faltantes: ${fieldErrors.join(', ')}`,
        })
        continue
      }

      let existingId: string | null = null

      if (email) {
        const byEmail = await prisma.lead.findFirst({ where: { tenantId, email } })
        if (byEmail) existingId = byEmail.id
      }

      if (!existingId && nif) {
        const byNif = await prisma.customerFiscalData.findFirst({
          where: { tenantId, rfc: nif },
          select: { leadId: true },
        })
        if (byNif?.leadId) existingId = byNif.leadId
      }

      if (existingId) {
        await prisma.lead.update({
          where: { id: existingId },
          data: {
            nombre: nombre!,
            email: email || undefined,
            telefono: telefono || undefined,
            empresa: empresa || undefined,
            ubicacion: [direccion, ciudad, pais].filter(Boolean).join(', ') || undefined,
          },
        })
        if (nif) {
          await prisma.customerFiscalData.upsert({
            where: { leadId: existingId },
            update: { rfc: nif },
            create: { tenantId, leadId: existingId, rfc: nif },
          })
        }
      } else {
        const lead = await prisma.lead.create({
          data: {
            tenantId: tenantId!,
            nombre: nombre!,
            email: email || '',
            telefono: telefono || undefined,
            empresa: empresa || undefined,
            ubicacion: [direccion, ciudad, pais].filter(Boolean).join(', ') || undefined,
            asignadoA: userId,
          },
        })
        if (nif) {
          await prisma.customerFiscalData.create({
            data: {
              tenantId: tenantId!,
              leadId: lead.id,
              rfc: nif,
            },
          })
        }
      }

      imported.push(existingId || 'new')
    } catch (err) {
      errors.push({
        row: row.rowNumber,
        field: 'general',
        message: err instanceof Error ? err.message : 'Error desconocido',
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
