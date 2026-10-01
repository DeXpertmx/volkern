import type { HubConfig, NavigationItem } from './navigation-config'

/**
 * Volkern ERP — Reglas de visibilidad del menú (sidebar y cockpits).
 *
 * Caso real (29 sep 2026): en el panel de admin se apagó el Feature «Agencia»
 * al tenant demo y, al entrar con «Inyectar Sesión», el menú seguía mostrando
 * todo lo de agencia —el hub completo y las entradas de agencia dentro de
 * Configuración—. Dos causas:
 *
 *   1. La sesión del Superadmin conserva SU rol y SU `accountType` (su tenant
 *      de plataforma es AGENCY), así que los filtros de tipo de cuenta daban
 *      por buenos los items de agencia aunque el tenant suplantado fuera
 *      BUSINESS. Bastaba `roleName === 'Superadmin'` para abrir todas las
 *      puertas.
 *   2. Al suplantar, el menú debe reflejar al tenant suplantado: los escapes
 *      de Superadmin no cuentan mientras hay suplantación activa, y el tipo de
 *      cuenta que manda es el del tenant activo (el suplantado), no el del que
 *      entra.
 *
 * Estas reglas viven aquí para poder probarlas sin montar el componente
 * (`tests/navigation-visibility.test.ts`) y para que el sidebar y cualquier
 * otro consumidor de `HUBS` apliquen exactamente el mismo criterio.
 */
export interface VisibilityContext {
  /** Tipo de cuenta del tenant ACTIVO (el suplantado, si hay suplantación). */
  accountType?: string | null
  /** Nombre del rol de la sesión. */
  roleName?: string | null
  /** Módulos activos del tenant activo (`/api/tenant/modules`). */
  activeModules: string[]
  /** `true` mientras los módulos aún no han llegado desde la API. */
  isLoadingModules: boolean
  /** `true` si un Superadmin está suplantando a otro tenant. */
  isImpersonating?: boolean
  /** País del tenant (`MX` / `ES`), para los items con `requiredRegion`. */
  country: string
  /** Plan del tenant activo (`/api/tenant/modules`), para la vertical contable. */
  plan?: string | null
  /** Permisos del rol (`role.permisos` de `/api/users/me`). */
  permissions?: Record<string, any> | null
}

/**
 * Planes que marcan la vertical de una cuenta AGENCY (ver `lib/plans.ts`).
 *
 * `pro-agency` es una agencia de marketing; `pro-accounting` y `accounting-slot`
 * son la vertical contable (el despacho y los slots de sus clientes). Un plan
 * que no es de ninguna vertical (el `enterprise` de la plataforma, planes
 * legacy) no excluye nada: la cuenta de plataforma enseña los dos hubs.
 */
const PLANES_VERTICAL_AGENCIA = new Set(['pro-agency'])
const PLANES_VERTICAL_CONTABLE = new Set(['pro-accounting', 'accounting-slot'])

/**
 * ¿Es una agencia de marketing? Cuenta AGENCY que no pertenece a la vertical
 * contable. El rol no cuenta: lo decide el tipo de cuenta del tenant ACTIVO.
 */
export function esAgencia(ctx: VisibilityContext): boolean {
  if (ctx.accountType !== 'AGENCY') return false
  return !(ctx.plan && PLANES_VERTICAL_CONTABLE.has(ctx.plan))
}

/** ¿Es un despacho de asesoría contable? Cuenta AGENCY de la vertical contable. */
export function esDespachoContable(ctx: VisibilityContext): boolean {
  if (ctx.accountType !== 'AGENCY') return false
  return !(ctx.plan && PLANES_VERTICAL_AGENCIA.has(ctx.plan))
}

/**
 * ¿Cuenta esta sesión como Superadmin a efectos de navegación?
 *
 * Con suplantación activa NO: el Superadmin ve el menú del tenant suplantado,
 * que es justo lo que se está demostrando. Sin suplantación, sí, para no
 * dejar al propietario de la plataforma sin su control plane.
 */
export function esSuperadminEfectivo(ctx: VisibilityContext): boolean {
  return !ctx.isImpersonating && ctx.roleName === 'Superadmin'
}

