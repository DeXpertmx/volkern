/**
 * Escritura de la segunda pieza de personalización: crear los roles del equipo.
 *
 * La regla que gobierna todo el fichero es la misma que en Hospitality: aplicar
 * **nunca retira**. Si un rol con ese nombre ya existe —lo creó el cliente, o lo
 * ajustó a su manera— se le añade lo que le falte del diseño y se le respeta lo
 * que tenga de más. Quitar permisos es otra cosa, y se hace desde Equipo, donde
 * se ve a quién afecta.
 *
 * Deshacer sí borra, pero solo lo que creó este alta y solo si nadie lo usa:
 * un rol con personas asignadas se queda, porque borrarlo dejaría a esas
 * personas sin acceso de un plumazo.
 *
 * SERVER-ONLY: usa Prisma.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
// La regla de componer permisos sin retirar ninguno ya vive aquí y es genérica
// (permisos → permisos); se comparte en vez de escribir una segunda versión que
// pueda divergir de la que usa Hospitality.
import { capacidadesFaltantes, conLoQueFalta } from '@/lib/hospitality/roles-apply'
import {
  ROL_EQUIPO_POR_ID,
  permisosDeRol,
  type RolEquipoId,
  type SeleccionRol,
} from './roles'

export interface ResultadoRolEquipo {
  id: RolEquipoId
  nombre: string
  /** `creado` = no existía; `completado` = existía y le faltaba algo. */
  estado: 'creado' | 'completado' | 'sin_cambios'
  roleId: string
  /** Permisos que se han añadido ahora, como `modulo.accion`. */
  anadidos: string[]
  /** Personas que ya usan el rol (0 si acaba de nacer). */
  usuarios: number
}

export type ResultadoAplicarRoles =
  | { ok: true; resultados: ResultadoRolEquipo[] }
  | { ok: false; mensaje: string }

function nombreDe(id: RolEquipoId): string {
  return ROL_EQUIPO_POR_ID[id]?.nombre ?? id
}

export async function aplicarRoles(
  tenantId: string,
  seleccion: SeleccionRol[],
): Promise<ResultadoAplicarRoles> {
  if (seleccion.length === 0) {
    return { ok: false, mensaje: 'No hay ningún rol que crear.' }
  }

  const nombres = seleccion.map((s) => nombreDe(s.id))
  const existentes = await prisma.role.findMany({
    where: { tenantId, nombre: { in: nombres } },
    select: {
      id: true,
      nombre: true,
      permisos: true,
      _count: { select: { users: true } },
    },
  })
  const porNombre = new Map(existentes.map((rol) => [rol.nombre, rol]))

  // Un solo cálculo del orden para todos los que se creen en esta pasada.
  const ultimo = await prisma.role.findFirst({
    where: { tenantId },
    orderBy: { orden: 'desc' },
    select: { orden: true },
  })
  let orden = ultimo?.orden ?? 0

  const resultados: ResultadoRolEquipo[] = []

  for (const elegido of seleccion) {
    const nombre = nombreDe(elegido.id)
    const esperado = permisosDeRol(elegido.id, elegido.veTodo)
    const existente = porNombre.get(nombre)

    if (existente) {
      // Prisma devuelve `JsonValue`; el rol guarda siempre un objeto de permisos.
      const actuales = existente.permisos as Record<string, unknown> | null
      const faltan = capacidadesFaltantes(actuales, esperado)

      if (faltan.length === 0) {
        resultados.push({
          id: elegido.id,
          nombre,
          estado: 'sin_cambios',
          roleId: existente.id,
          anadidos: [],
          usuarios: existente._count.users,
        })
        continue
      }

      await prisma.role.update({
        where: { id: existente.id },
        data: {
          // `conLoQueFalta` compone: añade lo que falta y no toca lo que hay.
          permisos: conLoQueFalta(actuales, esperado) as Prisma.InputJsonValue,
        },
      })

      resultados.push({
        id: elegido.id,
        nombre,
        estado: 'completado',
        roleId: existente.id,
        anadidos: faltan,
        usuarios: existente._count.users,
      })
      continue
    }

    orden += 1
    const creado = await prisma.role.create({
      data: {
        tenantId,
        nombre,
        descripcion: ROL_EQUIPO_POR_ID[elegido.id].descripcion,
        permisos: esperado as Prisma.InputJsonValue,
        orden,
      },
      select: { id: true },
    })

    resultados.push({
      id: elegido.id,
      nombre,
      estado: 'creado',
      roleId: creado.id,
      anadidos: capacidadesFaltantes({}, esperado),
      usuarios: 0,
    })
  }

  return { ok: true, resultados }
}

export interface RolConservado {
  roleId: string
  nombre: string
  usuarios: number
}

export interface ResultadoDeshacerRoles {
  /** Roles del alta que se han borrado. */
  borrados: string[]
  /** Roles del alta que se quedan porque alguien los usa. */
  conservados: RolConservado[]
  /** Ya no existían (se borraron a mano): nada que hacer. */
  ausentes: string[]
}

/**
 * Deshacer borra solo los roles que creó el alta y que nadie usa. Los que
 * tienen personas asignadas se quedan: quitarlos dejaría a esas personas sin
 * entrar a la plataforma, y eso no es un «deshacer», es un incidente.
 */
export async function deshacerRoles(
  tenantId: string,
  creados: { id: RolEquipoId; roleId: string }[],
): Promise<ResultadoDeshacerRoles> {
  const borrados: string[] = []
  const conservados: RolConservado[] = []
  const ausentes: string[] = []

  for (const creado of creados) {
    const rol = await prisma.role.findFirst({
      where: { id: creado.roleId, tenantId },
      select: { id: true, nombre: true, _count: { select: { users: true } } },
    })

    if (!rol) {
      ausentes.push(creado.roleId)
      continue
    }

    if (rol._count.users > 0) {
      conservados.push({ roleId: rol.id, nombre: rol.nombre, usuarios: rol._count.users })
      continue
    }

    await prisma.role.delete({ where: { id: rol.id } })
    borrados.push(rol.id)
  }

  return { borrados, conservados, ausentes }
}
