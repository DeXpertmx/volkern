/**
 * Pipeline único de importación: parsear → analizar → (opcional) escribir.
 *
 * Existe para que las tres rutas (`clients`, `catalog`, `accounting`) no
 * repitan la misma secuencia y para que el modo `preview` sea **imposible de
 * saltarse por accidente**: la escritura vive en una rama distinta, después del
 * informe, y solo `commit` la ejecuta.
 *
 * En `preview` se guarda un `ImportLog` con `mode: 'preview'`: queda rastro de
 * quién miró qué sin ensuciar el historial de importaciones reales.
 */

import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { monedaEscritura } from '@/lib/moneda'
import { parseFile } from './column-mapper'
import {
  analizarImportacion,
  construirCsvCuarentena,
  muestrasDeInforme,
  normalizarNif,
  normalizarNombre,
  type ExistentesImportacion,
  type InformeCalidad,
} from './calidad'
import { ejecutarImportacion } from './ejecutar'
import type { ColumnMap, ImportSource, ImportType } from './import-types'

export type ModoImportacion = 'preview' | 'commit'

export interface EntradaProceso {
  tenantId: string
  userId: string
  tipo: ImportType
  source: ImportSource
  buffer: Buffer
  mimeType: string
  mapping: ColumnMap[]
  mode: ModoImportacion
  incluirPosiblesDuplicados?: boolean
  fiscalYear?: number
  fileName?: string
  /** Batch de la previsualización que se confirma; si falta, se abre uno nuevo. */
  batchId?: string
}

export interface InformeResumen {
  tipo: ImportType
  total: number
  nuevas: number
  actualizadas: number
  rechazadas: number
  posiblesDuplicados: number
  omitidas: number
  aEscribir: number
  avisosGenerales: string[]
  muestras: ReturnType<typeof muestrasDeInforme>
}

export interface RespuestaProceso {
  mode: ModoImportacion
  informe: InformeResumen
  logId: string
  batchId?: string
  /** CSV de rechazadas para corregir fuera y volver a subir. */
  cuarentenaCsv: string
  puedeDeshacerse: boolean
  /** Registros efectivamente escritos (0 en previsualización). */
  escritos: number
  erroresEjecucion: { fila: number; mensaje: string }[]
}

export async function cargarExistentes(
  tipo: ImportType,
  tenantId: string,
): Promise<ExistentesImportacion> {
  if (tipo === 'clients') {
    const leads = await prisma.lead.findMany({
      where: { tenantId },
      select: { id: true, nombre: true, email: true },
    })
    const porEmail = new Map<string, { id: string; nombre: string }>()
    const porId = new Map<string, { id: string; nombre: string }>()
    for (const lead of leads) {
      const resumen = { id: lead.id, nombre: lead.nombre }
      porId.set(lead.id, resumen)
      if (lead.email?.trim()) porEmail.set(lead.email.trim().toLowerCase(), resumen)
    }

    const fiscales = await prisma.customerFiscalData.findMany({
      where: { tenantId, leadId: { not: null }, rfc: { not: null } },
      select: { leadId: true, rfc: true },
    })
    const porNif = new Map<string, { id: string; nombre: string }>()
    for (const fiscal of fiscales) {
      const lead = fiscal.leadId ? porId.get(fiscal.leadId) : undefined
      if (lead && fiscal.rfc) porNif.set(normalizarNif(fiscal.rfc), lead)
    }

    return { porEmail, porNif }
  }

  if (tipo === 'catalog') {
    const servicios = await prisma.servicio.findMany({
      where: { tenantId },
      select: { id: true, nombre: true },
    })
    const porNombre = new Map<string, { id: string; nombre: string }>()
    for (const servicio of servicios) {
      porNombre.set(normalizarNombre(servicio.nombre), { id: servicio.id, nombre: servicio.nombre })
    }
    return { porNombre }
  }

  const cuentas = await prisma.accountingAccount.findMany({
    where: { tenantId },
    select: { code: true },
  })
  return { cuentas: new Set(cuentas.map((c) => c.code)) }
}

