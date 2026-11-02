/**
 * Escritura de la tercera pieza de personalización: impuestos y moneda.
 *
 * Dos cosas que este fichero hace a propósito:
 *
 * 1. **No duplica tasas.** La ruta genérica de Configuración fiscal hace upsert
 *    con `fechaInicioVigencia: now`, y `now` cambia en cada llamada: dos pasadas
 *    del alta habrían dejado dos juegos de IVA con fechas distintas. Aquí se
 *    busca la tasa **activa por código** y se actualiza su porcentaje.
 * 2. **La moneda se cambia una vez y se dice.** Cambiar `Tenant.moneda` afecta a
 *    todo lo que se escriba después; no se hace en silencio y no se deshace
 *    automáticamente (ver `deshacerFiscal`).
 *
 * SERVER-ONLY: usa Prisma.
 */

import { prisma } from '@/lib/db'
import type { PropuestaFiscal, SeleccionFiscal } from './fiscal'

export interface ResultadoTasa {
  codigo: string
  nombre: string
  porcentaje: number
  /** `creada` = no existía; `actualizada` = existía con otro porcentaje. */
  estado: 'creada' | 'actualizada' | 'sin_cambios'
  id: string
}

export interface ResultadoFiscal {
  tasas: ResultadoTasa[]
  moneda: { anterior: string; actual: string; cambiada: boolean }
}

export type ResultadoAplicarFiscal =
  | { ok: true; resultado: ResultadoFiscal }
  | { ok: false; mensaje: string }

export async function aplicarFiscal(
  tenantId: string,
  propuesta: PropuestaFiscal,
  seleccion: SeleccionFiscal,
): Promise<ResultadoAplicarFiscal> {
  if (!propuesta.pais) {
    return { ok: false, mensaje: 'Sin país fiscal no hay impuestos que crear.' }
  }
  if (seleccion.tasas.length === 0) {
    return { ok: false, mensaje: 'No has elegido ningún impuesto que crear.' }
  }

  const ahora = new Date()
  const tasas: ResultadoTasa[] = []

  for (const codigo of seleccion.tasas) {
    const definicion = propuesta.tasas.find((t) => t.codigo === codigo)
    if (!definicion) continue

    const existente = await prisma.tasaImpuesto.findFirst({
      where: { tenantId, codigo, activo: true },
      orderBy: { fechaInicioVigencia: 'desc' },
      select: { id: true, nombre: true, porcentaje: true },
    })

    if (existente) {
      if (Number(existente.porcentaje) === definicion.porcentaje) {
        tasas.push({
          codigo,
          nombre: existente.nombre,
          porcentaje: definicion.porcentaje,
          estado: 'sin_cambios',
          id: existente.id,
        })
        continue
      }

      await prisma.tasaImpuesto.update({
        where: { id: existente.id },
        data: { porcentaje: definicion.porcentaje },
      })

      tasas.push({
        codigo,
        nombre: existente.nombre,
        porcentaje: definicion.porcentaje,
        estado: 'actualizada',
        id: existente.id,
      })
      continue
    }

    const creada = await prisma.tasaImpuesto.create({
      data: {
        tenantId,
        pais: propuesta.pais,
        nombre: definicion.nombre,
        codigo,
        porcentaje: definicion.porcentaje,
        tipo: 'iva',
        descripcionRegla: definicion.motivo,
        activo: true,
        fechaInicioVigencia: ahora,
      },
      select: { id: true, nombre: true },
    })

    tasas.push({
      codigo,
      nombre: creada.nombre,
      porcentaje: definicion.porcentaje,
      estado: 'creada',
      id: creada.id,
    })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { moneda: true },
  })
  const anterior = (tenant?.moneda ?? seleccion.moneda).toUpperCase()
  const cambiada = anterior !== seleccion.moneda

  if (cambiada) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        moneda: seleccion.moneda,
        // La trazabilidad de `Tenant` distingue la moneda elegida de la heredada
        // por defecto: esto es una elección explícita del alta.
        monedaInferida: seleccion.moneda,
        monedaInferenciaSource: 'EXPLICIT',
      },
    })
  }

  return { ok: true, resultado: { tasas, moneda: { anterior, actual: seleccion.moneda, cambiada } } }
}

export interface TasaConservada {
  codigo: string
  nombre: string
  /** Cuántos documentos la usan (catálogo, cotizaciones, órdenes, contratos). */
  usos: number
}

export interface ResultadoDeshacerFiscal {
  borradas: string[]
  conservadas: TasaConservada[]
  ausentes: string[]
}

/**
 * Deshacer borra las tasas que creó el alta **y que nadie usa**. Una tasa metida
 * en una cotización, una orden o un contrato se queda: borrarla dejaría
 * documentos sin impuesto. La moneda no se revierte: los importes escritos
 * después ya están en la nueva.
 */
export async function deshacerFiscal(
  tenantId: string,
  codigos: string[],
): Promise<ResultadoDeshacerFiscal> {
  const borradas: string[] = []
  const conservadas: TasaConservada[] = []
  const ausentes: string[] = []

  for (const codigo of codigos) {
    const fila = await prisma.tasaImpuesto.findFirst({
      where: { tenantId, codigo },
      orderBy: { fechaInicioVigencia: 'desc' },
      select: {
        id: true,
        nombre: true,
        _count: {
          select: { catalogoItems: true, cotizacionItems: true, ordenVentaItems: true, contratoItems: true },
        },
      },
    })

    if (!fila) {
      ausentes.push(codigo)
      continue
    }

    const usos =
      fila._count.catalogoItems +
      fila._count.cotizacionItems +
      fila._count.ordenVentaItems +
      fila._count.contratoItems

    if (usos > 0) {
      conservadas.push({ codigo, nombre: fila.nombre, usos })
      continue
    }

    await prisma.tasaImpuesto.delete({ where: { id: fila.id } })
    borradas.push(codigo)
  }

  return { borradas, conservadas, ausentes }
}
