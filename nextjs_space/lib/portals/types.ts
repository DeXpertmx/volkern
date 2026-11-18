/**
 * Volkern — Sindicación multiportal: contrato de adaptador
 *
 * Un adaptador es lo ÚNICO que conoce el formato de un portal. Lee del registro
 * maestro (`catalogo_items` vía `InmuebleParsed`), devuelve el payload mapeado y
 * es capaz de construir/entregar el fichero. Nunca escribe en el maestro.
 *
 * El orquestador (`lib/portals/orchestrator.ts`) decide el tenant, cuándo
 * sincronizar y qué se registra; no conoce ningún dialecto.
 */

import type { InmuebleParsed } from '@/lib/real-estate/property-helpers'

export type PortalKey = 'kyero' | 'idealista_ftp' | 'fotocasa' | 'generic_url' | 'idealista_api'

/** `pull` = el portal descarga nuestro feed; `push` = nosotros subimos el fichero. */
export type PortalMode = 'pull' | 'push'

export interface PortalValidation {
  valid: boolean
  errors: string[]
}

/** Configuración no secreta guardada en `portal_connections.config`. */
export interface PortalConfig {
  /** Ubicación por defecto (el maestro no tiene país/provincia). */
  defaults?: {
    country?: string
    province?: string
    town?: string
  }
  /** Tipo de inmueble en español → tipo que espera el portal. */
  typeMap?: Record<string, string>
  /** URL pública base para enlazar la ficha del inmueble. */
  publicBaseUrl?: string
  /** Incluir inmuebles reservados / alquilados (por defecto NO). */
  includeReserved?: boolean
  includeRented?: boolean
  /** Notas internas del portal (no se publican salvo que el adaptador lo diga). */
  notes?: string
}

export interface PortalTenantInfo {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export interface MapContext {
  config: PortalConfig
  tenant: PortalTenantInfo
  propertyUrlBase: string
}

/** Resultado del mapeo de un inmueble. `payload` es lo que se hashea. */
export interface MappedProperty {
  /** Id interno del inmueble (clave de idempotencia). */
  propertyId: string
  /** Referencia visible que se envía al portal. */
  reference: string
  /** Payload normalizado; su JSON canónico alimenta el hash SHA-256. */
  payload: Record<string, unknown>
}

export interface DeliveryContext {
  config: PortalConfig
  tenant: PortalTenantInfo
  /** Credenciales ya descifradas. El adaptador no las persiste ni las loguea. */
  credentials: Record<string, string> | null
  connectionId: string
  now: Date
}

export interface DeliveryResult {
  ok: boolean
  /** Fichero entregable (feeds pull). Solo lo produce el adaptador. */
  document?: string
  /** Errores de entrega/validación del documento completo. */
  errors?: string[]
}

/**
 * Contrato obligatorio. `buildDocument` es la extensión que necesitan los
 * portales pull: el fichero que se sirve en `/feeds/{token}` también sale del
 * adaptador, nunca de la ruta.
 */
export interface PortalAdapter {
  key: PortalKey
  label: string
  mode: PortalMode
  supportsDelete: boolean
  /** Valida la configuración no secreta antes de tocar inmuebles. */
  validateConfig(config: PortalConfig): PortalValidation
  /** Mapea un inmueble. Devuelve `null` si no aplica y lanza `PortalSkipError` con el motivo. */
  mapProperty(property: InmuebleParsed, ctx: MapContext): MappedProperty | null
  /** Valida un payload ya mapeado (campos obligatorios, longitudes, enums). */
  validatePayload(payload: unknown): PortalValidation
  /** Construye y valida el documento completo. Lanza si el documento no es válido. */
  buildDocument(properties: MappedProperty[], ctx: DeliveryContext): Promise<string>
  /** Entrega el documento (subida FTP/SFTP/HTTP) o lo devuelve para servirlo. */
  deliver(properties: MappedProperty[], ctx: DeliveryContext): Promise<DeliveryResult>
}

/**
 * Un inmueble que no puede publicarse por una regla del portal (moneda no
 * soportada, operación no admitida…). No es un fallo: cuenta como omitido.
 */
export class PortalSkipError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'PortalSkipError'
  }
}

export class PortalConfigError extends Error {
  constructor(
    message: string,
    public readonly errors: string[] = []
  ) {
    super(message)
    this.name = 'PortalConfigError'
  }
}

/** Error de validación del documento completo: el feed no debe servirse. */
export class PortalFeedError extends Error {
  constructor(
    message: string,
    public readonly errors: string[] = []
  ) {
    super(message)
    this.name = 'PortalFeedError'
  }
}
