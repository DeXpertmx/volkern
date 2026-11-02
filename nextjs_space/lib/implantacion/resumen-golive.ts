/**
 * Cierre del paso de personalización: las cuatro piezas juntas y en qué estado
 * está cada una antes de cargar datos.
 *
 * Puro: sin Prisma, sin red. Se alimenta del checklist que ya calcula
 * `estado.ts` con hechos comprobados en la cuenta (el embudo existe, los roles
 * existen, hay impuesto y emisor, la marca está escrita y cada canal tiene su
 * tarea). Por eso el resumen no puede decir «aplicado» sobre algo que solo se
 * propuso: si una pieza se borra a mano, la tarjeta vuelve a abrirla.
 */

import {
  PASOS,
  indiceEstado,
  resumenChecklist,
  type EstadoImplantacion,
  type TareaChecklist,
} from './estado'

/** Las cuatro piezas que se aprueban en el paso de personalización. */
export const PIEZAS_PERSONALIZACION = ['embudo', 'roles', 'fiscal', 'marca_canales'] as const

export type PiezaPersonalizacion = (typeof PIEZAS_PERSONALIZACION)[number]

/** El paso al que se entra cuando las cuatro están aplicadas. */
export const ESTADO_DATOS: EstadoImplantacion = 'datos'

export interface PiezaResumen {
  id: PiezaPersonalizacion
  titulo: string
  detalle: string
  aplicada: boolean
}

export interface ResumenGoLive {
  piezas: PiezaResumen[]
  aplicadas: number
  total: number
  /** Las cuatro piezas existen en el checklist y están aplicadas. */
  listo: boolean
  /** Títulos de las que siguen pendientes, en el orden del checklist. */
  pendientes: string[]
  /** Progreso del checklist completo: lo que queda fuera de la personalización. */
  lineas: { completadas: number; total: number }
  texto: string
}

export function resumirGoLive(checklist: TareaChecklist[]): ResumenGoLive {
  const piezas: PiezaResumen[] = []
  for (const id of PIEZAS_PERSONALIZACION) {
    const tarea = checklist.find((t) => t.id === id)
    if (!tarea) continue
    piezas.push({
      id,
      titulo: tarea.titulo,
      detalle: tarea.detalle,
      aplicada: tarea.completada,
    })
  }

  const aplicadas = piezas.filter((pieza) => pieza.aplicada).length
  const pendientes = piezas.filter((pieza) => !pieza.aplicada).map((pieza) => pieza.titulo)
  // Sin las cuatro en el checklist no se da por cerrado: faltaría una pieza por
  // aplicar, no una línea de texto.
  const listo = piezas.length === PIEZAS_PERSONALIZACION.length && pendientes.length === 0

  return {
    piezas,
    aplicadas,
    total: piezas.length,
    listo,
    pendientes,
    lineas: resumenChecklist(checklist),
    texto: listo
      ? 'Las cuatro piezas están en tu cuenta: puedes cargar tus datos.'
      : `Falta${pendientes.length === 1 ? '' : 'n'} ${pendientes.length} de ${PIEZAS_PERSONALIZACION.length}: ${pendientes.join(', ')}.`,
  }
}

/**
 * Estados que hay que recorrer para llegar a «datos». La API prohíbe saltarse
 * pasos, así que el botón avanza de uno en uno en vez de pedir el salto directo
 * (que devolvería 400 si el cliente entró al paso desde la elección).
 */
export function pasosHastaDatos(desde: EstadoImplantacion): EstadoImplantacion[] {
  const pasos: EstadoImplantacion[] = []
  let actual = desde

  while (indiceEstado(actual) < indiceEstado(ESTADO_DATOS) && pasos.length < PASOS.length) {
    actual = PASOS[indiceEstado(actual) + 1]
    pasos.push(actual)
  }

  return pasos
}
