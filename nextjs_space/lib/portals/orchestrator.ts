/**
 * Orquestador de sindicación.
 *
 * Es el único punto que decide: qué tenant, qué portal, cuándo, y qué se
 * registra. No conoce ningún formato: pide al adaptador que mapee, valide y
 * entregue, y guarda el resultado en `portal_publications` / `portal_sync_logs`.
 *
 * Garantías:
 *  · Todo se lee filtrando por `tenantId` (registro maestro y conexión).
 *  · Solo salen inmuebles con `publicable_portales` y estado publicable.
 *  · Idempotencia por SHA-256 del payload mapeado: si no cambia, no se reenvía.
 *  · Nunca se sirve un documento que el adaptador no haya validado.
 *  · Las credenciales se descifran aquí y no se loguean ni se devuelven.
 */

import * as crypto from 'crypto'
import type { PortalConnection } from '@prisma/client'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { parseInmueble, type InmuebleParsed } from '@/lib/real-estate/property-helpers'
import { decryptPortalCredentials } from './crypto'
import { normalizarConfig } from './connections'
import { getAdapter } from './registry'
import {
  PortalConfigError,
  PortalFeedError,
  PortalSkipError,
  type DeliveryContext,
  type MappedProperty,
  type PortalAdapter,
  type PortalConfig,
} from './types'

/** Estados que nunca se publican, en cualquier portal. */
const ESTADOS_EXCLUIDOS = ['vendida', 'vendido', 'retirada', 'retirado', 'suspendida', 'suspendido']

/** Únicos estados en los que la ficha consta como entregada en el portal. */
const ESTADOS_ENTREGADOS = ['published', 'updated']

export interface PortalSyncOptions {
  tenantId: string
  portalKey: string
  trigger: 'cron' | 'manual' | 'feed'
}

export interface PortalSyncResult {
  portalKey: string
  status: 'success' | 'partial' | 'error' | 'skipped'
  propertiesTotal: number
  published: number
  updated: number
  unchanged: number
  skipped: Array<{ propertyId: string; reason: string }>
  failed: Array<{ propertyId: string; error: string }>
  removed: number
  document?: string
  error?: string
}

export class PortalNotConfiguredError extends Error {
  constructor(portalKey: string) {
    super(`El portal ${portalKey} no está configurado para esta cuenta.`)
    this.name = 'PortalNotConfiguredError'
  }
}

function normalizarEstado(valor: string | null | undefined): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function estaExcluido(property: InmuebleParsed, config: PortalConfig): boolean {
  const estado = normalizarEstado(property.status)
  if (ESTADOS_EXCLUIDOS.includes(estado)) return true
  if (estado === 'reservada' || estado === 'reservado') return config.includeReserved !== true
  if (estado === 'alquilada' || estado === 'alquilado') return config.includeRented !== true
  return false
}

/** JSON canónico: el mismo payload produce siempre el mismo hash. */
function hashPayload(payload: Record<string, unknown>): string {
  const ordenado = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, clave) => {
      acc[clave] = payload[clave]
      return acc
    }, {})
  return crypto.createHash('sha256').update(JSON.stringify(ordenado)).digest('hex')
}

function basePublica(config: PortalConfig): string {
  return (
    config.publicBaseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://volkern.app'
  ).replace(/\/$/, '')
}

async function cargarTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, nombre: true, billingEmail: true },
  })
  if (!tenant) throw new Error(`Cuenta no encontrada: ${tenantId}`)
  return {
    id: tenant.id,
    name: tenant.nombre,
    email: tenant.billingEmail ?? null,
    phone: null,
  }
}

async function cargarConexion(tenantId: string, portalKey: string): Promise<PortalConnection> {
  const connection = await prisma.portalConnection.findUnique({
    where: { tenantId_portalKey: { tenantId, portalKey } },
  })
  if (!connection) throw new PortalNotConfiguredError(portalKey)
  return connection
}

