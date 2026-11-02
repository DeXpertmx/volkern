/**
 * Escritura de la cuarta pieza de personalización: marca y canales.
 *
 * Dos decisiones que se ven en el código:
 *
 * 1. **El alta no deja datos muertos.** Un canal no se guarda en una fila que
 *    nadie lee: se convierte en la **tarea** que hay que hacer para que ese canal
 *    deje leads (`Task`, la misma tabla que ve el equipo en su panel). Se puede
 *    comprobar, se puede cerrar y se puede deshacer.
 * 2. **Lo que se escribe es lo que se lee.** El nombre va a
 *    `Configuracion.business_name` y el color a `Tenant.brandingConfig.primaryColor`,
 *    que es de donde `getEffectiveBranding()` saca la marca de propuestas,
 *    facturas y páginas públicas. Escribirlo en otro sitio sería configurar algo
 *    que no se pinta.
 *
 * SERVER-ONLY: usa Prisma.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { clearBrandingCache } from '@/lib/branding'
import type { CanalCaptacionId, CanalPropuesto, SeleccionMarcaCanales } from './marca-canales'

/** Días que se le dan al equipo para montar un canal, como el resto del alta. */
const DIAS_PARA_MONTAR = 7

export interface TareaCanal {
  canal: string
  id: string
}

export interface ResultadoAplicarMarca {
  nombre: { anterior: string | null; actual: string; cambiado: boolean }
  color: { anterior: string | null; actual: string; cambiado: boolean }
  canales: { canal: CanalCaptacionId; id: string; estado: 'creada' | 'existente' }[]
  /** Tareas del alta que se han borrado por desmarcar el canal. */
  borradas: TareaCanal[]
  /** Tareas que se quedan porque ya están hechas: borrarlas sería reescribir el pasado. */
  conservadas: TareaCanal[]
  /** Estado previo, para poder deshacer. */
  anteriores: { nombre: string | null; color: string | null }
}

export type ResultadoAplicarMarcaCanales =
  | { ok: true; resultado: ResultadoAplicarMarca }
  | { ok: false; mensaje: string }

interface BrandingCrudo {
  [clave: string]: unknown
}

function leerBranding(valor: unknown): BrandingCrudo {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  return { ...(valor as BrandingCrudo) }
}

/**
 * Aplica marca y canales.
 *
 * `tareasPrevias` son las tareas que creó una pasada anterior del alta: se usan
 * para no duplicarlas y para borrar las del canal que el cliente ha desmarcado.
 */
export async function aplicarMarcaCanales(
  tenantId: string,
  usuarioId: string,
  seleccion: SeleccionMarcaCanales,
  canales: CanalPropuesto[],
  tareasPrevias: TareaCanal[],
): Promise<ResultadoAplicarMarcaCanales> {
  const elegido = new Set(seleccion.canales)

  // 1. Marca: nombre comercial + color.
  const [tenant, configNombre] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true, brandingConfig: true },
    }),
    prisma.configuracion.findUnique({
      where: { tenantId_clave: { tenantId, clave: 'business_name' } },
      select: { valor: true },
    }),
  ])

  if (!tenant) return { ok: false, mensaje: 'La cuenta no existe' }

  const branding = leerBranding(tenant.brandingConfig)
  const nombreAnterior = typeof configNombre?.valor === 'string' && configNombre.valor.trim()
    ? configNombre.valor.trim()
    : null
  const colorAnterior =
    typeof branding.primaryColor === 'string' && branding.primaryColor.trim()
      ? branding.primaryColor.trim().toLowerCase()
      : null

  const nombreCambiado = nombreAnterior !== seleccion.nombre
  if (nombreCambiado) {
    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: 'business_name' } },
      update: { valor: seleccion.nombre },
      create: { tenantId, clave: 'business_name', valor: seleccion.nombre },
    })
    // La marca efectiva está cacheada 5 minutos y también incluye el nombre:
    // sin invalidar, el cliente aplicaría y seguiría viendo el nombre viejo.
    clearBrandingCache()
  }

  const colorCambiado = colorAnterior !== seleccion.color
  if (colorCambiado) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        brandingConfig: {
          ...branding,
          primaryColor: seleccion.color,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    // La marca efectiva está cacheada 5 minutos: sin esto, los documentos
    // seguirían saliendo con el color viejo justo cuando el cliente mira el
    // resultado de pulsar aplicar.
    clearBrandingCache()
  }

  // 2. Canales: una tarea por canal, sin duplicar las que ya existen.
  const porCanal = new Map(canales.map((canal) => [canal.id, canal]))
  const previas = new Map(tareasPrevias.map((tarea) => [tarea.canal, tarea.id]))
  const aplicadas: ResultadoAplicarMarca['canales'] = []
  const vencimiento = new Date(Date.now() + DIAS_PARA_MONTAR * 24 * 60 * 60 * 1000)

  for (const id of seleccion.canales) {
    const canal = porCanal.get(id)
    if (!canal) continue

    const previa = previas.get(id)
    if (previa) {
      const sigue = await prisma.task.count({ where: { id: previa, tenantId } })
      if (sigue > 0) {
        aplicadas.push({ canal: id, id: previa, estado: 'existente' })
        continue
      }
    }

    const creada = await prisma.task.create({
      data: {
        tenantId,
        asignadoA: usuarioId,
        tipo: 'seguimiento',
        titulo: `Poner en marcha: ${canal.nombre}`,
        descripcion: canal.requiere ? `${canal.primerPaso} Necesita: ${canal.requiere}.` : canal.primerPaso,
        fechaVencimiento: vencimiento,
      },
      select: { id: true },
    })
    aplicadas.push({ canal: id, id: creada.id, estado: 'creada' })
  }

  // 3. Canales desmarcados: se retira la tarea si nadie la ha hecho. Una tarea
  //    completada es historia del equipo, no configuración del alta.
  const borradas: TareaCanal[] = []
  const conservadas: TareaCanal[] = []

  for (const [canal, id] of previas) {
    if (elegido.has(canal as CanalCaptacionId)) continue

    const tarea = await prisma.task.findFirst({
      where: { id, tenantId },
      select: { id: true, completada: true },
    })

    if (!tarea) continue
    if (tarea.completada) {
      conservadas.push({ canal, id })
      continue
    }

    await prisma.task.delete({ where: { id: tarea.id } })
    borradas.push({ canal, id })
  }

  return {
    ok: true,
    resultado: {
      nombre: { anterior: nombreAnterior, actual: seleccion.nombre, cambiado: nombreCambiado },
      color: { anterior: colorAnterior, actual: seleccion.color, cambiado: colorCambiado },
      canales: aplicadas,
      borradas,
      conservadas,
      anteriores: { nombre: nombreAnterior, color: colorAnterior },
    },
  }
}

