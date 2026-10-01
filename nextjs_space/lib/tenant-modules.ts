import { getActiveModules, ALL_MODULES } from './plans'

/**
 * Resolución de los módulos activos de un tenant.
 *
 * Esto vivía dentro de `/api/tenant/modules` y era la única fuente del menú.
 * Ahora lo comparten la API, el menú (`components/sidebar.tsx`, vía la API) y la
 * guardia de servidor (`lib/module-guard.ts`): si la guardia y el menú no
 * resolvieran lo mismo, habría pantallas escondidas pero alcanzables —o al
 * revés, un enlace que lleva a una redirección—.
 *
 * Caso real (29 sep 2026): en admin se apagó el Feature «Agencia» al tenant
 * demo y el módulo seguía llegando al cliente. El bypass de demo añadía TODOS
 * los módulos después de aplicar los overrides, así que deshacía el apagado.
 * El orden importa: lo que el admin apaga a mano gana al final, sobre el plan,
 * sobre `enabledModules` y sobre el bypass.
 */

export interface TenantConModulos {
  plan: string
  /** Lista manual del tenant (`enabledModules`); puede venir en cualquier caja. */
  enabledModules?: string[] | null
  subdomain?: string | null
}

export interface FeatureDeTenant {
  feature: string
  habilitado: boolean
}

/** Módulos de perfil y ajustes: nunca se apagan, ni siquiera desde admin. */
export const MODULOS_BASE = ['mi_tarjeta', 'configuracion']

/** Paquete CRM que el mapeo legacy de `crm` garantiza. */
const MODULOS_CRM = [
  'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
  'mensajes', 'citas', 'catalogo',
]

/** Módulos que el tenant demo de una agencia activa por el mapeo legacy. */
const MODULOS_IA_AGENCIA = 'agency'

/**
 * ¿Este tenant recibe todos los módulos por su subdominio?
 *
 * El panel de plataforma (`admin`) y los demos (`demo*`) ven el catálogo
 * completo para poder enseñarlo; los apagados explícitos del admin siguen
 * ganando (ver `resolverModulosTenant`).
 */
export function esTenantSinLimites(tenant: TenantConModulos): boolean {
  const subdominio = tenant.subdomain
  return subdominio === 'admin' || Boolean(subdominio?.startsWith('demo'))
}

/**
 * Módulos activos del tenant, ya unificados y sin duplicados.
 *
 * Orden: plan + overrides (`getActiveModules`) → `enabledModules` del tenant →
 * bypass de admin/demo → mapeos legacy → **apagados explícitos del admin** →
 * módulos base de perfil.
 */
export async function resolverModulosTenant(
  tenant: TenantConModulos,
  tenantFeatures: FeatureDeTenant[]
): Promise<string[]> {
  const modulosDelPlan = await getActiveModules(tenant.plan, tenantFeatures)
  const modulosManuales = (tenant.enabledModules || []).map((m) => m.toLowerCase())
  const unificados = new Set<string>([...modulosDelPlan, ...modulosManuales])

  if (esTenantSinLimites(tenant)) {
    ALL_MODULES.forEach((m) => unificados.add(m.id))
  }

  if (unificados.has('crm')) {
    MODULOS_CRM.forEach((m) => unificados.add(m))
  }
  if (unificados.has('ia_agencia')) {
    unificados.add(MODULOS_IA_AGENCIA)
  }

  // Lo que el admin apagó a mano gana sobre todo lo anterior. Sin este paso, el
  // bypass de demo y el mapeo de `crm` vuelven a encender lo apagado.
  for (const feature of tenantFeatures) {
    if (!feature.habilitado) unificados.delete(feature.feature)
  }

  // El perfil y los ajustes de la cuenta no se pueden quedar sin puerta.
  MODULOS_BASE.forEach((m) => unificados.add(m))

  return Array.from(unificados)
}
