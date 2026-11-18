/**
 * Registro de adaptadores de portal.
 *
 * Añadir un portal = añadir su archivo en `adapters/` y registrarlo aquí. El
 * orquestador y las rutas no cambian.
 */

import { kyeroAdapter } from './adapters/kyero'
import type { PortalAdapter, PortalKey } from './types'

export const PORTAL_ADAPTERS: Record<string, PortalAdapter> = {
  [kyeroAdapter.key]: kyeroAdapter,
}

export function getAdapter(portalKey: string): PortalAdapter | null {
  return PORTAL_ADAPTERS[portalKey] || null
}

export function isPortalKey(value: string): value is PortalKey {
  return Object.prototype.hasOwnProperty.call(PORTAL_ADAPTERS, value)
}

/** Portales que el panel puede ofrecer hoy (las fases siguientes se añaden aquí). */
export const PORTALES_DISPONIBLES = Object.values(PORTAL_ADAPTERS).map((adapter) => ({
  key: adapter.key,
  label: adapter.label,
  mode: adapter.mode,
  supportsDelete: adapter.supportsDelete,
}))
