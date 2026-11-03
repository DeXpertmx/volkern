/**
 * Deshacer un lote de importación.
 *
 * Reglas, en orden:
 *   1. Solo el **último** lote. Si después se importó más, deshacer este
 *      borraría datos que ya no le pertenecen.
 *   2. Solo lotes `commit` y solo una vez.
 *   3. Se restauran las actualizaciones antes de borrar las creaciones: si algo
 *      falla, el fallo deja el lote a medio deshacer de la forma menos dañina.
 *
 * Las creaciones se borran; las actualizaciones se restauran desde la
 * instantánea que guardó `ejecutarImportacion`. Lo que no se puede revertir
 * (subcuentas contables creadas por el mapeador PGC) se informa como aviso.
 */

import { prisma } from '@/lib/db'

export type MotivoNoDeshacer =
  | 'no_encontrado'
  | 'ya_deshecho'
  | 'no_es_lote'
  | 'hay_lotes_posteriores'
  | 'sin_trazas'

export type ResultadoDeshacer =
  | { ok: true; borrados: number; restaurados: number; errores: string[]; logId: string }
  | { ok: false; motivo: MotivoNoDeshacer; detalle?: string }

interface TrazaCreado {
  modelo: string
  id: string
}

interface TrazaActualizado {
  modelo: string
  id: string
  antes: Record<string, string | number | null>
  fiscalAntes?: { id: string; rfc: string | null } | null
  fiscalCreado?: string | null
}

interface TrazasLote {
  creados?: TrazaCreado[]
  actualizados?: TrazaActualizado[]
}

const MENSAJES: Record<MotivoNoDeshacer, string> = {
  no_encontrado: 'Ese lote no existe o no es de esta cuenta.',
  ya_deshecho: 'Este lote ya se deshizo.',
  no_es_lote: 'Una previsualización no ha escrito nada: no hay nada que deshacer.',
  hay_lotes_posteriores:
    'Solo se puede deshacer el último lote. Después de este se han importado más datos y borrarlo dejaría el CRM mezclado.',
  sin_trazas: 'El lote no guardó qué escribió, así que no se puede deshacer con seguridad.',
}

export async function deshacerLote(
  tenantId: string,
  logId: string,
  userId?: string,
): Promise<ResultadoDeshacer> {
  const log = await prisma.importLog.findFirst({ where: { id: logId, tenantId } })
  if (!log) return { ok: false, motivo: 'no_encontrado', detalle: MENSAJES.no_encontrado }
  if (log.revertedAt) return { ok: false, motivo: 'ya_deshecho', detalle: MENSAJES.ya_deshecho }
  if (log.mode !== 'commit') return { ok: false, motivo: 'no_es_lote', detalle: MENSAJES.no_es_lote }

  // Un lote ya deshecho no bloquea: sus cambios se revirtieron, así que el
  // estado es el de antes de ese lote y deshacer el anterior sigue siendo seguro.
  const posteriores = await prisma.importLog.count({
    where: { tenantId, mode: 'commit', revertedAt: null, createdAt: { gt: log.createdAt } },
  })
  if (posteriores > 0) {
    return { ok: false, motivo: 'hay_lotes_posteriores', detalle: MENSAJES.hay_lotes_posteriores }
  }

  const trazas = (log.report ?? null) as TrazasLote | null
  const creados = trazas?.creados ?? []
  const actualizados = trazas?.actualizados ?? []
  if (creados.length === 0 && actualizados.length === 0) {
    return { ok: false, motivo: 'sin_trazas', detalle: MENSAJES.sin_trazas }
  }

  const errores: string[] = []
  let restaurados = 0
  let borrados = 0

  for (const cambio of actualizados) {
    try {
      if (cambio.modelo === 'lead') {
        await prisma.lead.update({ where: { id: cambio.id }, data: cambio.antes })
        if (cambio.fiscalCreado) {
          await prisma.customerFiscalData.deleteMany({ where: { leadId: cambio.id, tenantId } })
        } else if (cambio.fiscalAntes) {
          await prisma.customerFiscalData.update({
            where: { id: cambio.fiscalAntes.id },
            data: { rfc: cambio.fiscalAntes.rfc },
          })
        }
      } else if (cambio.modelo === 'servicio') {
        await prisma.servicio.update({ where: { id: cambio.id }, data: cambio.antes })
      }
      restaurados++
    } catch (error) {
      errores.push(
        `No se pudo restaurar ${cambio.modelo} ${cambio.id}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      )
    }
  }

  for (const creado of creados) {
    try {
      if (creado.modelo === 'lead') {
        const r = await prisma.lead.deleteMany({ where: { id: creado.id, tenantId } })
        borrados += r.count
      } else if (creado.modelo === 'servicio') {
        const r = await prisma.servicio.deleteMany({ where: { id: creado.id, tenantId } })
        borrados += r.count
      } else if (creado.modelo === 'accounting_entry') {
        const r = await prisma.accountingEntry.deleteMany({ where: { id: creado.id, tenantId } })
        borrados += r.count
      }
    } catch (error) {
      errores.push(
        `No se pudo borrar ${creado.modelo} ${creado.id}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }. Puede tener documentos asociados.`,
      )
    }
  }

  await prisma.importLog.update({
    where: { id: log.id },
    data: { revertedAt: new Date(), status: 'reverted' },
  })

  if (userId) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: 'importacion_deshacer',
        entidad: 'import_log',
        entidadId: log.id,
        descripcion: `Importación deshecha: ${borrados} registro(s) borrados, ${restaurados} restaurados`,
        metadata: { borrados, restaurados, errores: errores.length },
      },
    })
  }

  return { ok: true, borrados, restaurados, errores, logId: log.id }
}
