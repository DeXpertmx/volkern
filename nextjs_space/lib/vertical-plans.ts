/**
 * vertical-plans.ts
 *
 * FUENTE ÚNICA de las 8 verticales comerciales de Volkern: identificador,
 * slug público, nombre, precio mensual publicado y módulos incluidos.
 *
 * POR QUÉ EXISTE
 * El precio de una vertical estaba escrito a mano en cuatro sitios (la portada,
 * /precios, los términos legales y —para otras tarifas— la tabla `PLAN_PRICES`
 * de lib/plans.ts). Esa duplicación acabó en lo que no debía: producción
 * anunciaba 49 € en la portada y en los términos mientras el cobro dependía de
 * una tabla legacy cuyos Stripe Price IDs no existen en el VPS, de modo que
 * pulsar un plan devolvía un 500. Este módulo es la única fuente: lo que se
 * anuncia y lo que se cobra salen de aquí, así que no pueden divergir.
 *
 * MÓDULO PURO A PROPÓSITO
 * No importa prisma ni next, porque lo consumen tanto componentes de cliente
 * (portada, /precios, facturación) como rutas de API (el cobro).
 *
 * `modules` se deriva del mapa de verticales que ya usaba el alta
 * (`PERFIL_SUGGESTED_MODULES`) más los módulos centrales, que es exactamente
 * lo que el registro aplica hoy: no se inventa un reparto de módulos nuevo.
 */

import { CORE_MODULES, PERFIL_SUGGESTED_MODULES, getDefaultModules } from './onboarding-modules'

export interface VerticalPlan {
  /** Identificador interno. Es también el valor de `plan` del tenant al suscribirse. */
  id: string
  /** Slug público: la landing de la vertical vive en /soluciones/<slug>. */
  slug: string
  name: string
  subtitle: string
  /** Precio publicado en € / mes, impuestos no incluidos. */
  price: number
  /** Módulos que habilita la vertical (centrales + los propios de la vertical). */
  modules: string[]
}

/** Definición declarativa; los módulos se completan más abajo. */
const DEFINICIONES = [
  { id: 'crm_ventas',       slug: 'crm-ventas',  name: 'CRM & Ventas',      subtitle: 'Pipeline, leads y cierres',            price: 49 },
  { id: 'agencia_marketing', slug: 'marketing',  name: 'Agencia Marketing', subtitle: 'Campañas, leads y conversión',         price: 49 },
  { id: 'academia',         slug: 'academy',     name: 'Academia',          subtitle: 'Cursos, pagos y alumnos',              price: 49 },
  { id: 'asesoria_contable', slug: 'accounting', name: 'Asesoría Contable', subtitle: 'Clientes, documentos y compliance',    price: 59 },
  { id: 'rrhh',             slug: 'rrhh',        name: 'Recursos Humanos',  subtitle: 'Empleados, procesos y control',        price: 39 },
  { id: 'inmobiliaria',     slug: 'real-estate', name: 'Inmobiliaria',      subtitle: 'Propiedades, leads y cierres',         price: 59 },
  { id: 'industria',        slug: 'industria',   name: 'Industria',         subtitle: 'Procesos, tareas y trazabilidad',      price: 59 },
  { id: 'facturacion',      slug: 'facturacion', name: 'Facturación',       subtitle: 'Facturas, cobros e IVA',               price: 19 },
] as const

/**
 * Módulos que TODO plan debe incluir.
 *
 * `tests/plans.test.ts` fija dos invariantes al respecto, y con razón: su
 * comentario recuerda que la vertical contable se quedó sin `insurance` hasta
 * que algo lo fijó. Todos los planes existentes incluyen `insurance`.
 *
 * Se compone de las dos listas que ya existían —el core del onboarding y los
 * módulos por defecto— más `catalogo`, que el test exige y ninguna de las dos
 * incluía.
 */
const MODULOS_CENTRALES: string[] = Array.from(
  new Set<string>([...CORE_MODULES, 'catalogo', 'insurance', ...getDefaultModules()]),
)

/**
 * Módulos de una vertical: los centrales (invariante) + los propios de la
 * vertical, sin repetir. Es el mismo reparto que ya aplicaba el alta, más el
 * conjunto central que el plan necesita para no quedarse cojo.
 */
function modulosDe(id: string): string[] {
  return Array.from(new Set([...MODULOS_CENTRALES, ...(PERFIL_SUGGESTED_MODULES[id] ?? [])]))
}

export const VERTICAL_PLANS: VerticalPlan[] = DEFINICIONES.map((d) => ({
  ...d,
  modules: modulosDe(d.id),
}))

export const VERTICAL_PLAN_IDS: string[] = VERTICAL_PLANS.map((v) => v.id)

/** Precio publicado de cada vertical, indexado por id. */
export const VERTICAL_PLAN_PRICES: Record<string, number> = Object.fromEntries(
  VERTICAL_PLANS.map((v) => [v.id, v.price]),
)

export function getVerticalPlan(id: string): VerticalPlan | null {
  return VERTICAL_PLANS.find((v) => v.id === id) ?? null
}

export function isVerticalPlan(id: string): boolean {
  return VERTICAL_PLANS.some((v) => v.id === id)
}

/** Precio mensual publicado, o `null` si el id no es una vertical. */
export function getVerticalPlanPrice(id: string): number | null {
  return getVerticalPlan(id)?.price ?? null
}