async function resumenDB(informe: InformeCalidad): Promise<InformeResumen> {
  return {
    tipo: informe.tipo,
    total: informe.total,
    nuevas: informe.nuevas,
    actualizadas: informe.actualizadas,
    rechazadas: informe.rechazadas,
    posiblesDuplicados: informe.posiblesDuplicados,
    omitidas: informe.omitidas,
    aEscribir: informe.aEscribir,
    avisosGenerales: informe.avisosGenerales,
    muestras: muestrasDeInforme(informe),
  }
}

export async function procesarImportacion(entrada: EntradaProceso): Promise<RespuestaProceso> {
  const { tenantId, userId, tipo, source, buffer, mimeType, mapping, mode } = entrada
  const incluirPosiblesDuplicados = Boolean(entrada.incluirPosiblesDuplicados)

  const { rows } = await parseFile(buffer, mimeType)
  const existentes = await cargarExistentes(tipo, tenantId)

  const informe = analizarImportacion({
    tipo,
    filas: rows.map((r, i) => ({ rowNumber: i + 1, data: r })),
    mapping,
    existentes,
    incluirPosiblesDuplicados,
  })

  const cuarentenaCsv = construirCsvCuarentena(informe)
  // Confirmar una previsualización no abre lote nuevo: el `batchId` viaja en el
  // formulario para que el informe revisado y lo escrito sean el mismo lote.
  const batchId = entrada.batchId?.trim() || crypto.randomUUID()

  if (mode === 'preview') {
    const log = await prisma.importLog.create({
      data: {
        tenantId,
        type: tipo,
        source,
        fileName: entrada.fileName || 'upload',
        fileSize: buffer.length,
        recordsTotal: informe.total,
        recordsImported: 0,
        recordsFailed: informe.rechazadas,
        errors: informe.filas
          .filter((f) => f.accion === 'rechazada')
          .slice(0, 200)
          .map((f) => ({ row: f.fila, field: f.codigo ?? 'general', message: f.motivo ?? '' })),
        columnMapping: mapping.length > 0 ? (mapping as unknown as Prisma.InputJsonValue) : undefined,
        status: 'preview',
        mode: 'preview',
        batchId,
        createdBy: userId,
        report: (await resumenDB(informe)) as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    })

    return {
      mode,
      informe: await resumenDB(informe),
      logId: log.id,
      batchId,
      cuarentenaCsv,
      puedeDeshacerse: false,
      escritos: 0,
      erroresEjecucion: [],
    }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { moneda: true },
  })

  const ejecucion = await ejecutarImportacion({
    tenantId,
    userId,
    informe,
    mapping,
    incluirPosiblesDuplicados,
    // El servicio importado hereda la divisa del tenant; si la cuenta no declara
    // ninguna, entra la mínima del esquema en vez de un euro que nadie eligió.
    monedaTenant: monedaEscritura(tenant?.moneda),
    fiscalYear: entrada.fiscalYear,
  })

  const escritos = ejecucion.creados.length + ejecucion.actualizados.length
  const status = escritos === 0 ? 'failed' : ejecucion.errores.length === 0 ? 'completed' : 'partial'

  const log = await prisma.importLog.create({
    data: {
      tenantId,
      type: tipo,
      source,
      fileName: entrada.fileName || 'upload',
      fileSize: buffer.length,
      recordsTotal: informe.total,
      recordsImported: escritos,
      recordsFailed: informe.rechazadas + ejecucion.errores.length,
      errors: [
        ...informe.filas
          .filter((f) => f.accion === 'rechazada')
          .slice(0, 200)
          .map((f) => ({ row: f.fila, field: f.codigo ?? 'general', message: f.motivo ?? '' })),
        ...ejecucion.errores,
      ],
      columnMapping: mapping.length > 0 ? (mapping as unknown as Prisma.InputJsonValue) : undefined,
      status,
      mode: 'commit',
      batchId,
      createdBy: userId,
      report: {
        creados: ejecucion.creados,
        actualizados: ejecucion.actualizados,
        errores: ejecucion.errores,
        informe: await resumenDB(informe),
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  const resumen = await resumenDB(informe)

  return {
    mode,
    informe: resumen,
    logId: log.id,
    batchId,
    cuarentenaCsv,
    puedeDeshacerse: escritos > 0,
    escritos,
    erroresEjecucion: ejecucion.errores,
  }
}
