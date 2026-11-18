/**
 * Conexiones de portal: normalización de configuración, tokens de feed y DTO
 * seguro para la API.
 *
 * Regla dura: las credenciales nunca salen de aquí. El DTO expone
 * `has_credentials` y, como mucho, el token del feed (que es la URL que el
 * cliente debe copiar para dársela al portal).
 */

import * as crypto from 'crypto'
import type { PortalConnection } from '@prisma/client'
import { isPortalCryptoConfigured } from './crypto'
import type { PortalConfig } from './types'

export const FRECUENCIA_MINIMA_MINUTOS = 60
export const FRECUENCIA_MAXIMA_MINUTOS = 7 * 24 * 60

/** 32 bytes → 43 caracteres base64url: suficiente para que no sea adivinable. */
export function generarFeedToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function normalizarFrecuencia(valor: unknown, porDefecto = 360): number {
  const n = Number(valor)
  if (!Number.isFinite(n)) return porDefecto
  return Math.min(FRECUENCIA_MAXIMA_MINUTOS, Math.max(FRECUENCIA_MINIMA_MINUTOS, Math.round(n)))
}

/**
 * Solo se guardan las claves conocidas de `PortalConfig`: la configuración
 * viene del panel y no debe poder inyectar propiedades arbitrarias.
 */
export function normalizarConfig(entrada: unknown): PortalConfig {
  const raw = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, any>
  const defaultsRaw = (raw.defaults && typeof raw.defaults === 'object' ? raw.defaults : {}) as Record<string, any>

  const texto = (valor: unknown): string | undefined => {
    if (typeof valor !== 'string') return undefined
    const limpio = valor.trim()
    return limpio.length > 0 ? limpio.slice(0, 120) : undefined
  }

  const typeMap: Record<string, string> = {}
  if (raw.typeMap && typeof raw.typeMap === 'object' && !Array.isArray(raw.typeMap)) {
    for (const [origen, destino] of Object.entries(raw.typeMap as Record<string, unknown>)) {
      if (typeof destino === 'string' && destino.trim()) {
        typeMap[String(origen).slice(0, 60)] = destino.trim().slice(0, 60)
      }
    }
  }

  const config: PortalConfig = {
    defaults: {
      country: texto(defaultsRaw.country),
      province: texto(defaultsRaw.province),
      town: texto(defaultsRaw.town),
    },
    typeMap,
    publicBaseUrl: texto(raw.publicBaseUrl),
    includeReserved: raw.includeReserved === true,
    includeRented: raw.includeRented === true,
    notes: texto(raw.notes),
  }

  return config
}

/** URL pública del feed. Solo tiene sentido en portales pull con token vigente. */
export function feedUrlDe(connection: PortalConnection): string | null {
  if (!connection.feedToken || connection.feedTokenRevokedAt) return null
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/$/, '')
  return `${base}/feeds/${connection.feedToken}`
}

export interface PortalConnectionDTO {
  portalKey: string
  enabled: boolean
  config: PortalConfig
  syncFrequencyMinutes: number
  hasCredentials: boolean
  feedUrl: string | null
  feedTokenRevoked: boolean
  cryptoConfigured: boolean
  lastSyncAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  consecutiveFailures: number
}

export function conexionDTO(connection: PortalConnection): PortalConnectionDTO {
  return {
    portalKey: connection.portalKey,
    enabled: connection.enabled,
    config: normalizarConfig(connection.config),
    syncFrequencyMinutes: connection.syncFrequencyMinutes,
    hasCredentials: Boolean(connection.credentialsEnc),
    feedUrl: feedUrlDe(connection),
    feedTokenRevoked: Boolean(connection.feedTokenRevokedAt),
    cryptoConfigured: isPortalCryptoConfigured(),
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastSuccessAt: connection.lastSuccessAt?.toISOString() ?? null,
    lastError: connection.lastError,
    consecutiveFailures: connection.consecutiveFailures,
  }
}
