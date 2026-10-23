/**
 * crm-entitlements.ts
 *
 * Traduce el plan del tenant a lo que puede usar de CRM. Es la puerta que
 * comparten las rutas: si una función se anuncia en un nivel, aquí se permite;
 * si no, se devuelve 403 con el nivel que la desbloquea.
 *
 * CLIENTES ANTIGUOS
 * Los tenants de `crm_ventas` anteriores a la escalera (49 € planos) no tienen
 * `configuracion.crmTier`. Se les da el nivel Avanzado completo y `legacy:
 * true`: bajar funciones a quien ya las pagaba sería una retroactividad que no
 * hemos acordado. Lo mismo para tenants de otras verticales que tengan el
 * módulo CRM: no se les toca nada.
 *
 * SERVER-ONLY: usa Prisma. Para cálculos puros (precios, límites) está
 * `lib/crm-pricing.ts`.
 */

import { prisma } from '@/lib/db'
import {
  CRM_TIERS,
  getCrmTier,
  isCrmTier,
  type CrmTierId,
  type CrmTierLimits,
} from './crm-pricing'

export type CrmFeature = 'ai' | 'api' | 'contracts' | 'forecast' | 'academy'

export interface CrmEntitlements {
  tier: CrmTierId
  tierName: string
  /** true = tarifa anterior o vertical distinta: no se le limita nada. */
  legacy: boolean
  /** Asientos contratados, si el cobro los conoce. */
  seats: number | null
  limits: CrmTierLimits
}

const AVANZADO = CRM_TIERS.find((t) => t.id === 'avanzado')!

function leerConfig(configuracion: unknown): Record<string, unknown> {
  if (!configuracion || typeof configuracion !== 'object' || Array.isArray(configuracion)) {
    return {}
  }
  return configuracion as Record<string, unknown>
}

/**
 * Regla pura, sin base de datos. Exportada para tests y para el panel de admin.
 *
 * - `crm_ventas`/`crm_esencial`/... con `crmTier` válido → ese nivel.
 * - `crm_ventas` sin `crmTier` → Avanzado legacy (tarifa de 49 € planos).
 * - Cualquier otro plan → Avanzado legacy: el CRM venía incluido de antes y no
 *   se recorta.
 */
export function entitlementsFor(plan: string | null | undefined, configuracion: unknown): CrmEntitlements {
  const config = leerConfig(configuracion)
  const tierConfig = config.crmTier

  if (typeof tierConfig === 'string' && isCrmTier(tierConfig)) {
    const tier = getCrmTier(tierConfig)!
    return {
      tier: tier.id,
      tierName: tier.name,
      legacy: false,
      seats: typeof config.crmSeats === 'number' ? config.crmSeats : null,
      limits: tier.limits,
    }
  }

  return {
    tier: 'avanzado',
    tierName: AVANZADO.name,
    // Un tenant de CRM sin nivel es anterior a la escalera; uno de otra
    // vertical no compró CRM y tampoco se le puede recortar.
    legacy: true,
    seats: null,
    limits: AVANZADO.limits,
  }
}

export async function getCrmEntitlements(tenantId: string): Promise<CrmEntitlements> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, configuracion: true },
  })

  return entitlementsFor(tenant?.plan, tenant?.configuracion)
}

export function crmAllows(entitlements: CrmEntitlements, feature: CrmFeature): boolean {
  return Boolean(entitlements.limits[feature])
}

/** Nivel mínimo que abre una función, para el mensaje de upgrade. */
export function tierRequiredFor(feature: CrmFeature): CrmTierId {
  const tier = CRM_TIERS.find((t) => t.limits[feature])
  return tier?.id ?? 'avanzado'
}

export function upgradeMessage(feature: CrmFeature, actual: CrmEntitlements): string {
  const required = getCrmTier(tierRequiredFor(feature))
  return `Esta función requiere el nivel ${required?.name ?? 'Avanzado'}. Tu plan actual es ${actual.tierName}.`
}