/** ¿Se muestra este item del menú lateral? */
export function itemEsVisible(item: NavigationItem, ctx: VisibilityContext): boolean {
  // 1. Filtro por región (país del tenant, obtenido de la API)
  if (item.requiredRegion && item.requiredRegion !== ctx.country) return false

  // 2. Filtro por tipo de cuenta (AGENCY / BUSINESS / SUPERADMIN)
  if (item.requiredAccountType) {
    const superadmin = esSuperadminEfectivo(ctx)
    if (item.requiredAccountType === 'SUPERADMIN') {
      // El control plane es de Superadmin; un rol llamado «Admin» no es el
      // propietario de la plataforma.
      if (ctx.roleName !== 'Superadmin') return false
    } else if (item.requiredAccountType === 'AGENCY' || item.requiredAccountType === 'ACCOUNTING') {
      // Los items de agencia/contabilidad solo se ven en la vertical que toca
      // (agencia de marketing o despacho contable): no porque el usuario sea
      // Admin o Superadmin. Mientras carga y aún no hay tipo de cuenta no se
      // esconde nada, igual que los hubs.
      if (ctx.isLoadingModules && !ctx.accountType) return true
      const esVertical = item.requiredAccountType === 'AGENCY' ? esAgencia(ctx) : esDespachoContable(ctx)
      if (!esVertical) return false
    } else if (ctx.accountType !== item.requiredAccountType) {
      if (!superadmin && ctx.roleName !== 'Admin') return false
    }
  }

  // 3. Filtro por plan / módulos activos del tenant.
  // Mientras cargan se muestra para no parpadear; después, si el módulo no
  // está activo, el item desaparece.
  if (item.planModule && !ctx.isLoadingModules && !ctx.activeModules.includes(item.planModule)) {
    return false
  }

  // 4. Filtro por permisos de rol
  if (item.module && ctx.permissions) {
    const modulePerms = ctx.permissions[item.module]
    if (modulePerms && modulePerms.ver === false) return false
  }

  return true
}

/** ¿Se muestra este hub en el menú global de módulos? */
export function hubEsVisible(hub: HubConfig, ctx: VisibilityContext): boolean {
  const superadmin = esSuperadminEfectivo(ctx)
  const tieneModulo = (moduleId?: string) =>
    !moduleId || ctx.isLoadingModules || ctx.activeModules.includes(moduleId)

  // Los hubs sin tipo de cuenta requerido son abiertos (con o sin módulo).
  if (!hub.requiredAccountType) return true

  if (hub.requiredAccountType === 'SUPERADMIN') {
    // El backend solo deja pasar Superadmin al control plane: el menú no anuncia
    // un enlace que va a terminar en 403.
    return ctx.roleName === 'Superadmin'
  }

  // Mientras carga, permitir ver hubs si aún no hay accountType.
  if (ctx.isLoadingModules && !ctx.accountType) return true

  if (hub.requiredAccountType === 'AGENCY') {
    // Hace falta ser agencia de marketing Y tener el módulo de agencia activo:
    // apagar el Feature «Agencia» en admin quita también el hub. El rol NO es
    // un escape: un usuario Superadmin dentro de un tenant BUSINESS no lo ve
    // (caso real 30 sep 2026, tenant de JUAN ANTONIO MORENO FERNANDEZ).
    return esAgencia(ctx) && ctx.activeModules.includes('agency')
  }

  if (hub.requiredAccountType === 'ACCOUNTING') {
    // El hub de Contabilidad es de la vertical contable: despachos (plan
    // pro-accounting). Una agencia de marketing no lo ve.
    return esDespachoContable(ctx) && ctx.activeModules.includes('agency')
  }

  if (hub.requiredAccountType === 'BUSINESS') {
    // Lo que decide es el tipo de cuenta, no el nombre del rol: un BUSINESS la
    // ve, un rol que se llame «Admin» en otro tipo de cuenta no tiene por qué.
    const isBusiness = ctx.accountType === 'BUSINESS' || ctx.accountType === 'AGENCY' || superadmin
    if (!isBusiness) return false
    return tieneModulo(hub.requiredModule)
  }

  return tieneModulo(hub.requiredModule)
}