function contextoDe(
  connection: PortalConnection,
  config: PortalConfig,
  tenant: DeliveryContext['tenant'],
  credentials: Record<string, string> | null,
  now: Date
): DeliveryContext {
  return {
    config,
    tenant,
    credentials,
    connectionId: connection.id,
    now,
  }
}

/**
 * Ejecuta una sincronización completa y deja rastro en las tres tablas.
 * Lanza si la conexión no existe o la configuración es inválida; los fallos de
 * inmuebles concretos no abortan el resto (se cuentan en `failed`).
 */
export async function runPortalSync(options: PortalSyncOptions): Promise<PortalSyncResult> {
  const { tenantId, portalKey, trigger } = options
  const adapter: PortalAdapter | null = getAdapter(portalKey)
  if (!adapter) throw new PortalConfigError(`Portal no soportado: ${portalKey}`)

  const connection = await cargarConexion(tenantId, portalKey)

  if (!connection.enabled && trigger !== 'manual') {
    return {
      portalKey,
      status: 'skipped',
      propertiesTotal: 0,
      published: 0,
      updated: 0,
      unchanged: 0,
      skipped: [],
      failed: [],
      removed: 0,
    }
  }

  const config = normalizarConfig(connection.config)
  const configCheck = adapter.validateConfig(config)
  if (!configCheck.valid) {
    throw new PortalConfigError('Configuración del portal incompleta', configCheck.errors)
  }

  const credentials = connection.credentialsEnc
    ? decryptPortalCredentials(connection.credentialsEnc)
    : null

  const tenant = await cargarTenant(tenantId)
  const startedAt = new Date()
  const now = new Date()
  const ctx = contextoDe(connection, config, tenant, credentials, now)

  const log = await prisma.portalSyncLog.create({
    data: {
      tenantId,
      portalKey,
      connectionId: connection.id,
      trigger,
      status: 'running',
      startedAt,
    },
  })

  const items = await prisma.catalogoItem.findMany({
    where: { tenantId, tipo: 'inmueble', activo: true },
    orderBy: { fechaCreacion: 'desc' },
  })

  const publicables = items
    .map(parseInmueble)
    .filter((p) => p.publicableEnPortales && !estaExcluido(p, config))

  const mapeados: MappedProperty[] = []
  const skipped: PortalSyncResult['skipped'] = []
  const failed: PortalSyncResult['failed'] = []

  for (const property of publicables) {
    try {
      const mapped = adapter.mapProperty(property, {
        config,
        tenant,
        propertyUrlBase: basePublica(config),
      })
      if (!mapped) {
        skipped.push({ propertyId: property.id, reason: 'No aplica al portal' })
        continue
      }

      const check = adapter.validatePayload(mapped.payload)
      if (!check.valid) {
        failed.push({ propertyId: property.id, error: check.errors.join('; ') })
        continue
      }
      mapeados.push(mapped)
    } catch (err) {
      if (err instanceof PortalSkipError) {
        skipped.push({ propertyId: property.id, reason: err.reason })
      } else {
        failed.push({
          propertyId: property.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  const result: PortalSyncResult = {
    portalKey,
    status: 'success',
    propertiesTotal: publicables.length,
    published: 0,
    updated: 0,
    unchanged: 0,
    skipped,
    failed,
    removed: 0,
  }

  try {
    const delivery = await adapter.deliver(mapeados, ctx)
    if (!delivery.ok) {
      throw new PortalFeedError('El adaptador no pudo entregar el feed', delivery.errors || [])
    }
    result.document = delivery.document

    const existentes = await prisma.portalPublication.findMany({
      where: { tenantId, portalKey },
      select: { propertyId: true, status: true, lastPayloadHash: true },
    })
    const porInmueble = new Map(existentes.map((e) => [e.propertyId, e]))

    for (const mapped of mapeados) {
      const hash = hashPayload(mapped.payload)
      const previa = porInmueble.get(mapped.propertyId)

      // Solo está «sin cambios» si la ficha ya consta entregada: una `removed`
      // debe volver a enviarse aunque el payload sea idéntico.
      const yaEntregada = previa
        ? ESTADOS_ENTREGADOS.includes(previa.status) && previa.lastPayloadHash === hash
        : false
      if (yaEntregada) {
        result.unchanged++
        continue
      }

      const esNueva = !previa
      await prisma.portalPublication.upsert({
        where: {
          tenantId_propertyId_portalKey: {
            tenantId,
            propertyId: mapped.propertyId,
            portalKey,
          },
        },
        create: {
          tenantId,
          propertyId: mapped.propertyId,
          portalKey,
          externalId: mapped.reference,
          status: 'published',
          lastPayloadHash: hash,
          lastDeliveredAt: now,
          attempts: 1,
        },
        update: {
          externalId: mapped.reference,
          status: 'updated',
          lastPayloadHash: hash,
          lastDeliveredAt: now,
          lastError: null,
          attempts: { increment: 1 },
        },
      })

      if (esNueva) result.published++
      else result.updated++
    }

    // Feed absoluto: lo que ya no aparece se considera retirado del portal.
    const vigentes = new Set(mapeados.map((m) => m.propertyId))
    for (const previa of existentes) {
      if (vigentes.has(previa.propertyId)) continue
      if (!ESTADOS_ENTREGADOS.includes(previa.status)) continue

      await prisma.portalPublication.update({
        where: {
          tenantId_propertyId_portalKey: {
            tenantId,
            propertyId: previa.propertyId,
            portalKey,
          },
        },
        data: { status: 'removed', lastError: null },
      })
      result.removed++
    }

    result.status = failed.length > 0 ? 'partial' : 'success'

    await prisma.portalConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: startedAt,
        lastSuccessAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
      },
    })

    await prisma.portalSyncLog.update({
      where: { id: log.id },
      data: {
        status: result.status,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        propertiesTotal: result.propertiesTotal,
        propertiesPublished: result.published,
        propertiesUpdated: result.updated,
        propertiesUnchanged: result.unchanged,
        propertiesSkipped: result.skipped.length,
        propertiesFailed: result.failed.length,
        propertiesRemoved: result.removed,
        details: {
          skipped: result.skipped.slice(0, 25),
          failed: result.failed.slice(0, 25),
        },
      },
    })

    logger.info(
      {
        tenantId,
        portalKey,
        trigger,
        published: result.published,
        updated: result.updated,
        unchanged: result.unchanged,
        skipped: result.skipped.length,
        failed: result.failed.length,
        removed: result.removed,
      },
      '[portals] Sincronización completada'
    )

    return result
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)

    await prisma.portalConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: startedAt,
        lastError: mensaje.slice(0, 500),
        consecutiveFailures: { increment: 1 },
      },
    })

    await prisma.portalSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'error',
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        propertiesTotal: result.propertiesTotal,
        propertiesPublished: result.published,
        propertiesUpdated: result.updated,
        propertiesUnchanged: result.unchanged,
        propertiesSkipped: result.skipped.length,
        propertiesFailed: result.failed.length,
        errorMessage: mensaje.slice(0, 1000),
        details: { errors: err instanceof PortalFeedError ? err.errors : [] },
      },
    })

    logger.error({ tenantId, portalKey, trigger, err }, '[portals] Sincronización fallida')
    throw err
  }
}

/**
 * Feed público: se regenera en cada petición (Kyero lo descarga a diario) y se
 * registra como sincronización `feed`. Si el documento no valida, la ruta
 * devuelve 500 y no sirve XML inválido.
 */
export async function generarFeedDeToken(
  token: string
): Promise<{ document: string; connection: PortalConnection }> {
  const connection = await prisma.portalConnection.findFirst({
    where: {
      feedToken: token,
      feedTokenRevokedAt: null,
      enabled: true,
    },
  })
  if (!connection) throw new PortalNotConfiguredError('feed')

  const result = await runPortalSync({
    tenantId: connection.tenantId,
    portalKey: connection.portalKey,
    trigger: 'feed',
  })

  if (!result.document) {
    throw new PortalFeedError('El portal no genera documento servible (no es un feed pull).')
  }
  return { document: result.document, connection }
}