// ─── Deshacer ────────────────────────────────────────────────────────────────

export interface ResultadoDeshacerMarca {
  nombreRestaurado: string | null
  colorRestaurado: string | null
  borradas: TareaCanal[]
  conservadas: TareaCanal[]
  ausentes: TareaCanal[]
}

/**
 * Deshacer deja la marca como estaba (o sin nombre comercial, si antes no lo
 * había) y borra las tareas del alta que nadie ha hecho. Las completadas se
 * quedan: son trabajo real del equipo.
 */
export async function deshacerMarcaCanales(
  tenantId: string,
  anteriores: { nombre: string | null; color: string | null },
  tareas: TareaCanal[],
): Promise<ResultadoDeshacerMarca> {
  // 1. Nombre comercial.
  if (anteriores.nombre) {
    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: 'business_name' } },
      update: { valor: anteriores.nombre },
      create: { tenantId, clave: 'business_name', valor: anteriores.nombre },
    })
  } else {
    // No había nombre comercial antes del alta: se retira la fila en vez de
    // dejar una cadena vacía que finge una configuración.
    await prisma.configuracion.deleteMany({ where: { tenantId, clave: 'business_name' } })
  }
  // El nombre también forma parte de la marca cacheada.
  clearBrandingCache()

  // 2. Color de marca.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { brandingConfig: true },
  })
  if (tenant) {
    const branding = leerBranding(tenant.brandingConfig)
    const colorActual =
      typeof branding.primaryColor === 'string' ? branding.primaryColor.toLowerCase() : null

    if (colorActual !== (anteriores.color ?? null)) {
      if (anteriores.color) branding.primaryColor = anteriores.color
      else delete branding.primaryColor

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { brandingConfig: branding as unknown as Prisma.InputJsonValue },
      })
      clearBrandingCache()
    }
  }

  // 3. Tareas del alta.
  const borradas: TareaCanal[] = []
  const conservadas: TareaCanal[] = []
  const ausentes: TareaCanal[] = []

  for (const tarea of tareas) {
    const fila = await prisma.task.findFirst({
      where: { id: tarea.id, tenantId },
      select: { id: true, completada: true },
    })

    if (!fila) {
      ausentes.push(tarea)
      continue
    }
    if (fila.completada) {
      conservadas.push(tarea)
      continue
    }

    await prisma.task.delete({ where: { id: fila.id } })
    borradas.push(tarea)
  }

  return {
    nombreRestaurado: anteriores.nombre,
    colorRestaurado: anteriores.color,
    borradas,
    conservadas,
    ausentes,
  }
}
