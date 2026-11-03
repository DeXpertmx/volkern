/**
 * Ejecuta un informe de calidad ya confirmado.
 *
 * La regla que hace posible «deshacer por lote»: **no se escribe nada sin
 * apuntar qué se ha hecho**. Por cada creación se guarda el id; por cada
 * actualización se guarda una instantánea de los campos que se pisan (y del NIF
 * fiscal). Con eso, revertir un lote es borrar lo creado y restaurar lo
 * cambiado, sin adivinar.
 *
 * Las filas rechazadas y omitidas nunca llegan aquí.
 */

import { prisma } from '@/lib/db'
import type { ColumnMap, ImportRow } from './import-types'
import type { InformeCalidad } from './calidad'
import { importOpeningBalances } from './import-accounting'

export interface Creado {
  modelo: 'lead' | 'servicio' | 'accounting_entry'
  id: string
}

export interface Actualizado {
  modelo: 'lead' | 'servicio'
  id: string
  antes: Record<string, string | number | null>
  /** Datos fiscales previos del lead, si se tocaron. */
  fiscalAntes?: { id: string; rfc: string | null } | null
  fiscalCreado?: string | null
}

export interface ResultadoEjecucion {
  creados: Creado[]
  actualizados: Actualizado[]
  errores: { fila: number; mensaje: string }[]
}

export interface OpcionesEjecucion {
  tenantId: string
  userId: string
  informe: InformeCalidad
  mapping: ColumnMap[]
  incluirPosiblesDuplicados: boolean
  monedaTenant: string
  fiscalYear?: number
}

function ubicacionDe(datos: Record<string, string>): string | undefined {
  return (
    [datos.direccion, datos.ciudad, datos.pais].filter(Boolean).join(', ') || undefined
  )
}

function aNumero(valor: string | undefined): number | undefined {
  if (valor === undefined) return undefined
  const n = Number.parseFloat(valor.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export async function ejecutarImportacion(opciones: OpcionesEjecucion): Promise<ResultadoEjecucion> {
  const { informe, incluirPosiblesDuplicados } = opciones

  const aEscribir = informe.filas.filter(
    (f) =>
      f.fila > 0 &&
      (f.accion === 'nueva' ||
        f.accion === 'actualizar' ||
        (incluirPosiblesDuplicados && f.accion === 'posible_duplicado')),
  )

  if (opciones.informe.tipo === 'accounting') {
    return ejecutarContabilidad(opciones, aEscribir)
  }

  const creados: Creado[] = []
  const actualizados: Actualizado[] = []
  const errores: { fila: number; mensaje: string }[] = []

  for (const fila of aEscribir) {
    try {
      if (informe.tipo === 'clients') {
        await escribirCliente(fila, opciones, creados, actualizados)
      } else {
        await escribirServicio(fila, opciones, creados, actualizados)
      }
    } catch (error) {
      errores.push({
        fila: fila.fila,
        mensaje: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }

  return { creados, actualizados, errores }
}

async function escribirCliente(
  fila: InformeCalidad['filas'][number],
  opciones: OpcionesEjecucion,
  creados: Creado[],
  actualizados: Actualizado[],
) {
  const { tenantId, userId } = opciones
  const datos = fila.datos
  const nif = datos.nif

  const campos = {
    nombre: datos.nombre,
    email: datos.email,
    telefono: datos.telefono,
    empresa: datos.empresa,
    ubicacion: ubicacionDe(datos),
  }

  if (fila.accion === 'actualizar' && fila.existenteId) {
    const antes = await prisma.lead.findUnique({
      where: { id: fila.existenteId },
      select: { nombre: true, email: true, telefono: true, empresa: true, ubicacion: true },
    })
    if (!antes) throw new Error('El cliente que se iba a actualizar ya no existe')

    await prisma.lead.update({
      where: { id: fila.existenteId },
      data: {
        nombre: campos.nombre,
        email: campos.email || undefined,
        telefono: campos.telefono || undefined,
        empresa: campos.empresa || undefined,
        ubicacion: campos.ubicacion ||
          [datos.direccion, datos.ciudad, datos.pais].filter(Boolean).join(', ') ||
          undefined,
      },
    })

    const actualizacion: Actualizado = {
      modelo: 'lead',
      id: fila.existenteId,
      antes: { ...antes },
    }

    if (nif) {
      const previo = await prisma.customerFiscalData.findUnique({
        where: { leadId: fila.existenteId },
        select: { id: true, rfc: true },
      })
      await prisma.customerFiscalData.upsert({
        where: { leadId: fila.existenteId },
        update: { rfc: nif },
        create: { tenantId, leadId: fila.existenteId, rfc: nif },
      })
      actualizacion.fiscalAntes = previo ?? null
      actualizacion.fiscalCreado = previo ? null : nif
    }

    actualizados.push(actualizacion)
    return
  }

  const lead = await prisma.lead.create({
    data: {
      tenantId,
      nombre: datos.nombre,
      email: datos.email || '',
      telefono: datos.telefono || undefined,
      empresa: datos.empresa || undefined,
      ubicacion: campos.ubicacion,
      asignadoA: userId,
    },
    select: { id: true },
  })
  creados.push({ modelo: 'lead', id: lead.id })

  if (nif) {
    await prisma.customerFiscalData.create({
      data: { tenantId, leadId: lead.id, rfc: nif },
    })
  }
}

async function escribirServicio(
  fila: InformeCalidad['filas'][number],
  opciones: OpcionesEjecucion,
  creados: Creado[],
  actualizados: Actualizado[],
) {
  const { tenantId, monedaTenant } = opciones
  const datos = fila.datos
  const precio = aNumero(datos.precio)
  const duracion = aNumero(datos.duracion)

  if (fila.accion === 'actualizar' && fila.existenteId) {
    const antes = await prisma.servicio.findUnique({
      where: { id: fila.existenteId },
      select: { descripcion: true, precio: true, duracionMinutos: true },
    })
    if (!antes) throw new Error('El servicio que se iba a actualizar ya no existe')

    await prisma.servicio.update({
      where: { id: fila.existenteId },
      data: {
        descripcion: datos.descripcion || antes.descripcion,
        precio: precio ?? antes.precio,
        duracionMinutos: duracion && duracion > 0 ? Math.round(duracion) : antes.duracionMinutos,
      },
    })
    actualizados.push({ modelo: 'servicio', id: fila.existenteId, antes: { ...antes } })
    return
  }

  const servicio = await prisma.servicio.create({
    data: {
      tenantId,
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      precio: precio ?? 0,
      duracionMinutos: duracion && duracion > 0 ? Math.round(duracion) : 60,
      activo: true,
      moneda: monedaTenant,
    },
    select: { id: true },
  })
  creados.push({ modelo: 'servicio', id: servicio.id })
}

async function ejecutarContabilidad(
  opciones: OpcionesEjecucion,
  filas: InformeCalidad['filas'],
): Promise<ResultadoEjecucion> {
  const rows: ImportRow[] = filas.map((f) => ({ rowNumber: f.fila, data: f.original }))
  const creados: Creado[] = []
  const errores: { fila: number; mensaje: string }[] = []

  if (rows.length === 0) return { creados, actualizados: [], errores }

  const resultado = await importOpeningBalances(
    opciones.tenantId,
    rows,
    opciones.mapping,
    opciones.fiscalYear,
  )

  for (const entryId of resultado.meta?.entryIds ?? []) {
    creados.push({ modelo: 'accounting_entry', id: entryId })
  }
  for (const error of resultado.errors) {
    errores.push({ fila: error.row, mensaje: error.message })
  }

  return { creados, actualizados: [], errores }
}
